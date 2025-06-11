export { ExpressInstrumentation } from './instrumentation.js';
export type { 
  ExpressInstrumentationConfig,
  InstrumentedRequest,
  InstrumentedResponse,
  ExpressMiddleware
} from './types.js';

import { ExpressInstrumentation } from './instrumentation.js';
import { Application } from 'express';
import type { ExpressInstrumentationConfig } from './types.js';

export class Treebeard {
  static instrument(app: Application, config?: ExpressInstrumentationConfig): void {
    ExpressInstrumentation.instrument(app, config);
  }

  static middleware(config?: ExpressInstrumentationConfig) {
    return ExpressInstrumentation.createMiddleware(config);
  }

  static withTreebeard = ExpressInstrumentation.withTreebeard;
}

// Convenience exports
export const instrument = Treebeard.instrument;
export const withTreebeard = Treebeard.withTreebeard;
export const middleware = Treebeard.middleware;