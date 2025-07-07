export { TreebeardContext } from "./context.js";
export { TreebeardCore } from "./core.js";
export type { RegisteredObject } from "./object-batch.js";
export type { Exporter, ExporterConfig, ExportResult, EnrichedLogEntry, EnrichedRegisteredObject } from "./exporter.js";
export { HttpExporter } from "./http-exporter.js";

export { detectRuntime, getEnvironmentValue } from "./runtime.js";
export type { RuntimeEnvironment } from "./runtime.js";
export type {
  LogEntry,
  LogLevelType,
  TraceContext,
  TreebeardConfig,
  GatekeeperResponse,
  GatekeeperSchema,
  GatekeeperResult,
} from "./types.js";

import { TreebeardCore } from "./core.js";
import { getCallerInfo } from "./util/get-caller-info.js";

export const log = {
  trace: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.log("trace", message, metadata || {}, caller);
    }
  },
  debug: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.log("debug", message, metadata || {}, caller);
    }
  },
  info: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.log("info", message, metadata || {}, caller);
    }
  },
  warn: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.log("warn", message, metadata || {}, caller);
    }
  },
  error: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.log("error", message, metadata || {}, caller);
    }
  },
  fatal: (message: string, metadata?: Record<string, any>) => {
    const caller = getCallerInfo(1); // Skip this arrow function to get the actual caller
    const instance = TreebeardCore.getInstance();
    if (instance) {
      instance.log("fatal", message, metadata || {}, caller);
    }
  },
};

export const register = (obj?: any) => {
  TreebeardCore.register(obj);
};

// Export a convenient namespace for the API
export const Treebeard = {
  init: TreebeardCore.init,
  gatekeeper: (key: string) => {
    const instance = TreebeardCore.getInstance();
    if (!instance) {
      throw new Error("[Treebeard] SDK not initialized. Call Treebeard.init() first.");
    }
    return instance.gatekeeper.gatekeeper(key);
  },
};
