import { EventEmitter } from "events";
import { TreebeardContext } from "./context.js";
import { detectRuntime, getEnvironmentValue } from "./runtime.js";
import { LogEntry, LogLevelType, TreebeardConfig } from "./types.js";
import { getCallerInfo } from "./util/get-caller-info.js";

export class TreebeardCore extends EventEmitter {
  private static instance: TreebeardCore | null = null;

  private config!: Required<TreebeardConfig>;
  private logBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private originalConsoleMethods: Record<string, Function> = {};
  private isShuttingDown = false;

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

    this.setupGlobalExceptionHandling();
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

  private setupGlobalExceptionHandling(): void {
    if (!this.config.captureUnhandled) {
      if (this.config.debug) {
        console.log(
          "[Treebeard] Skipping global exception handling (disabled)"
        );
      }
      return;
    }

    const runtime = detectRuntime();

    if (this.config.debug) {
      console.log(
        "[Treebeard] Setting up global exception handling for runtime:",
        runtime
      );
    }

    // Node.js environment
    if (runtime.isNode && runtime.hasProcess) {
      process.on("uncaughtException", (error: Error) => {
        this.logError("Uncaught Exception", error);
        this.flush().finally(() => {
          process.exit(1);
        });
      });

      process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
        const error =
          reason instanceof Error ? reason : new Error(String(reason));
        this.logError("Unhandled Promise Rejection", error, {
          promise: promise.toString(),
        });
      });
    }

    // Browser environment
    if (runtime.isBrowser && runtime.hasWindow) {
      window.addEventListener("error", (event: ErrorEvent) => {
        this.logError("Global Error", event.error || new Error(event.message), {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      });

      window.addEventListener(
        "unhandledrejection",
        (event: PromiseRejectionEvent) => {
          const error =
            event.reason instanceof Error
              ? event.reason
              : new Error(String(event.reason));
          this.logError("Unhandled Promise Rejection", error);
        }
      );
    }

    // Edge Runtime environment (limited capabilities)
    if (runtime.isEdgeRuntime) {
      // In Edge Runtime, we can only capture unhandled promise rejections
      // using a global handler if available
      if (typeof addEventListener === "function") {
        addEventListener("unhandledrejection", (event: any) => {
          const error =
            event.reason instanceof Error
              ? event.reason
              : new Error(String(event.reason));
          this.logError("Unhandled Promise Rejection (Edge)", error);
        });
      }
    }
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

        this.log(logLevel, message, {
          source: "console",
          attributes,
          exception: Object.keys(errorInfo).length > 0 ? errorInfo : undefined,
        });
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
    metadata: Record<string, any> = {}
  ): void {
    if (this.isShuttingDown) return;

    const context = TreebeardContext.getStore();
    const caller = getCallerInfo(2);

    const logEntry: LogEntry = {
      message,
      level,

      timestamp: Date.now(),
      traceId: metadata.traceId || context?.traceId,
      ...((metadata.spanId || context?.spanId) && {
        spanId: metadata.spanId || context?.spanId,
      }),
      source: metadata.source || "treebeard-js",
      ...caller,
      props: {
        ...metadata,
        tn: metadata.traceName || context?.traceName,
      },
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
    const errorMetadata = {
      ...metadata,
      exception: {
        name: error.name,
        message: error.message,
        stack: error.stack || "",
      },
    };

    this.log("error", message, errorMetadata);
  }

  trace(message: string, metadata?: Record<string, any>): void {
    this.log("trace", message, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log("error", message, metadata);
  }

  fatal(message: string, metadata?: Record<string, any>): void {
    this.log("fatal", message, metadata);
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

    this.log(level, message, {
      ...metadata,
      traceId,
      ...(spanId && { spanId }),
      _traceEnd: true,
      success,
    });
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
