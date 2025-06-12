export interface LogLevel {
  TRACE: "trace";
  DEBUG: "debug";
  INFO: "info";
  WARN: "warn";
  ERROR: "error";
  FATAL: "fatal";
}

export type LogLevelType =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

export interface LogEntry {
  message: string;
  level: LogLevelType;
  timestamp: number;
  traceId?: string;
  spanId?: string;
  source?: string;
  file?: string;
  line?: number;
  function?: string;
  exception?: {
    name: string;
    message: string;
    stack: string;
  };
  props?: Record<string, any>;
}

export interface LogEntryForAPI {
  msg: string;
  lvl: string;
  ts: number;
  fl?: string | undefined;
  ln?: number | undefined;
  tb?: string | undefined;
  src?: string | undefined;
  props?: Record<string, any> | undefined;
  tid?: string | undefined;
  exv?: string | undefined;
  ext?: string | undefined;
  fn?: string | undefined;
}

export interface TreebeardConfig {
  apiKey?: string;
  endpoint?: string;
  projectName?: string;
  batchSize?: number;
  batchAge?: number;
  flushInterval?: number;
  captureConsole?: boolean;
  captureUnhandled?: boolean;
  debug?: boolean;
}

export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  traceName?: string;
  [key: string]: any;
}
