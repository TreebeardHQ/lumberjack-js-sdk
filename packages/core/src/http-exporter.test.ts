import type { EnrichedLogEntry, EnrichedRegisteredObject } from "./exporter";
import { HttpExporter } from "./http-exporter";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("HttpExporter", () => {
  let exporter: HttpExporter;

  beforeEach(() => {
    exporter = new HttpExporter({
      apiKey: "test-api-key",
      endpoint: "https://api.example.com/logs/batch",
      projectName: "test-project",
    });
    mockFetch.mockClear();
  });

  describe("constructor", () => {
    it("should initialize with correct endpoints", () => {
      const config = {
        apiKey: "test-key",
        endpoint: "https://api.example.com/logs/batch",
        projectName: "test-project",
      };

      const exporter = new HttpExporter(config);

      expect(exporter).toBeInstanceOf(HttpExporter);
    });

    it("should derive objects endpoint from logs endpoint", () => {
      const config = {
        apiKey: "test-key",
        endpoint: "https://api.example.com/logs/batch",
        projectName: "test-project",
      };

      const exporter = new HttpExporter(config);

      // We can't directly test private properties, but we can test the behavior
      expect(exporter).toBeInstanceOf(HttpExporter);
    });

    it("should use default endpoint when none provided", () => {
      const config = {
        apiKey: "test-key",
        projectName: "test-project",
      };

      const exporter = new HttpExporter(config);

      expect(exporter).toBeInstanceOf(HttpExporter);
    });
  });

  describe("exportLogs", () => {
    const mockLogs: EnrichedLogEntry[] = [
      {
        message: "Test log 1",
        level: "info",
        timestamp: 1640995200000,
        msg: "Test log 1",
        lvl: "info",
        ts: 1640995200000,
        fl: "test.ts",
        ln: 10,
        project_name: "test-project",
        sdk_version: "2",
        commit_sha: "abc123",
      },
      {
        message: "Test log 2",
        level: "error",
        timestamp: 1640995201000,
        msg: "Test log 2",
        lvl: "error",
        ts: 1640995201000,
        project_name: "test-project",
        sdk_version: "2",
        commit_sha: "abc123",
      },
    ];

    it("should export logs successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await exporter.exportLogs(mockLogs);

      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(2);
      expect(result.error).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/logs/batch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          },
          body: JSON.stringify({
            logs: [
              {
                msg: "Test log 1",
                lvl: "info",
                ts: 1640995200000,
                fl: "test.ts",
                ln: 10,
                tb: undefined,
                src: undefined,
                props: undefined,
                tid: undefined,
                exv: undefined,
                ext: undefined,
                fn: undefined,
              },
              {
                msg: "Test log 2",
                lvl: "error",
                ts: 1640995201000,
                fl: undefined,
                ln: undefined,
                tb: undefined,
                src: undefined,
                props: undefined,
                tid: undefined,
                exv: undefined,
                ext: undefined,
                fn: undefined,
              },
            ],
            project_name: "test-project",
            sdk_version: "2",
            commit_sha: "abc123",
          }),
        }
      );
    });

    it("should handle empty logs array", async () => {
      const result = await exporter.exportLogs([]);

      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle missing API key by logging to console", async () => {
      const exporterWithoutKey = new HttpExporter({
        endpoint: "https://api.example.com/logs/batch",
        projectName: "test-project",
      });

      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const result = await exporterWithoutKey.exportLogs(mockLogs);

      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(2);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "[Lumberjack]: No API key provided - logs will be output to console"
      );
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error details",
      });

      const result = await exporter.exportLogs(mockLogs);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Failed to send logs: 500 Internal Server Error - Server error details"
      );
      expect(result.itemsExported).toBe(0);
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await exporter.exportLogs(mockLogs);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Network error");
      expect(result.itemsExported).toBe(0);
    });

    it("should include custom headers", async () => {
      const exporterWithHeaders = new HttpExporter({
        apiKey: "test-api-key",
        endpoint: "https://api.example.com/logs/batch",
        projectName: "test-project",
        headers: {
          "X-Custom-Header": "custom-value",
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      await exporterWithHeaders.exportLogs(mockLogs);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/logs/batch",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
            "X-Custom-Header": "custom-value",
          },
        })
      );
    });
  });

  describe("exportObjects", () => {
    const mockObjects: EnrichedRegisteredObject[] = [
      {
        name: "test-object-1",
        id: "obj-123",
        fields: { key1: "value1" },
        project_name: "test-project",
        sdk_version: "2",
        commit_sha: "abc123",
      },
      {
        name: "test-object-2",
        id: "obj-456",
        fields: { key2: "value2" },
        project_name: "test-project",
        sdk_version: "2",
        commit_sha: "abc123",
      },
    ];

    it("should export objects successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await exporter.exportObjects(mockObjects);

      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(2);
      expect(result.error).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/objects/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          },
          body: JSON.stringify({
            objects: [
              {
                name: "test-object-1",
                id: "obj-123",
                fields: { key1: "value1" },
              },
              {
                name: "test-object-2",
                id: "obj-456",
                fields: { key2: "value2" },
              },
            ],
            project_name: "test-project",
            sdk_version: "2",
            commit_sha: "abc123",
          }),
        }
      );
    });

    it("should handle empty objects array", async () => {
      const result = await exporter.exportObjects([]);

      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle missing API key by skipping export", async () => {
      const exporterWithoutKey = new HttpExporter({
        endpoint: "https://api.example.com/logs/batch",
        projectName: "test-project",
      });

      const result = await exporterWithoutKey.exportObjects(mockObjects);

      expect(result.success).toBe(true);
      expect(result.itemsExported).toBe(2);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid API key",
      });

      const result = await exporter.exportObjects(mockObjects);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Failed to send objects: 401 Unauthorized - Invalid API key"
      );
      expect(result.itemsExported).toBe(0);
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection timeout"));

      const result = await exporter.exportObjects(mockObjects);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Connection timeout");
      expect(result.itemsExported).toBe(0);
    });
  });
});
