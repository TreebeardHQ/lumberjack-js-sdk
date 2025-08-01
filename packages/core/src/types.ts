import type { Exporter } from "./exporter.js";

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
  traceId?: string | undefined;
  spanId?: string | undefined;
  source?: string;
  file?: string | undefined;
  line?: number | undefined;
  function?: string | undefined;
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
  sid?: string | undefined;
  exv?: string | undefined;
  ext?: string | undefined;
  fn?: string | undefined;
}

export interface LumberjackConfig {
  apiKey?: string;
  endpoint?: string;
  projectName?: string;
  batchSize?: number;
  batchAge?: number;
  flushInterval?: number;
  captureConsole?: boolean;
  captureUnhandled?: boolean;
  debug?: boolean;
  serviceToken?: string;
  gatekeeperEndpoint?: string;
  exporter?: Exporter;
  getHeaders?: () => Promise<Record<string, string>>;
}

export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  traceName?: string;
  [key: string]: any;
}

export interface GatekeeperResponse {
  allowed: boolean;
}

export interface GatekeeperSchema {
  gatekeepers: string[];
}

export interface GatekeeperResult {
  pass(): Promise<void>;
  fail(): Promise<void>;
}
