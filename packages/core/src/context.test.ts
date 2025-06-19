import { describe, it, expect, beforeEach } from '@jest/globals';
import { TreebeardContext } from './context.js';

describe('TreebeardContext', () => {
  beforeEach(() => {
    // Clear any existing context
    TreebeardContext.clear();
  });

  describe('Basic Context Operations', () => {
    it('should return undefined when no context is set', () => {
      expect(TreebeardContext.getStore()).toBeUndefined();
      expect(TreebeardContext.get('key')).toBeUndefined();
    });

    it('should run callback with provided context', () => {
      const context = { traceId: 'test-trace', custom: 'value' };
      
      const result = TreebeardContext.run(context, () => {
        return TreebeardContext.getStore();
      });
      
      expect(result).toEqual(context);
    });

    it('should run async callback with provided context', async () => {
      const context = { traceId: 'test-trace', custom: 'value' };
      
      const result = await TreebeardContext.runAsync(context, async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return TreebeardContext.getStore();
      });
      
      expect(result).toEqual(context);
    });

    it('should isolate context between different runs', () => {
      const context1 = { traceId: 'trace-1' };
      const context2 = { traceId: 'trace-2' };
      
      const result1 = TreebeardContext.run(context1, () => {
        return TreebeardContext.getTraceId();
      });
      
      const result2 = TreebeardContext.run(context2, () => {
        return TreebeardContext.getTraceId();
      });
      
      expect(result1).toBe('trace-1');
      expect(result2).toBe('trace-2');
    });
  });

  describe('Key-Value Operations', () => {
    it('should set and get values within context', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        TreebeardContext.set('testKey', 'testValue');
        expect(TreebeardContext.get('testKey')).toBe('testValue');
      });
    });

    it('should return default value when key not found', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        expect(TreebeardContext.get('nonexistent', 'default')).toBe('default');
      });
    });

    it('should not affect context outside of run', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        TreebeardContext.set('testKey', 'testValue');
      });
      
      expect(TreebeardContext.get('testKey')).toBeUndefined();
    });

    it('should handle setting values when no context exists', () => {
      expect(() => TreebeardContext.set('key', 'value')).not.toThrow();
      expect(TreebeardContext.get('key')).toBeUndefined();
    });
  });

  describe('Trace ID Management', () => {
    it('should set and get trace ID', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        TreebeardContext.setTraceId('test-trace-id');
        expect(TreebeardContext.getTraceId()).toBe('test-trace-id');
      });
    });

    it('should generate unique trace IDs', () => {
      const id1 = TreebeardContext.generateTraceId();
      const id2 = TreebeardContext.generateTraceId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(32); // 16 bytes * 2 hex chars
      expect(id2).toHaveLength(32);
      expect(id1).toMatch(/^[0-9a-f]+$/);
      expect(id2).toMatch(/^[0-9a-f]+$/);
    });

    it('should return undefined when no trace ID is set', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        // Clear the context and check
        TreebeardContext.clear();
        expect(TreebeardContext.getTraceId()).toBeUndefined();
      });
    });
  });

  describe('Span ID Management', () => {
    it('should set and get span ID', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        TreebeardContext.setSpanId('test-span-id');
        expect(TreebeardContext.getSpanId()).toBe('test-span-id');
      });
    });

    it('should generate unique span IDs', () => {
      const id1 = TreebeardContext.generateSpanId();
      const id2 = TreebeardContext.generateSpanId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(16); // 8 bytes * 2 hex chars
      expect(id2).toHaveLength(16);
      expect(id1).toMatch(/^[0-9a-f]+$/);
      expect(id2).toMatch(/^[0-9a-f]+$/);
    });

    it('should return undefined when no span ID is set', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        // Don't set span ID, should be undefined
        expect(TreebeardContext.getSpanId()).toBeUndefined();
      });
    });
  });

  describe('Async Propagation', () => {
    it('should maintain context across async operations', async () => {
      const context = { traceId: 'async-trace' };
      
      await TreebeardContext.runAsync(context, async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1));
        
        expect(TreebeardContext.getTraceId()).toBe('async-trace');
        
        // Nested async operation
        await new Promise(resolve => {
          setTimeout(() => {
            expect(TreebeardContext.getTraceId()).toBe('async-trace');
            resolve(undefined);
          }, 1);
        });
      });
    });

    it('should maintain context across Promise chains', async () => {
      const context = { traceId: 'promise-trace' };
      
      await TreebeardContext.runAsync(context, async () => {
        return Promise.resolve()
          .then(() => {
            expect(TreebeardContext.getTraceId()).toBe('promise-trace');
            return 'step1';
          })
          .then((result) => {
            expect(result).toBe('step1');
            expect(TreebeardContext.getTraceId()).toBe('promise-trace');
            return 'step2';
          });
      });
    });

    it('should isolate context between concurrent async operations', async () => {
      const results = await Promise.all([
        TreebeardContext.runAsync({ traceId: 'trace-1' }, async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return TreebeardContext.getTraceId();
        }),
        TreebeardContext.runAsync({ traceId: 'trace-2' }, async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return TreebeardContext.getTraceId();
        }),
        TreebeardContext.runAsync({ traceId: 'trace-3' }, async () => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return TreebeardContext.getTraceId();
        })
      ]);
      
      expect(results).toEqual(['trace-1', 'trace-2', 'trace-3']);
    });
  });

  describe('Context Clearing', () => {
    it('should clear all values from context', () => {
      TreebeardContext.run({ traceId: 'test-trace', custom: 'value' }, () => {
        TreebeardContext.set('additional', 'data');
        
        expect(TreebeardContext.getTraceId()).toBe('test-trace');
        expect(TreebeardContext.get('custom')).toBe('value');
        expect(TreebeardContext.get('additional')).toBe('data');
        
        TreebeardContext.clear();
        
        expect(TreebeardContext.getTraceId()).toBeUndefined();
        expect(TreebeardContext.get('custom')).toBeUndefined();
        expect(TreebeardContext.get('additional')).toBeUndefined();
      });
    });

    it('should handle clearing when no context exists', () => {
      expect(() => TreebeardContext.clear()).not.toThrow();
    });
  });

  describe('Nested Context Operations', () => {
    it('should handle nested context runs', () => {
      const outerContext = { traceId: 'outer-trace' };
      const innerContext = { traceId: 'inner-trace' };
      
      TreebeardContext.run(outerContext, () => {
        expect(TreebeardContext.getTraceId()).toBe('outer-trace');
        
        TreebeardContext.run(innerContext, () => {
          expect(TreebeardContext.getTraceId()).toBe('inner-trace');
        });
        
        // Should return to outer context
        expect(TreebeardContext.getTraceId()).toBe('outer-trace');
      });
    });

    it('should maintain modifications in nested contexts', () => {
      TreebeardContext.run({ traceId: 'test' }, () => {
        TreebeardContext.setTraceId('outer-trace');
        
        TreebeardContext.run({ traceId: 'test' }, () => {
          TreebeardContext.setSpanId('inner-span');
          expect(TreebeardContext.getSpanId()).toBe('inner-span');
        });
        
        // Outer context should still have trace ID but not span ID
        expect(TreebeardContext.getTraceId()).toBe('outer-trace');
        expect(TreebeardContext.getSpanId()).toBeUndefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should maintain context even when callback throws', () => {
      const context = { traceId: 'error-trace' };
      
      expect(() => {
        TreebeardContext.run(context, () => {
          expect(TreebeardContext.getTraceId()).toBe('error-trace');
          throw new Error('Test error');
        });
      }).toThrow('Test error');
      
      // Context should be restored outside the run
      expect(TreebeardContext.getTraceId()).toBeUndefined();
    });

    it('should handle async errors while maintaining context isolation', async () => {
      const context = { traceId: 'async-error-trace' };
      
      await expect(
        TreebeardContext.runAsync(context, async () => {
          expect(TreebeardContext.getTraceId()).toBe('async-error-trace');
          throw new Error('Async test error');
        })
      ).rejects.toThrow('Async test error');
      
      // Context should be restored outside the run
      expect(TreebeardContext.getTraceId()).toBeUndefined();
    });
  });
});