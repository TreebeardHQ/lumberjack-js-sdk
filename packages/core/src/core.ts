import { EventEmitter } from 'events';
import { TreebeardConfig, LogEntry, LogLevelType } from './types.js';
import { TreebeardContext } from './context.js';

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
      apiKey: config.apiKey || process.env.TREEBEARD_API_KEY || '',
      endpoint: config.endpoint || process.env.TREEBEARD_ENDPOINT || 'https://api.treebeardhq.com/logs/batch',
      projectName: config.projectName || 'js-app',
      batchSize: config.batchSize || 100,
      batchAge: config.batchAge || 5000,
      flushInterval: config.flushInterval || 30000,
      captureConsole: config.captureConsole || false,
      captureUnhandled: config.captureUnhandled !== false
    };

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
    if (!this.config.captureUnhandled) return;

    process.on('uncaughtException', (error: Error) => {
      this.logError('Uncaught Exception', error);
      this.flush().finally(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.logError('Unhandled Promise Rejection', error, { promise: promise.toString() });
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event: ErrorEvent) => {
        this.logError('Global Error', event.error || new Error(event.message), {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });

      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        this.logError('Unhandled Promise Rejection', error);
      });
    }
  }

  private enableConsoleCapture(): void {
    const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
    
    levels.forEach(level => {
      this.originalConsoleMethods[level] = console[level];
      console[level] = (...args: any[]) => {
        this.originalConsoleMethods[level](...args);
        
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const logLevel: LogLevelType = level === 'log' ? 'info' : level as LogLevelType;
        this.log(logLevel, message, { source: 'console' });
      };
    });
  }

  private disableConsoleCapture(): void {
    Object.keys(this.originalConsoleMethods).forEach(level => {
      (console as any)[level] = this.originalConsoleMethods[level];
    });
    this.originalConsoleMethods = {};
  }

  private getCallerInfo(): { file?: string; line?: number; function?: string } {
    const error = new Error();
    const stack = error.stack?.split('\\n') || [];
    
    for (let i = 3; i < stack.length; i++) {
      const frame = stack[i];
      if (frame && !frame.includes('treebeard') && !frame.includes('node_modules')) {
        const match = frame.match(/at\\s+(.*)\\s+\\((.+):(\\d+):(\\d+)\\)|at\\s+(.+):(\\d+):(\\d+)/);
        if (match) {
          const functionName = match[1] || 'anonymous';
          const file = match[2] || match[5];
          const line = parseInt(match[3] || match[6]);
          
          return { file, line, function: functionName };
        }
      }
    }
    
    return {};
  }

  log(level: LogLevelType, message: string, metadata: Record<string, any> = {}): void {
    if (this.isShuttingDown) return;

    const context = TreebeardContext.getStore();
    const caller = this.getCallerInfo();
    
    const logEntry: LogEntry = {
      message,
      level,
      timestamp: Date.now(),
      traceId: context?.traceId || TreebeardContext.generateTraceId(),
      ...(context?.spanId && { spanId: context.spanId }),
      source: metadata.source || 'treebeard-js',
      ...caller,
      ...metadata
    };

    this.logBuffer.push(logEntry);

    if (this.logBuffer.length >= this.config.batchSize) {
      this.flush();
    }

    this.emit('log', logEntry);
  }

  logError(message: string, error: Error, metadata: Record<string, any> = {}): void {
    const errorMetadata = {
      ...metadata,
      exception: {
        name: error.name,
        message: error.message,
        stack: error.stack || ''
      }
    };

    this.log('error', message, errorMetadata);
  }

  trace(message: string, metadata?: Record<string, any>): void {
    this.log('trace', message, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata);
  }

  fatal(message: string, metadata?: Record<string, any>): void {
    this.log('fatal', message, metadata);
  }

  startTrace(name: string, metadata: Record<string, any> = {}): string {
    const traceId = TreebeardContext.generateTraceId();
    const spanId = TreebeardContext.generateSpanId();
    
    const context = {
      traceId,
      spanId,
      traceName: name,
      ...metadata
    };

    TreebeardContext.run(context, () => {
      this.info(`Starting trace: ${name}`, {
        ...metadata,
        _traceStart: true,
        traceName: name
      });
    });

    return traceId;
  }

  endTrace(success = true, metadata: Record<string, any> = {}): void {
    const context = TreebeardContext.getStore();
    if (!context?.traceName) return;

    const message = success 
      ? `Completed trace: ${context.traceName}`
      : `Failed trace: ${context.traceName}`;

    this.log(success ? 'info' : 'error', message, {
      ...metadata,
      _traceEnd: true,
      traceName: context.traceName,
      success
    });

    TreebeardContext.clear();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logs = [...this.logBuffer];
    this.logBuffer = [];

    if (!this.config.apiKey) {
      console.warn('Treebeard: No API key provided - logs will be output to console');
      logs.forEach(log => console.log(JSON.stringify(log)));
      return;
    }

    try {
      const payload = {
        logs,
        project_name: this.config.projectName,
        sdk_version: '0.1.0'
      };

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`Treebeard: Failed to send logs: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Treebeard: Error sending logs:', error);
      this.logBuffer.unshift(...logs);
    }
  }

  async shutdown(): Promise<void> {
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