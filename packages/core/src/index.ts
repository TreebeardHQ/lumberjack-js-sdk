export { TreebeardContext } from "./context.js";
export { TreebeardCore } from "./core.js";

export { detectRuntime, getEnvironmentValue } from "./runtime.js";
export type { RuntimeEnvironment } from "./runtime.js";
export type {
  LogEntry,
  LogLevelType,
  TraceContext,
  TreebeardConfig,
} from "./types.js";

import { TreebeardCore } from "./core.js";

export const log = {
  trace: (message: string, metadata?: Record<string, any>) =>
    TreebeardCore.getInstance()?.trace(message, metadata),
  debug: (message: string, metadata?: Record<string, any>) =>
    TreebeardCore.getInstance()?.debug(message, metadata),
  info: (message: string, metadata?: Record<string, any>) =>
    TreebeardCore.getInstance()?.info(message, metadata),
  warn: (message: string, metadata?: Record<string, any>) =>
    TreebeardCore.getInstance()?.warn(message, metadata),
  error: (message: string, metadata?: Record<string, any>) =>
    TreebeardCore.getInstance()?.error(message, metadata),
  fatal: (message: string, metadata?: Record<string, any>) =>
    TreebeardCore.getInstance()?.fatal(message, metadata),
};
