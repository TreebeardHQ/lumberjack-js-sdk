import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TreebeardCore } from './core.js';
import { TreebeardContext } from './context.js';

describe('TreebeardCore', () => {
  let core: TreebeardCore;
  let fetchMock: any;

  beforeEach(() => {
    // Clear singleton instance
    (TreebeardCore as any).instance = null;
    
    // Clear environment variables to avoid test interference
    delete process.env.TREEBEARD_API_KEY;
    delete process.env.TREEBEARD_ENDPOINT;
    
    // Mock fetch
    fetchMock = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK'
    });
    global.fetch = fetchMock;
    
    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (core) {
      await core.shutdown();
    }
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when created multiple times', () => {
      const instance1 = new TreebeardCore();
      const instance2 = new TreebeardCore();
      expect(instance1).toBe(instance2);
    });

    it('should return same instance from init and getInstance', () => {
      const instance1 = TreebeardCore.init();
      const instance2 = TreebeardCore.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return null from getInstance before initialization', () => {
      expect(TreebeardCore.getInstance()).toBeNull();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when no config provided', () => {
      core = new TreebeardCore();
      
      // Test configuration through behavior
      core.info('test message');
      
      // Should not flush immediately with default batch size
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should merge provided config with defaults', () => {
      core = new TreebeardCore({
        projectName: 'test-project',
        batchSize: 1,
        apiKey: 'test-key'
      });
      
      core.info('test message');
      
      // Should flush immediately with batch size 1
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should use environment variables for API configuration', () => {
      const originalEnv = process.env.TREEBEARD_API_KEY;
      process.env.TREEBEARD_API_KEY = 'test-api-key';
      
      core = new TreebeardCore({ batchSize: 1 });
      core.info('test message');
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
      
      process.env.TREEBEARD_API_KEY = originalEnv;
    });
  });

  describe('Logging Methods', () => {
    beforeEach(() => {
      core = new TreebeardCore({ batchSize: 1, apiKey: 'test-key' });
    });

    it('should log messages with correct levels', async () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
      
      for (const level of levels) {
        fetchMock.mockClear();
        core[level]('test message');
        
        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining(`"lvl":"${level}"`)
          })
        );
      }
    });

    it('should include metadata in log entries', () => {
      const metadata = { userId: '123', action: 'test' };
      core.info('test message', metadata);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"userId":"123"')
        })
      );
    });

    it('should handle errors with logError method', () => {
      const error = new Error('Test error');
      core.logError('Error occurred', error);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ext":"Error"')
        })
      );
    });
  });

  describe('Trace Context Integration', () => {
    beforeEach(() => {
      core = new TreebeardCore({ batchSize: 1, apiKey: 'test-key' });
    });

    it('should include trace context from TreebeardContext', () => {
      const traceId = TreebeardContext.generateTraceId();
      const spanId = TreebeardContext.generateSpanId();
      
      TreebeardContext.run({ traceId, spanId }, () => {
        core.info('test message');
      });
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(`"tid":"${traceId}"`)
        })
      );
    });

    it('should start traces with proper metadata', () => {
      const traceId = 'test-trace-id';
      const spanId = 'test-span-id';
      const traceName = 'test-trace';
      
      core.startTrace(traceId, spanId, traceName, { custom: 'data' });
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"tb_trace_start":true')
        })
      );
    });

    it('should complete traces with success status', () => {
      core.completeTrace('test-trace-id', 'test-span-id', true);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"tb_trace_complete_success":true')
        })
      );
    });

    it('should complete traces with error status', () => {
      core.completeTrace('test-trace-id', 'test-span-id', false);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"tb_trace_complete_error":false')
        })
      );
    });
  });

  describe('Injection Callbacks', () => {
    beforeEach(() => {
      core = new TreebeardCore({ batchSize: 1, apiKey: 'test-key' });
    });

    it('should register and use injection callbacks', () => {
      const callback = jest.fn<() => any>().mockReturnValue({
        traceContext: { traceId: 'injected-trace' },
        metadata: { injected: 'data' }
      });
      
      const id = core.registerInjection(callback);
      expect(typeof id).toBe('string');
      
      core.info('test message');
      
      expect(callback).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"tid":"injected-trace"')
        })
      );
    });

    it('should unregister injection callbacks', () => {
      const callback = jest.fn<() => any>().mockReturnValue({});
      
      const id = core.registerInjection(callback);
      const removed = core.unregisterInjection(id);
      
      expect(removed).toBe(true);
      
      core.info('test message');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle injection callback errors gracefully', () => {
      const callback = jest.fn<() => any>().mockImplementation(() => {
        throw new Error('Injection error');
      });
      
      core.registerInjection(callback);
      
      expect(() => core.info('test message')).not.toThrow();
    });
  });

  describe('Console Capture', () => {
    beforeEach(() => {
      core = new TreebeardCore({ 
        captureConsole: true, 
        batchSize: 1, 
        apiKey: 'test-key' 
      });
    });

    it('should capture console.log calls', () => {
      // Console capture test
      
      console.log('captured message');
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"captured message"')
        })
      );
    });

    it('should capture console errors with exception details', () => {
      const error = new Error('Test error');
      console.error('Error message', error);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ext":"Error"')
        })
      );
    });

    it('should not capture Treebeard internal messages', () => {
      fetchMock.mockClear();
      console.log('[Treebeard] internal message');
      
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Batching and Flushing', () => {
    it('should batch logs until batch size is reached', () => {
      core = new TreebeardCore({ batchSize: 3, apiKey: 'test-key' });
      
      core.info('message 1');
      core.info('message 2');
      expect(fetchMock).not.toHaveBeenCalled();
      
      core.info('message 3');
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should flush logs manually', async () => {
      core = new TreebeardCore({ batchSize: 100, apiKey: 'test-key' });
      
      core.info('test message');
      expect(fetchMock).not.toHaveBeenCalled();
      
      await core.flush();
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should not flush empty buffer', async () => {
      core = new TreebeardCore({ apiKey: 'test-key' });
      
      await core.flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should output to console when no API key provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      core = new TreebeardCore({ batchSize: 1 });
      
      core.info('test message');
      
      expect(fetchMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Treebeard]',
        expect.stringContaining('"message":"test message"')
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      core = new TreebeardCore({ batchSize: 1, apiKey: 'test-key' });
    });

    it('should handle fetch errors gracefully', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      
      expect(() => core.info('test message')).not.toThrow();
    });

    it('should handle HTTP error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });
      
      expect(() => core.info('test message')).not.toThrow();
    });

    it('should re-queue logs on error', async () => {
      // Set up a large batch size so manual flush is needed
      core = new TreebeardCore({ batchSize: 100, apiKey: 'test-key' });
      
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
              .mockResolvedValueOnce({ ok: true });
      
      core.info('test message');
      
      // First manual flush fails and re-queues, second should succeed
      await core.flush(); // First attempt - fails and re-queues
      await core.flush(); // Second attempt - should succeed
      
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Shutdown', () => {
    it('should prevent logging after shutdown', async () => {
      core = new TreebeardCore({ batchSize: 1, apiKey: 'test-key' });
      
      await core.shutdown();
      
      fetchMock.mockClear();
      core.info('test message');
      
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should flush remaining logs on shutdown', async () => {
      core = new TreebeardCore({ batchSize: 100, apiKey: 'test-key' });
      
      core.info('test message');
      await core.shutdown();
      
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should clear singleton instance on shutdown', async () => {
      core = new TreebeardCore();
      
      await core.shutdown();
      
      expect(TreebeardCore.getInstance()).toBeNull();
    });
  });
});