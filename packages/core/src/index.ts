export { LumberjackContext } from "./context.js";
export { LumberjackCore } from "./core.js";
export type {
  EnrichedLogEntry,
  EnrichedRegisteredObject,
  Exporter,
  ExporterConfig,
  ExportResult,
} from "./exporter.js";
export { HttpExporter } from "./http-exporter.js";
export type { RegisteredObject } from "./object-batch.js";
export { LumberjackSpanProcessor } from "./span-processor.js";
export type {
  EnrichedSpanRequest,
  InstrumentationScope,
  OTLPSpan,
  Resource,
  ResourceSpans,
  ScopeSpans,
  SpanAttributes,
  SpanEvent,
  SpanExportRequest,
  SpanLink,
  SpanStatus,
} from "./span-types.js";

export {
  getBranch,
  getBuildId,
  getCommitSha,
  getDeploymentContext,
  getDeploymentId,
  getEnvironmentInfo,
  getEnvironmentName,
  getRegion,
  getVersion,
  isCI,
  isDevelopment,
  isProduction,
} from "./environment.js";
export type { EnvironmentInfo } from "./environment.js";
export { detectRuntime, getEnvironmentValue } from "./runtime.js";
export type { RuntimeEnvironment } from "./runtime.js";
export type {
  GatekeeperResponse,
  GatekeeperResult,
  GatekeeperSchema,
  LogEntry,
  LogLevelType,
  LumberjackConfig,
  TraceContext,
} from "./types.js";

import { LumberjackCore } from "./core.js";
import { getCallerInfo } from "./util/get-caller-info.js";

export const log = {
  trace: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = LumberjackCore.getInstance();
    if (instance) {
      instance.log("trace", message, metadata || {}, caller);
    }
  },
  debug: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = LumberjackCore.getInstance();
    if (instance) {
      instance.log("debug", message, metadata || {}, caller);
    }
  },
  info: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = LumberjackCore.getInstance();
    if (instance) {
      instance.log("info", message, metadata || {}, caller);
    }
  },
  warn: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = LumberjackCore.getInstance();
    if (instance) {
      instance.log("warn", message, metadata || {}, caller);
    }
  },
  error: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = LumberjackCore.getInstance();
    if (instance) {
      instance.log("error", message, metadata || {}, caller);
    }
  },
  fatal: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = LumberjackCore.getInstance();
    if (instance) {
      instance.log("fatal", message, metadata || {}, caller);
    }
  },
};

export const register = (obj?: any) => {
  LumberjackCore.register(obj);
};

// Export a convenient namespace for the API
export const Lumberjack = {
  init: LumberjackCore.init,
  gatekeeper: (key: string) => {
    const instance = LumberjackCore.getInstance();
    if (!instance) {
      throw new Error(
        "[Lumberjack] SDK not initialized. Call Lumberjack.init() first."
      );
    }
    return instance.gatekeeper.gatekeeper(key);
  },
};
