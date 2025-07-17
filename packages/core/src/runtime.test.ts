import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { detectRuntime, getEnvironmentValue } from "./runtime.js";

describe("Runtime Detection", () => {
  // Store original values for restoration
  let originalProcess: any;
  let originalWindow: any;
  let originalNavigator: any;

  beforeEach(() => {
    // Store original values
    originalProcess = global.process;
    originalWindow = (global as any).window;
    originalNavigator = (global as any).navigator;
  });

  afterEach(() => {
    // Restore original values
    global.process = originalProcess;
    (global as any).window = originalWindow;
    (global as any).navigator = originalNavigator;
  });

  describe("detectRuntime", () => {
    it("should detect Node.js environment", () => {
      // Ensure we have process but no window or edge runtime
      global.process = {
        versions: { node: "18.0.0" },
      } as any;
      delete (global as any).window;
      delete (globalThis as any).EdgeRuntime;
      delete (global as any).navigator;

      const runtime = detectRuntime();

      expect(runtime.isNode).toBe(true);
      expect(runtime.isBrowser).toBe(false);
      expect(runtime.isEdgeRuntime).toBe(false);
      expect(runtime.isWorkerd).toBe(false);
      expect(runtime.hasProcess).toBe(true);
      expect(runtime.hasWindow).toBe(false);
    });

    it("should detect browser environment", () => {
      // Set up browser-like environment
      delete (global as any).process;
      (global as any).window = {};
      delete (globalThis as any).EdgeRuntime;
      delete (global as any).navigator;

      const runtime = detectRuntime();

      expect(runtime.isNode).toBe(false);
      expect(runtime.isBrowser).toBe(true);
      expect(runtime.isEdgeRuntime).toBe(false);
      expect(runtime.isWorkerd).toBe(false);
      expect(runtime.hasProcess).toBe(false);
      expect(runtime.hasWindow).toBe(true);
    });

    it("should detect Edge Runtime environment", () => {
      // Set up edge runtime environment
      global.process = {
        versions: { node: "18.0.0" },
      } as any;
      (globalThis as any).EdgeRuntime = {};
      delete (global as any).window;
      delete (global as any).navigator;

      const runtime = detectRuntime();

      expect(runtime.isNode).toBe(false);
      expect(runtime.isBrowser).toBe(false);
      expect(runtime.isEdgeRuntime).toBe(true);
      expect(runtime.isWorkerd).toBe(false);
      expect(runtime.hasProcess).toBe(true);
      expect(runtime.hasWindow).toBe(false);
    });

    it("should detect Cloudflare Workers environment", () => {
      // Set up Cloudflare Workers environment
      delete (global as any).process;
      delete (global as any).window;
      delete (globalThis as any).EdgeRuntime;
      (global as any).navigator = {
        userAgent: "Cloudflare-Workers",
      };

      const runtime = detectRuntime();

      expect(runtime.isNode).toBe(false);
      expect(runtime.isBrowser).toBe(false);
      expect(runtime.isEdgeRuntime).toBe(true);
      expect(runtime.isWorkerd).toBe(true);
      expect(runtime.hasProcess).toBe(false);
      expect(runtime.hasWindow).toBe(false);
    });

    it("should handle environment with both process and window", () => {
      // This might happen in some testing environments
      global.process = {
        versions: { node: "18.0.0" },
      } as any;
      (global as any).window = {};
      delete (globalThis as any).EdgeRuntime;
      delete (global as any).navigator;

      const runtime = detectRuntime();

      // Both should be true when both process and window exist
      expect(runtime.isNode).toBe(true);
      expect(runtime.isBrowser).toBe(true);
      expect(runtime.hasProcess).toBe(true);
      expect(runtime.hasWindow).toBe(true);
    });

    it("should handle environment with no recognizable runtime", () => {
      // Clean environment with no recognizable features
      delete (global as any).process;
      delete (global as any).window;
      delete (globalThis as any).EdgeRuntime;
      delete (global as any).navigator;

      const runtime = detectRuntime();

      expect(runtime.isNode).toBe(false);
      expect(runtime.isBrowser).toBe(false);
      expect(runtime.isEdgeRuntime).toBe(false);
      expect(runtime.isWorkerd).toBe(false);
      expect(runtime.hasProcess).toBe(false);
      expect(runtime.hasWindow).toBe(false);
    });

    it("should handle partial process object", () => {
      // Process exists but without versions.node
      global.process = {} as any;
      delete (global as any).window;
      delete (globalThis as any).EdgeRuntime;
      delete (global as any).navigator;

      const runtime = detectRuntime();

      expect(runtime.isNode).toBe(false);
      expect(runtime.hasProcess).toBe(false);
    });
  });

  describe("getEnvironmentValue", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset process.env
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return environment variable value when available", () => {
      process.env.TEST_VAR = "test-value";

      const value = getEnvironmentValue("TEST_VAR");

      expect(value).toBe("test-value");
    });

    it("should return fallback when environment variable is not set", () => {
      delete process.env.NONEXISTENT_VAR;

      const value = getEnvironmentValue("NONEXISTENT_VAR", "fallback-value");

      expect(value).toBe("fallback-value");
    });

    it("should return undefined when no fallback provided and var not set", () => {
      delete process.env.NONEXISTENT_VAR;

      const value = getEnvironmentValue("NONEXISTENT_VAR");

      expect(value).toBeUndefined();
    });

    it("should return environment variable even when fallback provided", () => {
      process.env.EXISTING_VAR = "actual-value";

      const value = getEnvironmentValue("EXISTING_VAR", "fallback-value");

      expect(value).toBe("actual-value");
    });

    it("should return fallback when environment variable is empty string", () => {
      process.env.EMPTY_VAR = "";

      const value = getEnvironmentValue("EMPTY_VAR", "fallback-value");

      expect(value).toBe("fallback-value");
    });

    it("should handle environment without process.env", () => {
      // Mock environment without process
      const originalProcess = global.process;
      delete (global as any).process;

      const value = getEnvironmentValue("ANY_VAR", "fallback-value");

      expect(value).toBe("fallback-value");

      // Restore process
      global.process = originalProcess;
    });

    it("should handle environment with process but no env", () => {
      // Mock process without env
      const originalEnv = global.process.env;
      delete (global.process as any).env;

      const value = getEnvironmentValue("ANY_VAR", "fallback-value");

      expect(value).toBe("fallback-value");

      // Restore env
      global.process.env = originalEnv;
    });

    it("should be case sensitive for environment variable names", () => {
      process.env.CaseSensitive = "correct-value";
      process.env.casesensitive = "wrong-value";

      const value1 = getEnvironmentValue("CaseSensitive");
      const value2 = getEnvironmentValue("casesensitive");

      expect(value1).toBe("correct-value");
      expect(value2).toBe("wrong-value");
    });
  });

  describe("Runtime-specific behavior", () => {
    it("should detect runtime consistently across multiple calls", () => {
      const runtime1 = detectRuntime();
      const runtime2 = detectRuntime();

      expect(runtime1).toEqual(runtime2);
    });

    it("should reflect changes in global environment", () => {
      // Start with Node.js environment
      global.process = {
        versions: { node: "18.0.0" },
      } as any;
      delete (global as any).window;

      const nodeRuntime = detectRuntime();
      expect(nodeRuntime.isNode).toBe(true);

      // Change to browser environment
      delete (global as any).process;
      (global as any).window = {};

      const browserRuntime = detectRuntime();
      expect(browserRuntime.isBrowser).toBe(true);
      expect(browserRuntime.isNode).toBe(false);
    });
  });
});
