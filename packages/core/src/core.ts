import { EventEmitter } from "events";
import { TreebeardContext } from "./context.js";
import { detectRuntime, getEnvironmentValue } from "./runtime.js";
import { LogEntry, LogLevelType, TraceContext, TreebeardConfig } from "./types.js";
import { getCallerInfo } from "./util/get-caller-info.js";

export class TreebeardCore extends EventEmitter {
  private static instance: TreebeardCore | null = null;

  private config!: Required<TreebeardConfig>;
  private logBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private originalConsoleMethods: Record<string, Function> = {};
  private isShuttingDown = false;
  private injectionCallbacks: Map<string, () => { traceContext?: Partial<TraceContext>; metadata?: Record<string, any> }> = new Map();

  constructor(config: TreebeardConfig = {}) {
    super();

    if (TreebeardCore.instance) {
      return TreebeardCore.instance;
    }

    this.config = {
      apiKey: config.apiKey || getEnvironmentValue("TREEBEARD_API_KEY") || "",
      endpoint:
        config.endpoint ||
        getEnvironmentValue("TREEBEARD_ENDPOINT") ||
        "https://api.treebeardhq.com/logs/batch",
      projectName: config.projectName || "js-app",
      batchSize: config.batchSize || 100,
      batchAge: config.batchAge || 5000,
      flushInterval: config.flushInterval || 30000,
      captureConsole: config.captureConsole || false,
      captureUnhandled: config.captureUnhandled !== false,
      debug: config.debug || false,
    };

    if (this.config.debug) {
      console.log("[Treebeard] Initializing SDK with config:", {
        ...this.config,
        apiKey: this.config.apiKey ? "[REDACTED]" : "none",
      });
    }

    this.startFlushTimer();

    if (this.config.captureConsole) {
      this.enableConsoleCapture();
    }

    TreebeardCore.instance = this;
  }

  static init(config?: TreebeardConfig): TreebeardCore {
    return new TreebeardCore(config);
  }

  static getInstance(): TreebeardCore | null {
    return TreebeardCore.instance;
  }

  registerInjection(callback: () => { traceContext?: Partial<TraceContext>; metadata?: Record<string, any> }): string {
    const id = `injection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.injectionCallbacks.set(id, callback);
    return id;
  }

  unregisterInjection(id: string): boolean {
    return this.injectionCallbacks.delete(id);
  }

  private enableConsoleCapture(): void {
    if (this.config.debug) {
      console.log("[Treebeard] Enabling console capture");
    }

    const levels = ["log", "info", "warn", "error", "debug"] as const;

    levels.forEach((level) => {
      this.originalConsoleMethods[level] = console[level];
      console[level] = (...args: any[]) => {
        this.originalConsoleMethods[level](...args);

        let message = "";
        // if args[0] is a string, consider it the main message
        if (typeof args[0] === "string") {
          message = args[0];
        } else {
          message = JSON.stringify(args[0]);
        }

        // don't infinite loop
        if (message.includes("[Treebeard]")) {
          return;
        }
        let attributes: any[] = [];
        if (args.length > 1) {
          attributes = args.slice(1);
        }
        let errorInfo: Partial<{
          name: string;
          message: string;
          stack?: string | undefined;
          type: string;
        }> = {};
        for (const attribute of attributes) {
          if (attribute instanceof Error) {
            let name;

            if ("name" in attribute && attribute.name === "Error") {
              name = "Error";
            } else {
              name = attribute.constructor.name;
            }

            errorInfo = {
              name,
              message: attribute.message,
              stack: attribute.stack,
            };
          }
        }

        const logLevel: LogLevelType =
          level === "log" ? "info" : (level as LogLevelType);

        // For console capture, we want to skip our console interception wrapper
        // to get the actual application code that called console.log/error/etc
        const caller = getCallerInfo(1); // Skip the console wrapper to get actual caller

        this.log(logLevel, message, {
          source: "console",
          attributes,
          exception: Object.keys(errorInfo).length > 0 ? errorInfo : undefined,
        }, caller);
      };
    });
  }

  private disableConsoleCapture(): void {
    if (this.config.debug) {
      console.log("[Treebeard] Disabling console capture");
    }

    Object.keys(this.originalConsoleMethods).forEach((level) => {
      (console as any)[level] = this.originalConsoleMethods[level];
    });
    this.originalConsoleMethods = {};
  }

  log(
    level: LogLevelType,
    message: string,
    metadata: Record<string, any> = {},
    caller?: ReturnType<typeof getCallerInfo>
  ): void {
    if (this.isShuttingDown) return;

    const context = TreebeardContext.getStore();
    const callerInfo = caller || getCallerInfo(3); // fallback with deeper skip

    // Collect data from all injection callbacks
    let injectedTraceContext: Partial<TraceContext> = {};
    let injectedMetadata: Record<string, any> = {};

    for (const callback of this.injectionCallbacks.values()) {
      try {
        const result = callback();
        if (result.traceContext) {
          injectedTraceContext = { ...injectedTraceContext, ...result.traceContext };
        }
        if (result.metadata) {
          injectedMetadata = { ...injectedMetadata, ...result.metadata };
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn("[Treebeard] Injection callback failed:", error);
        }
      }
    }

    const logEntry: LogEntry = {
      message,
      level,

      timestamp: Date.now(),
      traceId: metadata.traceId || injectedTraceContext.traceId || context?.traceId,
      ...((metadata.spanId || injectedTraceContext.spanId || context?.spanId) && {
        spanId: metadata.spanId || injectedTraceContext.spanId || context?.spanId,
      }),
      source: metadata.source || "treebeard-js",
      ...callerInfo,
      props: {
        ...injectedMetadata,
        ...metadata,
        tn: metadata.traceName || injectedTraceContext.traceName || context?.traceName,
      },
      exception: metadata.exception,
    };

    if (this.config.debug) {
      console.log("[Treebeard] Adding log entry to buffer:", logEntry);
    }

    this.logBuffer.push(logEntry);

    if (this.logBuffer.length >= this.config.batchSize) {
      if (this.config.debug) {
        console.log(
          `[Treebeard] Buffer full (${this.logBuffer.length}/${this.config.batchSize}), triggering flush`
        );
      }
      this.flush();
    }

    this.emit("log", logEntry);
  }

  logError(
    message: string,
    error: Error,
    metadata: Record<string, any> = {}
  ): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    const errorMetadata = {
      ...metadata,
      exception: {
        name: error.name,
        message: error.message,
        stack: error.stack || "",
      },
    };

    this.log("error", message, errorMetadata, caller);
  }

  trace(message: string, metadata?: Record<string, any>): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("trace", message, metadata, caller);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("debug", message, metadata, caller);
  }

  info(message: string, metadata?: Record<string, any>): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("info", message, metadata, caller);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("warn", message, metadata, caller);
  }

  error(message: string, metadata?: Record<string, any>): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("error", message, metadata, caller);
  }

  fatal(message: string, metadata?: Record<string, any>): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("fatal", message, metadata, caller);
  }

  private startFlushTimer(): void {
    const runtime = detectRuntime();

    if (this.config.debug) {
      console.log(`[Treebeard] Setting up flush timer for runtime:`, runtime);
    }

    // Only set up intervals in Node.js environment
    // Edge Runtime has limited timer support
    if (runtime.isNode || runtime.isBrowser) {
      this.flushTimer = setInterval(() => {
        if (this.config.debug) {
          console.log("[Treebeard] Auto-flush triggered by timer");
        }
        this.flush();
      }, this.config.flushInterval);

      if (this.config.debug) {
        console.log(
          `[Treebeard] Flush timer started with interval: ${this.config.flushInterval}ms`
        );
      }
    } else {
      if (this.config.debug) {
        console.log(
          "[Treebeard] Skipping flush timer setup (not supported in this runtime)"
        );
      }
    }
  }

  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      if (this.config.debug) {
        console.log("[Treebeard] Flush called but buffer is empty");
      }
      return;
    }

    const logs = [...this.logBuffer];
    this.logBuffer = [];

    if (this.config.debug) {
      console.log(`[Treebeard] Flushing ${logs.length} log entries`);
    }

    if (!this.config.apiKey) {
      if (this.config.debug) {
        console.log(
          "[Treebeard] No API key provided - outputting logs to console"
        );
      }
      console.warn(
        "[Treebeard]: No API key provided - logs will be output to console"
      );
      logs.forEach((log) => console.log("[Treebeard]", JSON.stringify(log)));
      return;
    }

    try {
      const commitSha =
        getEnvironmentValue("TREEBEARD_COMMIT_SHA") ||
        getEnvironmentValue("VERCEL_GIT_COMMIT_SHA") ||
        getEnvironmentValue("GITHUB_SHA") ||
        getEnvironmentValue("CI_COMMIT_SHA") ||
        getEnvironmentValue("COMMIT_SHA");

      const payload = {
        logs: logs.map((log) => ({
          msg: log.message,
          lvl: log.level,
          ts: log.timestamp,
          fl: log.file,
          ln: log.line,
          tb: log.exception?.stack,
          src: log.source,
          props: log.props,
          tid: log.traceId,
          exv: log.exception?.message,
          ext: log.exception?.name,
          fn: log.function,
        })),
        project_name: this.config.projectName,
        sdk_version: "2",
        commit_sha: commitSha,
      };

      if (this.config.debug) {
        console.log(
          `[Treebeard] Sending ${logs.length} logs to:`,
          this.config.endpoint
        );
      }

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(
          `[Treebeard]: Failed to send logs: ${response.status} ${response.statusText}`
        );
        if (this.config.debug) {
          console.log("[Treebeard] Response details:", {
            status: response.status,
            statusText: response.statusText,
            headers: "Headers object",
          });
        }
      } else {
        if (this.config.debug) {
          console.log(`[Treebeard] Successfully sent ${logs.length} logs`);
        }
      }
    } catch (error) {
      console.error("[Treebeard]: Error sending logs:", error);
      if (this.config.debug) {
        console.log("[Treebeard] Re-queuing logs due to error");
      }
      this.logBuffer.unshift(...logs);
    }
  }

  startTrace(
    traceId: string,
    spanId: string,
    traceName: string,
    metadata: Record<string, any>
  ): void {
    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log("info", "Beginning {traceName}", {
      ...metadata,
      traceId,
      spanId,
      traceName,
      tb_i_tags: {
        tb_trace_start: true,
      },
    }, caller);
  }

  completeTrace(
    traceId: string,
    spanId?: string,
    success: boolean = true,
    metadata: Record<string, any> = {}
  ): void {
    const message = success
      ? "Request completed successfully"
      : "Request failed";
    const level = success ? "info" : "error";

    const tb_i_tags: Record<string, any> = {};

    if (success) {
      tb_i_tags.tb_trace_complete_success = true;
    } else {
      tb_i_tags.tb_trace_complete_error = false;
    }

    const caller = getCallerInfo(1); // Skip this method to get the actual caller
    this.log(level, message, {
      ...metadata,
      traceId,
      ...(spanId && { spanId }),

      success,
      tb_i_tags,
    }, caller);
  }

  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log("[Treebeard] Shutting down SDK");
    }

    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.disableConsoleCapture();
    await this.flush();

    TreebeardCore.instance = null;
  }
}
