import { beforeEach, describe, expect, it } from "@jest/globals";
import { LumberjackContext } from "./context";

describe("LumberjackContext", () => {
  beforeEach(() => {
    // Clear any existing context
    LumberjackContext.clear();
  });

  describe("Basic Context Operations", () => {
    it("should return undefined when no context is set", () => {
      expect(LumberjackContext.getStore()).toBeUndefined();
      expect(LumberjackContext.get("key")).toBeUndefined();
    });

    it("should run callback with provided context", () => {
      const context = { traceId: "test-trace", custom: "value" };

      const result = LumberjackContext.run(context, () => {
        return LumberjackContext.getStore();
      });

      expect(result).toEqual(context);
    });

    it("should run async callback with provided context", async () => {
      const context = { traceId: "test-trace", custom: "value" };

      const result = await LumberjackContext.runAsync(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return LumberjackContext.getStore();
      });

      expect(result).toEqual(context);
    });

    it("should isolate context between different runs", () => {
      const context1 = { traceId: "trace-1" };
      const context2 = { traceId: "trace-2" };

      const result1 = LumberjackContext.run(context1, () => {
        return LumberjackContext.getTraceId();
      });

      const result2 = LumberjackContext.run(context2, () => {
        return LumberjackContext.getTraceId();
      });

      expect(result1).toBe("trace-1");
      expect(result2).toBe("trace-2");
    });
  });

  describe("Key-Value Operations", () => {
    it("should set and get values within context", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        LumberjackContext.set("testKey", "testValue");
        expect(LumberjackContext.get("testKey")).toBe("testValue");
      });
    });

    it("should return default value when key not found", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        expect(LumberjackContext.get("nonexistent", "default")).toBe("default");
      });
    });

    it("should not affect context outside of run", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        LumberjackContext.set("testKey", "testValue");
      });

      expect(LumberjackContext.get("testKey")).toBeUndefined();
    });

    it("should handle setting values when no context exists", () => {
      expect(() => LumberjackContext.set("key", "value")).not.toThrow();
      expect(LumberjackContext.get("key")).toBeUndefined();
    });
  });

  describe("Trace ID Management", () => {
    it("should set and get trace ID", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        LumberjackContext.setTraceId("test-trace-id");
        expect(LumberjackContext.getTraceId()).toBe("test-trace-id");
      });
    });

    it("should generate unique trace IDs", () => {
      const id1 = LumberjackContext.generateTraceId();
      const id2 = LumberjackContext.generateTraceId();

      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(32); // 16 bytes * 2 hex chars
      expect(id2).toHaveLength(32);
      expect(id1).toMatch(/^[0-9a-f]+$/);
      expect(id2).toMatch(/^[0-9a-f]+$/);
    });

    it("should return undefined when no trace ID is set", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        // Clear the context and check
        LumberjackContext.clear();
        expect(LumberjackContext.getTraceId()).toBeUndefined();
      });
    });
  });

  describe("Span ID Management", () => {
    it("should set and get span ID", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        LumberjackContext.setSpanId("test-span-id");
        expect(LumberjackContext.getSpanId()).toBe("test-span-id");
      });
    });

    it("should generate unique span IDs", () => {
      const id1 = LumberjackContext.generateSpanId();
      const id2 = LumberjackContext.generateSpanId();

      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(16); // 8 bytes * 2 hex chars
      expect(id2).toHaveLength(16);
      expect(id1).toMatch(/^[0-9a-f]+$/);
      expect(id2).toMatch(/^[0-9a-f]+$/);
    });

    it("should return undefined when no span ID is set", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        // Don't set span ID, should be undefined
        expect(LumberjackContext.getSpanId()).toBeUndefined();
      });
    });
  });

  describe("Async Propagation", () => {
    it("should maintain context across async operations", async () => {
      const context = { traceId: "async-trace" };

      await LumberjackContext.runAsync(context, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 1));

        expect(LumberjackContext.getTraceId()).toBe("async-trace");

        // Nested async operation
        await new Promise((resolve) => {
          setTimeout(() => {
            expect(LumberjackContext.getTraceId()).toBe("async-trace");
            resolve(undefined);
          }, 1);
        });
      });
    });

    it("should maintain context across Promise chains", async () => {
      const context = { traceId: "promise-trace" };

      await LumberjackContext.runAsync(context, async () => {
        return Promise.resolve()
          .then(() => {
            expect(LumberjackContext.getTraceId()).toBe("promise-trace");
            return "step1";
          })
          .then((result) => {
            expect(result).toBe("step1");
            expect(LumberjackContext.getTraceId()).toBe("promise-trace");
            return "step2";
          });
      });
    });

    it("should isolate context between concurrent async operations", async () => {
      const results = await Promise.all([
        LumberjackContext.runAsync({ traceId: "trace-1" }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return LumberjackContext.getTraceId();
        }),
        LumberjackContext.runAsync({ traceId: "trace-2" }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return LumberjackContext.getTraceId();
        }),
        LumberjackContext.runAsync({ traceId: "trace-3" }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return LumberjackContext.getTraceId();
        }),
      ]);

      expect(results).toEqual(["trace-1", "trace-2", "trace-3"]);
    });
  });

  describe("Context Clearing", () => {
    it("should clear all values from context", () => {
      LumberjackContext.run({ traceId: "test-trace", custom: "value" }, () => {
        LumberjackContext.set("additional", "data");

        expect(LumberjackContext.getTraceId()).toBe("test-trace");
        expect(LumberjackContext.get("custom")).toBe("value");
        expect(LumberjackContext.get("additional")).toBe("data");

        LumberjackContext.clear();

        expect(LumberjackContext.getTraceId()).toBeUndefined();
        expect(LumberjackContext.get("custom")).toBeUndefined();
        expect(LumberjackContext.get("additional")).toBeUndefined();
      });
    });

    it("should handle clearing when no context exists", () => {
      expect(() => LumberjackContext.clear()).not.toThrow();
    });
  });

  describe("Nested Context Operations", () => {
    it("should handle nested context runs", () => {
      const outerContext = { traceId: "outer-trace" };
      const innerContext = { traceId: "inner-trace" };

      LumberjackContext.run(outerContext, () => {
        expect(LumberjackContext.getTraceId()).toBe("outer-trace");

        LumberjackContext.run(innerContext, () => {
          expect(LumberjackContext.getTraceId()).toBe("inner-trace");
        });

        // Should return to outer context
        expect(LumberjackContext.getTraceId()).toBe("outer-trace");
      });
    });

    it("should maintain modifications in nested contexts", () => {
      LumberjackContext.run({ traceId: "test" }, () => {
        LumberjackContext.setTraceId("outer-trace");

        LumberjackContext.run({ traceId: "test" }, () => {
          LumberjackContext.setSpanId("inner-span");
          expect(LumberjackContext.getSpanId()).toBe("inner-span");
        });

        // Outer context should still have trace ID but not span ID
        expect(LumberjackContext.getTraceId()).toBe("outer-trace");
        expect(LumberjackContext.getSpanId()).toBeUndefined();
      });
    });
  });

  describe("Error Handling", () => {
    it("should maintain context even when callback throws", () => {
      const context = { traceId: "error-trace" };

      expect(() => {
        LumberjackContext.run(context, () => {
          expect(LumberjackContext.getTraceId()).toBe("error-trace");
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      // Context should be restored outside the run
      expect(LumberjackContext.getTraceId()).toBeUndefined();
    });

    it("should handle async errors while maintaining context isolation", async () => {
      const context = { traceId: "async-error-trace" };

      await expect(
        LumberjackContext.runAsync(context, async () => {
          expect(LumberjackContext.getTraceId()).toBe("async-error-trace");
          throw new Error("Async test error");
        })
      ).rejects.toThrow("Async test error");

      // Context should be restored outside the run
      expect(LumberjackContext.getTraceId()).toBeUndefined();
    });
  });
});
