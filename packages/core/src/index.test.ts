import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { log, LumberjackCore } from "./index.js";

describe("Exported Log Functions", () => {
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

  describe("Log Function Availability", () => {
    it("should provide all log level functions", () => {
      expect(log.trace).toBeDefined();
      expect(log.debug).toBeDefined();
      expect(log.info).toBeDefined();
      expect(log.warn).toBeDefined();
      expect(log.error).toBeDefined();
      expect(log.fatal).toBeDefined();

      expect(typeof log.trace).toBe("function");
      expect(typeof log.debug).toBe("function");
      expect(typeof log.info).toBe("function");
      expect(typeof log.warn).toBe("function");
      expect(typeof log.error).toBe("function");
      expect(typeof log.fatal).toBe("function");
    });
  });

  describe("Behavior Before SDK Initialization", () => {
    it("should handle calls gracefully when SDK not initialized", () => {
      expect(() => log.info("test message")).not.toThrow();
      expect(() => log.error("error message")).not.toThrow();
      expect(() => log.debug("debug message")).not.toThrow();
    });

    it("should not make API calls when SDK not initialized", () => {
      log.info("test message");
      log.error("error message");

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should return undefined when SDK not initialized", () => {
      const result1 = log.info("test message");
      const result2 = log.error("error message");

      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
    });
  });

  describe("Behavior After SDK Initialization", () => {
    beforeEach(() => {
      core = LumberjackCore.init({
        batchSize: 1,
        apiKey: "test-key",
      });
    });

    it("should delegate to core instance methods", () => {
      const logSpy = jest.spyOn(core, "log");

      log.trace("trace message");
      log.debug("debug message");
      log.info("info message");
      log.warn("warn message");
      log.error("error message");
      log.fatal("fatal message");

      expect(logSpy).toHaveBeenCalledWith(
        "trace",
        "trace message",
        {},
        expect.anything()
      );
      expect(logSpy).toHaveBeenCalledWith(
        "debug",
        "debug message",
        {},
        expect.anything()
      );
      expect(logSpy).toHaveBeenCalledWith(
        "info",
        "info message",
        {},
        expect.anything()
      );
      expect(logSpy).toHaveBeenCalledWith(
        "warn",
        "warn message",
        {},
        expect.anything()
      );
      expect(logSpy).toHaveBeenCalledWith(
        "error",
        "error message",
        {},
        expect.anything()
      );
      expect(logSpy).toHaveBeenCalledWith(
        "fatal",
        "fatal message",
        {},
        expect.anything()
      );
    });

    it("should pass metadata correctly", () => {
      const logSpy = jest.spyOn(core, "log");
      const metadata = { userId: "123", action: "test" };

      log.info("test message", metadata);

      expect(logSpy).toHaveBeenCalledWith(
        "info",
        "test message",
        metadata,
        expect.anything()
      );
    });

    it("should trigger API calls for each log level", () => {
      const levels = [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ] as const;

      levels.forEach((level) => {
        fetchMock.mockClear();
        log[level](`${level} message`);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining(`"lvl":"${level}"`),
          })
        );
      });
    });
  });

  describe("SDK Lifecycle Integration", () => {
    it("should work correctly after SDK restart", async () => {
      // Initialize SDK
      core = LumberjackCore.init({ batchSize: 1, apiKey: "test-key" });

      log.info("message 1");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Shutdown SDK
      await core.shutdown();
      fetchMock.mockClear();

      // Should not work after shutdown
      log.info("message 2");
      expect(fetchMock).not.toHaveBeenCalled();

      // Reinitialize SDK
      core = LumberjackCore.init({ batchSize: 1, apiKey: "test-key-2" });

      // Should work again
      log.info("message 3");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple initializations correctly", () => {
      const core1 = LumberjackCore.init({ batchSize: 1, apiKey: "test-key-1" });
      const core2 = LumberjackCore.init({ batchSize: 1, apiKey: "test-key-2" });

      // Should be the same instance (singleton)
      expect(core1).toBe(core2);

      const logSpy = jest.spyOn(core1, "log");

      log.info("test message");

      expect(logSpy).toHaveBeenCalledWith(
        "info",
        "test message",
        {},
        expect.anything()
      );

      core = core1; // For cleanup
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      core = LumberjackCore.init({
        batchSize: 1,
        apiKey: "test-key",
      });
    });

    it("should handle API errors gracefully", () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      expect(() => log.error("error message")).not.toThrow();
    });

    it("should handle invalid metadata gracefully", () => {
      const circularRef: any = {};
      circularRef.self = circularRef;

      expect(() => log.info("message", circularRef)).not.toThrow();
    });
  });

  describe("Performance Considerations", () => {
    beforeEach(() => {
      core = LumberjackCore.init({
        batchSize: 100,
        apiKey: "test-key",
      });
    });

    it("should batch multiple log calls efficiently", () => {
      // Log multiple messages
      for (let i = 0; i < 50; i++) {
        log.info(`message ${i}`);
      }

      // Should not have triggered flush yet
      expect(fetchMock).not.toHaveBeenCalled();

      // Manually flush to check all messages are there
      core.flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(callBody.logs).toHaveLength(50);
    });

    it("should handle high-frequency logging", () => {
      const startTime = Date.now();

      // Log 1000 messages quickly
      for (let i = 0; i < 1000; i++) {
        log.info(`high frequency message ${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Type Safety and Interface", () => {
    beforeEach(() => {
      core = LumberjackCore.init({
        batchSize: 1,
        apiKey: "test-key",
      });
    });

    it("should accept string messages", () => {
      expect(() => log.info("string message")).not.toThrow();
    });

    it("should accept metadata objects", () => {
      const metadata = {
        string: "value",
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: "value" },
      };

      expect(() => log.info("message", metadata)).not.toThrow();
    });

    it("should handle undefined metadata", () => {
      expect(() => log.info("message", undefined)).not.toThrow();
    });
  });
});
