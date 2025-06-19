import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import express, { Application } from 'express';
import { TreebeardCore } from '@treebeardhq/core';
import { Treebeard, instrument, withTreebeard, middleware } from './index.js';
import { ExpressInstrumentation } from './instrumentation.js';

// Mock express app
const createMockApp = (): Application => {
  const middlewares: any[] = [];
  const mockApp = {
    use: jest.fn((handler) => middlewares.push(handler)),
    get middleware() { return middlewares; }
  } as unknown as Application;
  return mockApp;
};

describe('Express Integration Index', () => {
  let app: Application;
  let core: TreebeardCore;

  beforeEach(() => {
    // Clear singleton and create fresh app
    (TreebeardCore as any).instance = null;
    app = createMockApp();
    
    // Mock fetch
    const fetchMock = jest.fn() as any;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK'
    });
    global.fetch = fetchMock;
    
    // Mock console to avoid test output clutter
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Initialize core
    core = TreebeardCore.init({ 
      batchSize: 1, 
      apiKey: 'test-key' 
    });
  });

  afterEach(async () => {
    if (core) {
      await core.shutdown();
    }
    jest.restoreAllMocks();
  });

  describe('Treebeard Class', () => {
    it('should have static instrument method', () => {
      expect(typeof Treebeard.instrument).toBe('function');
    });

    it('should have static middleware method', () => {
      expect(typeof Treebeard.middleware).toBe('function');
    });

    it('should have static withTreebeard method', () => {
      expect(typeof Treebeard.withTreebeard).toBe('function');
    });

    it('should delegate instrument to ExpressInstrumentation', () => {
      const instrumentSpy = jest.spyOn(ExpressInstrumentation, 'instrument');
      const config = { captureHeaders: false };
      
      Treebeard.instrument(app, config);
      
      expect(instrumentSpy).toHaveBeenCalledWith(app, config);
    });

    it('should delegate middleware to ExpressInstrumentation', () => {
      const middlewareSpy = jest.spyOn(ExpressInstrumentation, 'createMiddleware');
      const config = { captureQuery: false };
      
      Treebeard.middleware(config);
      
      expect(middlewareSpy).toHaveBeenCalledWith(config);
    });

    it('should reference withTreebeard from ExpressInstrumentation', () => {
      expect(Treebeard.withTreebeard).toBe(ExpressInstrumentation.withTreebeard);
    });
  });

  describe('Convenience Exports', () => {
    it('should export instrument function', () => {
      expect(typeof instrument).toBe('function');
      expect(instrument).toBe(Treebeard.instrument);
    });

    it('should export withTreebeard function', () => {
      expect(typeof withTreebeard).toBe('function');
      expect(withTreebeard).toBe(Treebeard.withTreebeard);
    });

    it('should export middleware function', () => {
      expect(typeof middleware).toBe('function');
      expect(middleware).toBe(Treebeard.middleware);
    });
  });

  describe('Integration Behavior', () => {
    it('should instrument app using convenience function', () => {
      const instrumentSpy = jest.spyOn(ExpressInstrumentation, 'instrument');
      
      instrument(app);
      
      expect(instrumentSpy).toHaveBeenCalledWith(app, undefined);
      expect(app.use).toHaveBeenCalled();
    });

    it('should create middleware using convenience function', () => {
      const middlewareSpy = jest.spyOn(ExpressInstrumentation, 'createMiddleware');
      
      const mw = middleware();
      
      expect(middlewareSpy).toHaveBeenCalledWith(undefined);
      expect(typeof mw).toBe('function');
    });

    it('should wrap handlers using convenience function', async () => {
      const handler = jest.fn() as any;
      handler.mockResolvedValue('result');
      
      const wrapped = withTreebeard(handler, 'test-handler');
      const result = await wrapped();
      
      expect(result).toBe('result');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Function Signatures', () => {
    it('should accept configuration in instrument function', () => {
      const config = {
        ignorePaths: ['/custom-health'],
        captureHeaders: false,
        maxBodySize: 5000
      };
      
      expect(() => instrument(app, config)).not.toThrow();
    });

    it('should accept configuration in middleware function', () => {
      const config = {
        captureBody: true,
        sanitizeHeaders: ['x-custom-header']
      };
      
      expect(() => middleware(config)).not.toThrow();
    });

    it('should accept trace name in withTreebeard function', () => {
      const handler = () => 'test';
      
      expect(() => withTreebeard(handler, 'custom-trace-name')).not.toThrow();
    });
  });

  describe('Type Safety', () => {
    it('should maintain handler function signature', async () => {
      const typedHandler = (a: string, b: number): Promise<boolean> => {
        return Promise.resolve(a.length > b);
      };
      
      const wrapped = withTreebeard(typedHandler);
      const result = await wrapped('hello', 3);
      
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });

    it('should work with sync and async handlers', async () => {
      const syncHandler = (x: number) => x * 2;
      const asyncHandler = async (x: number) => x * 3;
      
      const wrappedSync = withTreebeard(syncHandler);
      const wrappedAsync = withTreebeard(asyncHandler);
      
      const syncResult = await wrappedSync(5);
      const asyncResult = await wrappedAsync(5);
      
      expect(syncResult).toBe(10);
      expect(asyncResult).toBe(15);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate instrumentation errors', () => {
      // Mock ExpressInstrumentation to throw
      const originalInstrument = ExpressInstrumentation.instrument;
      ExpressInstrumentation.instrument = jest.fn().mockImplementation(() => {
        throw new Error('Instrumentation failed');
      });
      
      expect(() => instrument(app)).toThrow('Instrumentation failed');
      
      // Restore
      ExpressInstrumentation.instrument = originalInstrument;
    });

    it('should propagate handler errors in withTreebeard', async () => {
      const errorHandler = () => {
        throw new Error('Handler error');
      };
      
      const wrapped = withTreebeard(errorHandler);
      
      await expect(wrapped()).rejects.toThrow('Handler error');
    });
  });

  describe('Real Express Integration', () => {
    it('should work with actual express app', () => {
      // This test uses a real express app to ensure compatibility
      const realApp = express();
      
      expect(() => instrument(realApp)).not.toThrow();
      
      // Check that middleware was actually added
      expect(realApp._router.stack.length).toBeGreaterThan(0);
    });

    it('should create working middleware for real express app', () => {
      const realApp = express();
      const mw = middleware();
      
      expect(() => realApp.use(mw)).not.toThrow();
    });
  });

  describe('Multiple Apps', () => {
    it('should handle instrumenting multiple apps', () => {
      const app1 = createMockApp();
      const app2 = createMockApp();
      
      instrument(app1);
      instrument(app2);
      
      expect(app1.use).toHaveBeenCalled();
      expect(app2.use).toHaveBeenCalled();
    });

    it('should handle same app instrumented multiple times', () => {
      instrument(app);
      instrument(app); // Should warn but not fail
      
      expect(console.warn).toHaveBeenCalledWith('Treebeard: Express app is already instrumented');
    });
  });

  describe('Configuration Validation', () => {
    it('should handle empty configuration objects', () => {
      expect(() => instrument(app, {})).not.toThrow();
      expect(() => middleware({})).not.toThrow();
    });

    it('should handle undefined configuration', () => {
      expect(() => instrument(app, undefined)).not.toThrow();
      expect(() => middleware(undefined)).not.toThrow();
    });

    it('should handle partial configuration objects', () => {
      const partialConfig = { captureHeaders: false };
      
      expect(() => instrument(app, partialConfig)).not.toThrow();
      expect(() => middleware(partialConfig)).not.toThrow();
    });
  });
});