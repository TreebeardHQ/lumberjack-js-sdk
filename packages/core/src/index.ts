export { TreebeardCore } from './core.js';
export { TreebeardContext } from './context.js';
export type { 
  TreebeardConfig, 
  LogEntry, 
  LogLevelType, 
  TraceContext 
} from './types.js';

import { TreebeardCore } from './core.js';

export function init(config?: import('./types.js').TreebeardConfig): TreebeardCore {
  return TreebeardCore.init(config);
}

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
    TreebeardCore.getInstance()?.fatal(message, metadata)
};

export const trace = {
  start: (name: string, metadata?: Record<string, any>) => 
    TreebeardCore.getInstance()?.startTrace(name, metadata),
  end: (success?: boolean, metadata?: Record<string, any>) => 
    TreebeardCore.getInstance()?.endTrace(success, metadata)
};