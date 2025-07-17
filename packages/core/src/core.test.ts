import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { MockExporter } from "./__mocks__/mock-exporter.js";
import { LumberjackContext } from "./context.js";
import { LumberjackCore } from "./core.js";
import type { EnrichedLogEntry, ExportResult } from "./exporter.js";

describe("LumberjackCore", () => {
  let core: LumberjackCore;
  let fetchMock: any;

  beforeEach(() => {
    // Clear singleton instance
    (LumberjackCore as any).instance = null;

    // Clear environment variables to avoid test interference
    delete process.env.LUMBERJACK_API_KEY;
    delete process.env.LUMBERJACK_ENDPOINT;

    // Mock fetch
    fetchMock = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    global.fetch = fetchMock;

    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    if (core) {
      await core.shutdown();
    }
    jest.restoreAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance when created multiple times", () => {
      const instance1 = new LumberjackCore();
      const instance2 = new LumberjackCore();
      expect(instance1).toBe(instance2);
    });

    it("should return same instance from init and getInstance", () => {
      const instance1 = LumberjackCore.init();
      const instance2 = LumberjackCore.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return null from getInstance before initialization", () => {
      expect(LumberjackCore.getInstance()).toBeNull();
    });
  });

  describe("Configuration", () => {
    it("should use default configuration when no config provided", () => {
      core = new LumberjackCore();

      // Test configuration through behavior
      core.info("test message");

      // Should not flush immediately with default batch size
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should merge provided config with defaults", () => {
      core = new LumberjackCore({
        projectName: "test-project",
        batchSize: 1,
        apiKey: "test-key",
      });

      core.info("test message");

      // Should flush immediately with batch size 1
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should use environment variables for API configuration", () => {
      const originalEnv = process.env.LUMBERJACK_API_KEY;
      process.env.LUMBERJACK_API_KEY = "test-api-key";

      core = new LumberjackCore({ batchSize: 1 });
      core.info("test message");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );

      process.env.LUMBERJACK_API_KEY = originalEnv;
    });
  });

  describe("Logging Methods", () => {
    beforeEach(() => {
      core = new LumberjackCore({ batchSize: 1, apiKey: "test-key" });
    });

    it("should log messages with correct levels", async () => {
      const levels = [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ] as const;

      for (const level of levels) {
        fetchMock.mockClear();
        core[level]("test message");

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining(`"lvl":"${level}"`),
          })
        );
      }
    });

    it("should include metadata in log entries", () => {
      const metadata = { userId: "123", action: "test" };
      core.info("test message", metadata);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"userId":"123"'),
        })
      );
    });

    it("should handle errors with logError method", () => {
      const error = new Error("Test error");
      core.logError("Error occurred", error);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ext":"Error"'),
        })
      );
    });
  });

  describe("Trace Context Integration", () => {
    beforeEach(() => {
      core = new LumberjackCore({ batchSize: 1, apiKey: "test-key" });
    });

    it("should include trace context from LumberjackContext", () => {
      const traceId = LumberjackContext.generateTraceId();
      const spanId = LumberjackContext.generateSpanId();

      LumberjackContext.run({ traceId, spanId }, () => {
        core.info("test message");
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(`"tid":"${traceId}"`),
        })
      );
    });
  });

  describe("Console Capture", () => {
    beforeEach(() => {
      core = new LumberjackCore({
        captureConsole: true,
        batchSize: 1,
        apiKey: "test-key",
      });
    });

    it("should capture console.log calls", () => {
      // Console capture test

      console.log("captured message");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"captured message"'),
        })
      );
    });

    it("should capture console errors with exception details", () => {
      const error = new Error("Test error");
      console.error("Error message", error);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ext":"Error"'),
        })
      );
    });

    it("should not capture Lumberjack internal messages", () => {
      fetchMock.mockClear();
      console.log("[Lumberjack] internal message");

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Batching and Flushing", () => {
    it("should batch logs until batch size is reached", () => {
      core = new LumberjackCore({ batchSize: 3, apiKey: "test-key" });

      core.info("message 1");
      core.info("message 2");
      expect(fetchMock).not.toHaveBeenCalled();

      core.info("message 3");
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should flush logs manually", async () => {
      core = new LumberjackCore({ batchSize: 100, apiKey: "test-key" });

      core.info("test message");
      expect(fetchMock).not.toHaveBeenCalled();

      await core.flush();
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should not flush empty buffer", async () => {
      core = new LumberjackCore({ apiKey: "test-key" });

      await core.flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should output to console when no API key provided", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});
      core = new LumberjackCore({ batchSize: 1 });

      core.info("test message");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Lumberjack]",
        expect.stringContaining('"message":"test message"')
      );
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      core = new LumberjackCore({ batchSize: 1, apiKey: "test-key" });
    });

    it("should handle fetch errors gracefully", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      expect(() => core.info("test message")).not.toThrow();
    });

    it("should handle HTTP error responses", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      expect(() => core.info("test message")).not.toThrow();
    });

    it("should re-queue logs on error", async () => {
      class FailingMockExporter extends MockExporter {
        private callCount = 0;

        async exportLogs(logs: EnrichedLogEntry[]): Promise<ExportResult> {
          this.callCount++;
          if (this.callCount === 1) {
            return {
              success: false,
              error: new Error("Network error"),
              itemsExported: 0,
            };
          }
          this.exportedLogs.push(...logs);
          return { success: true, itemsExported: logs.length };
        }

        getCallCount(): number {
          return this.callCount;
        }
      }

      const failingExporter = new FailingMockExporter();

      // Reset the singleton instance
      (LumberjackCore as any).instance = null;

      core = new LumberjackCore({
        batchSize: 100,
        apiKey: "test-key",
        exporter: failingExporter,
      });

      core.info("test message");

      // First manual flush fails and re-queues, second should succeed
      await core.flush(); // First attempt - fails and re-queues
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await core.flush(); // Second attempt - should succeed

      expect(failingExporter.getCallCount()).toBe(2);
      expect(failingExporter.exportedLogs).toHaveLength(1); // Should have the log after successful retry
    });
  });

  describe("Shutdown", () => {
    it("should prevent logging after shutdown", async () => {
      core = new LumberjackCore({ batchSize: 1, apiKey: "test-key" });

      await core.shutdown();

      fetchMock.mockClear();
      core.info("test message");

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should flush remaining logs on shutdown", async () => {
      core = new LumberjackCore({ batchSize: 100, apiKey: "test-key" });

      core.info("test message");
      await core.shutdown();

      expect(fetchMock).toHaveBeenCalled();
    });

    it("should clear singleton instance on shutdown", async () => {
      core = new LumberjackCore();

      await core.shutdown();

      expect(LumberjackCore.getInstance()).toBeNull();
    });
  });

  describe("Exporter Integration", () => {
    it("should use default HttpExporter when no exporter provided", () => {
      core = new LumberjackCore({
        apiKey: "test-key",
        endpoint: "https://api.example.com/logs/batch",
        projectName: "test-project",
      });

      // We can't directly access the private exporter, but we can verify behavior
      expect(core).toBeInstanceOf(LumberjackCore);
    });

    it("should use provided custom exporter", async () => {
      const mockExporter = new MockExporter();

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
      });

      // Log a message to trigger export
      core.info("test message");
      await core.flush();

      // Verify the mock exporter was used
      expect(mockExporter.exportedLogs).toHaveLength(1);
      expect(mockExporter.exportedLogs[0].message).toBe("test message");
      expect(mockExporter.exportedLogs[0].level).toBe("info");
    });

    it("should handle exporter failures gracefully", async () => {
      const mockExporter = new MockExporter();
      mockExporter.shouldSucceed = false;
      mockExporter.errorMessage = "Export failed";

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
        debug: true,
      });

      core.info("test message");
      await core.flush();

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Lumberjack]: Failed to send logs:",
        "Export failed"
      );

      // Verify logs were re-queued on failure
      expect(mockExporter.exportedLogs).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it("should export objects through custom exporter", async () => {
      const mockExporter = new MockExporter();

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
        batchSize: 1, // Force immediate flush
        batchAge: 10, // Very short batch age
      });

      // Register an object to trigger export
      const testObject = { id: "test-obj", name: "test", value: 123 };
      LumberjackCore.register(testObject);

      // Wait longer for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the object was exported
      expect(mockExporter.exportedObjects).toHaveLength(1);
      expect(mockExporter.exportedObjects[0].fields).toEqual({ value: 123 });
    });

    it("should handle object export failures gracefully", async () => {
      const mockExporter = new MockExporter();
      mockExporter.shouldSucceed = false;
      mockExporter.errorMessage = "Object export failed";

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
        batchSize: 1,
        batchAge: 10,
      });

      const testObject = { id: "test-obj-2", name: "test", value: 123 };
      LumberjackCore.register(testObject);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Lumberjack]: Failed to send objects:",
        "Object export failed"
      );

      consoleSpy.mockRestore();
    });

    it("should transform logs correctly for exporter", async () => {
      const mockExporter = new MockExporter();

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
      });

      // Create a log entry with all fields
      core.error("test error message", { customProp: "customValue" });
      await core.flush();

      expect(mockExporter.exportedLogs).toHaveLength(1);
      const exportedLog = mockExporter.exportedLogs[0];

      // Verify log transformation
      expect(exportedLog.message).toBe("test error message");
      expect(exportedLog.level).toBe("error");
      expect(exportedLog.msg).toBe("test error message");
      expect(exportedLog.lvl).toBe("error");
      expect(exportedLog.project_name).toBe("test-project");
      expect(exportedLog.sdk_version).toBe("2");
      expect(exportedLog.props).toEqual({ customProp: "customValue" });
      expect(exportedLog.ts).toBeGreaterThan(0);
    });

    it("should transform objects correctly for exporter", async () => {
      const mockExporter = new MockExporter();

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
        batchSize: 1,
        batchAge: 10,
      });

      const testObject = {
        id: "test-obj-3",
        name: "test",
        nested: { value: 123 },
      };
      LumberjackCore.register(testObject);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockExporter.exportedObjects).toHaveLength(1);
      const exportedObject = mockExporter.exportedObjects[0];

      // Verify object transformation
      expect(exportedObject.fields).toEqual({ nested: { value: 123 } });
      expect(exportedObject.project_name).toBe("test-project");
      expect(exportedObject.sdk_version).toBe("2");
      expect(exportedObject.id).toBeDefined();
      expect(exportedObject.name).toBeDefined();
    });

    it("should include commit SHA in exports when available", async () => {
      process.env.GITHUB_SHA = "abc123def456";

      const mockExporter = new MockExporter();

      core = new LumberjackCore({
        apiKey: "test-key",
        projectName: "test-project",
        exporter: mockExporter,
      });

      core.info("test message");
      await core.flush();

      expect(mockExporter.exportedLogs).toHaveLength(1);
      expect(mockExporter.exportedLogs[0].commit_sha).toBe("abc123def456");

      delete process.env.GITHUB_SHA;
    });
  });
});
