import { EventEmitter } from "events";
import { TreebeardContext } from "./context.js";
import { detectRuntime, getEnvironmentValue } from "./runtime.js";
import { getCommitSha, getEnvironmentInfo } from "./environment.js";
import { LogEntry, LogLevelType, TraceContext, TreebeardConfig } from "./types.js";
import { getCallerInfo } from "./util/get-caller-info.js";
import { ObjectBatch, RegisteredObject } from "./object-batch.js";
import { Gatekeeper } from "./gatekeeper.js";
import type { Exporter, EnrichedLogEntry, EnrichedRegisteredObject } from "./exporter.js";
import { HttpExporter } from "./http-exporter.js";

export class TreebeardCore extends EventEmitter {
  private static instance: TreebeardCore | null = null;

  private config!: Required<Omit<TreebeardConfig, 'exporter'>> & { exporter?: Exporter | undefined };
  private logBuffer: LogEntry[] = [];
  private objectBatch: ObjectBatch | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private originalConsoleMethods: Record<string, Function> = {};
  private isShuttingDown = false;
  private injectionCallbacks: Map<string, () => { traceContext?: Partial<TraceContext>; metadata?: Record<string, any> }> = new Map();
  private objectCache: Map<string, string> = new Map();
  private _gatekeeper: Gatekeeper | null = null;
  private exporter!: Exporter;

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
      serviceToken: config.serviceToken || getEnvironmentValue("TREEBEARD_SERVICE_TOKEN") || "",
      gatekeeperEndpoint: config.gatekeeperEndpoint || getEnvironmentValue("TREEBEARD_GATEKEEPER_ENDPOINT") || "https://api.treebeardhq.com/gatekeeper",
      exporter: config.exporter || undefined,
    };

    if (this.config.debug) {
      const envInfo = getEnvironmentInfo();
      console.log("[Treebeard] Initializing SDK with config:", {
        ...this.config,
        apiKey: this.config.apiKey ? "[REDACTED]" : "none",
      });
      console.log("[Treebeard] Environment context:", envInfo);
    }

    // Initialize exporter - use provided exporter or create default HttpExporter
    this.exporter = config.exporter || new HttpExporter({
      apiKey: this.config.apiKey,
      endpoint: this.config.endpoint,
      projectName: this.config.projectName
    });

    this.objectBatch = new ObjectBatch(this.config.batchSize, this.config.batchAge);
    
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

  registerObject(obj?: any): void {
    if (this.isShuttingDown) return;

    if (!obj) {
      if (this.config.debug) {
        console.warn("[Treebeard] No object provided for registration");
      }
      return;
    }

    // Check if obj is a record (plain object) where keys should be used as names
    if (this.isPlainRecord(obj)) {
      // Handle record registration - register each key-value pair
      for (const [key, value] of Object.entries(obj)) {
        const formattedObj = this.formatObject(value, key);
        if (formattedObj) {
          // Always attach to context regardless of cache status
          this.attachToContext(formattedObj);
          
          // Check cache before adding to batch
          if (this.shouldRegisterObject(formattedObj)) {
            if (this.objectBatch?.add(formattedObj)) {
              this.flushObjects();
            }
          }
        }
      }
    } else {
      // Handle single object registration
      const formattedObj = this.formatObject(obj);
      if (formattedObj) {
        // Always attach to context regardless of cache status
        this.attachToContext(formattedObj);
        
        // Check cache before adding to batch
        if (this.shouldRegisterObject(formattedObj)) {
          if (this.objectBatch?.add(formattedObj)) {
            this.flushObjects();
          }
        }
      }
    }
  }

  static register(obj?: any): void {
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.registerObject(obj);
    }
  }

  private isPlainRecord(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) return false;
    
    // If it has an 'id' field, treat it as a single object to register
    if (obj.id !== undefined) return false;
    
    // Check if it's a plain Object literal (constructor is Object)
    // This handles cases like { user: userObject, product: productObject }
    if (obj.constructor === Object) return true;
    
    // Don't treat class instances as records
    return false;
  }

  private formatObject(objData: any, forcedName?: string): RegisteredObject | null {
    if (!objData) return null;

    let objDict: Record<string, any>;
    let className: string | null = null;

    // Convert object to dict if needed
    if (typeof objData !== 'object' || objData === null) {
      if (this.config.debug) {
        console.warn("[Treebeard] Cannot register non-object data");
      }
      return null;
    }

    if (Array.isArray(objData)) {
      if (this.config.debug) {
        console.warn("[Treebeard] Cannot register array directly");
      }
      return null;
    }

    // Get class name if it's a class instance
    if (objData.constructor && objData.constructor.name !== 'Object') {
      className = objData.constructor.name;
    }

    // Convert to plain object
    objDict = { ...objData };

    // Check for ID field and warn if missing
    if (!objDict.id) {
      if (this.config.debug) {
        console.warn("[Treebeard] Object registered without 'id' field. This may cause issues with object tracking.");
      }
      return null;
    }

    // Use forced name (from record key), then explicit name, then class name
    let name: string | undefined = forcedName || objDict.name;
    if (!name && className) {
      name = className.toLowerCase();
    }

    const objId = objDict.id;

    // Validate and filter fields
    const fields: Record<string, any> = {};
    for (const [key, value] of Object.entries(objDict)) {
      if (key === 'name' || key === 'id') {
        continue;
      }

      const fieldValue = this.formatField(key, value);
      if (fieldValue !== null) {
        fields[key] = fieldValue;
      }
    }

    return {
      name,
      id: objId,
      fields
    };
  }

  private formatField(_key: string, value: any): any {
    // Check for numbers
    if (typeof value === 'number') {
      return value;
    }

    // Check for booleans
    if (typeof value === 'boolean') {
      return value;
    }

    // Check for dates
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Check for searchable strings (under 1024 chars)
    if (typeof value === 'string') {
      if (value.length <= 1024) {
        // Simple heuristic: if it looks like metadata (short, no newlines)
        // rather than body text
        const valid = !value.includes('\n') && !value.includes('\r');
        if (valid) {
          return value;
        }
      }
    }

    // Check for plain objects (allow nested objects)
    if (value && typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
      return value;
    }

    return null;
  }

  private shouldRegisterObject(formattedObj: RegisteredObject): boolean {
    const objId = formattedObj.id;
    const checksum = this.calculateObjectChecksum(formattedObj);
    
    // Check if we've seen this object with this exact data before
    const cachedChecksum = this.objectCache.get(objId);
    
    if (cachedChecksum === checksum) {
      if (this.config.debug) {
        console.log(`[Treebeard] Object ${objId} unchanged (checksum: ${checksum.substring(0, 8)}...), skipping registration`);
      }
      return false;
    }
    
    // Object is new or changed, update cache
    this.objectCache.set(objId, checksum);
    
    if (this.config.debug) {
      console.log(`[Treebeard] Object ${objId} ${cachedChecksum ? 'changed' : 'new'} (checksum: ${checksum.substring(0, 8)}...), will register`);
    }
    
    return true;
  }

  private calculateObjectChecksum(formattedObj: RegisteredObject): string {
    // Create a stable string representation for hashing
    const dataToHash = {
      name: formattedObj.name,
      id: formattedObj.id,
      fields: formattedObj.fields
    };
    
    // Sort fields to ensure consistent ordering
    const sortedFields: Record<string, any> = {};
    Object.keys(dataToHash.fields || {})
      .sort()
      .forEach(key => {
        sortedFields[key] = dataToHash.fields[key];
      });
    
    const normalizedData = {
      ...dataToHash,
      fields: sortedFields
    };
    
    // Simple hash function (djb2 algorithm)
    const str = JSON.stringify(normalizedData);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash).toString(16);
  }

  private attachToContext(formattedObj: RegisteredObject): void {
    const objectName = formattedObj.name;
    const objectId = formattedObj.id;

    if (objectName && objectId) {
      // Create context key as {name}_id
      const contextKey = `${objectName}_id`;

      // Set the context value to the object's ID
      const context = TreebeardContext.getStore();
      if (context) {
        const newContext = { ...context, [contextKey]: objectId };
        TreebeardContext.run(newContext, () => {
          // Context is now updated with object ID
        });
      }

      if (this.config.debug) {
        console.log(`[Treebeard] Attached object to context: ${contextKey} = ${objectId}`);
      }
    }
  }

  flushObjects(): number {
    if (!this.objectBatch) {
      if (this.config.debug) {
        console.log("[Treebeard] Object batch not initialized");
      }
      return 0;
    }

    const objects = this.objectBatch.getObjects();
    const count = objects.length;
    if (objects.length > 0) {
      // Fire and forget - don't await to maintain non-blocking behavior
      this.sendObjects(objects).catch(error => {
        console.error("[Treebeard]: Error in flushObjects:", error);
      });
    }

    return count;
  }

  private async sendObjects(objects: RegisteredObject[]): Promise<void> {
    if (objects.length === 0) {
      return;
    }

    const commitSha = getCommitSha();

    // Transform objects to include metadata
    const transformedObjects: EnrichedRegisteredObject[] = objects.map(obj => ({
      ...obj,
      project_name: this.config.projectName,
      sdk_version: "2",
      commit_sha: commitSha,
    }));

    if (this.config.debug) {
      console.log(`[Treebeard] Sending ${objects.length} objects`);
    }

    const result = await this.exporter.exportObjects(transformedObjects);

    if (!result.success) {
      console.error("[Treebeard]: Failed to send objects:", result.error?.message);
    } else if (this.config.debug) {
      console.log(`[Treebeard] Successfully sent ${result.itemsExported} objects`);
    }
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

    const commitSha = getCommitSha();

    // Transform logs to API format with additional metadata
    const transformedLogs: EnrichedLogEntry[] = logs.map((log) => ({
      ...log,
      // Add API-specific fields
      msg: log.message,
      lvl: log.level,
      ts: log.timestamp,
      fl: log.file,
      ln: log.line,
      tb: log.exception?.stack,
      src: log.source,
      tid: log.traceId,
      exv: log.exception?.message,
      ext: log.exception?.name,
      fn: log.function,
      // Metadata
      project_name: this.config.projectName,
      sdk_version: "2",
      commit_sha: commitSha,
    }));

    const result = await this.exporter.exportLogs(transformedLogs);

    if (!result.success) {
      console.error("[Treebeard]: Failed to send logs:", result.error?.message);
      if (this.config.debug) {
        console.log("[Treebeard] Re-queuing logs due to error");
      }
      // Re-queue logs on failure
      this.logBuffer.unshift(...logs);
    } else if (this.config.debug) {
      console.log(`[Treebeard] Successfully sent ${result.itemsExported} logs`);
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

  getConfig(): Required<Omit<TreebeardConfig, 'exporter'>> & { exporter?: Exporter | undefined } {
    return this.config;
  }

  get gatekeeper(): Gatekeeper {
    if (!this._gatekeeper) {
      this._gatekeeper = new Gatekeeper(this);
    }
    return this._gatekeeper;
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
    this.flushObjects();
    
    
    // Clear object cache
    this.objectCache.clear();

    TreebeardCore.instance = null;
  }
}
