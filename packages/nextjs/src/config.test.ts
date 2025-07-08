import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

describe("Source Map Upload", () => {
  const testDir = join(process.cwd(), "test-next-build");
  const staticDir = join(testDir, ".next", "static");
  const serverDir = join(testDir, ".next", "server");

  beforeEach(() => {
    // Clean up any existing test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Create test directory structure
    mkdirSync(staticDir, { recursive: true });
    mkdirSync(serverDir, { recursive: true });
    mkdirSync(join(serverDir, "app", "api", "hello"), { recursive: true });
    mkdirSync(join(serverDir, "app"), { recursive: true });
    mkdirSync(join(staticDir, "chunks"), { recursive: true });

    // Mock process.cwd to return our test directory
    jest.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe("findSourceMapFiles", () => {
    it("should find both client-side and server-side source maps", async () => {
      // Create mock source map files
      const clientSourceMaps = [
        "chunks/main.js.map",
        "chunks/framework.js.map",
        "chunks/app/layout.js.map",
      ];

      const serverSourceMaps = [
        "app/page.js.map",
        "app/api/hello/route.js.map",
        "chunks/580.js.map",
        "pages/_app.js.map",
      ];

      // Create client-side source maps
      clientSourceMaps.forEach((file) => {
        const filePath = join(staticDir, file);
        mkdirSync(join(filePath, ".."), { recursive: true });
        writeFileSync(
          filePath,
          JSON.stringify({
            version: 3,
            sources: [`${file.replace(".js.map", ".js")}`],
            names: [],
            mappings: "AAAA",
          })
        );
      });

      // Create server-side source maps
      serverSourceMaps.forEach((file) => {
        const filePath = join(serverDir, file);
        mkdirSync(join(filePath, ".."), { recursive: true });
        writeFileSync(
          filePath,
          JSON.stringify({
            version: 3,
            sources: [`${file.replace(".js.map", ".js")}`],
            names: [],
            mappings: "AAAA",
          })
        );
      });

      // Import the actual function to test
      const { findSourceMapFiles } = await import("./config");

      const result = findSourceMapFiles(false);

      // Should find all source maps
      expect(result).toHaveLength(
        clientSourceMaps.length + serverSourceMaps.length
      );

      // Check client-side source maps have correct URL patterns
      const clientResults = result.filter((file) =>
        file.url.includes(".next/static/")
      );
      expect(clientResults).toHaveLength(clientSourceMaps.length);

      clientResults.forEach((file) => {
        expect(file.url).toMatch(/\.next\/static\/.+\.js\.map$/);
        expect(file.filePath).toContain(".next/static");
      });

      // Check server-side source maps have correct URL patterns
      const serverResults = result.filter((file) =>
        file.url.includes(".next/server/")
      );
      expect(serverResults).toHaveLength(serverSourceMaps.length);

      serverResults.forEach((file) => {
        expect(file.url).toMatch(/\.next\/server\/.+\.js\.map$/);
        expect(file.filePath).toContain(".next/server");
      });

      // Verify specific files are found
      expect(
        result.some((f) => f.url.includes("/api/hello/route.js.map"))
      ).toBe(true);
      expect(result.some((f) => f.url.includes("/app/page.js.map"))).toBe(true);
      expect(result.some((f) => f.url.includes("/chunks/main.js.map"))).toBe(
        true
      );
    });

    it("should handle missing directories gracefully", async () => {
      // Remove the directories
      rmSync(staticDir, { recursive: true, force: true });
      rmSync(serverDir, { recursive: true, force: true });

      const { findSourceMapFiles } = await import("./config");
      const result = findSourceMapFiles(false);

      expect(result).toHaveLength(0);
    });

    it("should include API route source maps", async () => {
      // Create specific API route source map
      const apiRouteMap = join(
        serverDir,
        "app",
        "api",
        "hello",
        "route.js.map"
      );
      writeFileSync(
        apiRouteMap,
        JSON.stringify({
          version: 3,
          sources: ["route.ts"],
          names: [],
          mappings: "AAAA",
        })
      );

      const { findSourceMapFiles } = await import("./config");
      const result = findSourceMapFiles(false);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe(".next/server/app/api/hello/route.js.map");
      expect(result[0].filePath).toBe(apiRouteMap);
    });

    it("should include server component source maps", async () => {
      // Create server component source map
      const pageMap = join(serverDir, "app", "page.js.map");
      writeFileSync(
        pageMap,
        JSON.stringify({
          version: 3,
          sources: ["page.tsx"],
          names: [],
          mappings: "AAAA",
        })
      );

      const { findSourceMapFiles } = await import("./config");
      const result = findSourceMapFiles(false);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe(".next/server/app/page.js.map");
      expect(result[0].filePath).toBe(pageMap);
    });

    it("should log debug information when debug is enabled", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // Create a source map file
      writeFileSync(join(staticDir, "test.js.map"), "{}");

      const { findSourceMapFiles } = await import("./config");
      findSourceMapFiles(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Treebeard] Found sourcemap files:",
        1
      );

      consoleSpy.mockRestore();
    });
  });

  describe("withTreebeardConfig webpack integration", () => {
    it("should enable server-side source maps in production", async () => {
      const { withTreebeardConfig } = await import("./config");

      const mockWebpackConfig = {
        devtool: undefined,
      };

      const nextConfig = withTreebeardConfig(
        {},
        {
          serviceToken: "test-token",
          uploadSourceMaps: true,
          debug: false,
        }
      );

      // Simulate webpack being called for server build
      const webpackResult = nextConfig.webpack!(mockWebpackConfig, {
        dev: false,
        isServer: true,
        buildId: "test",
        config: {},
        defaultLoaders: {},
        totalPages: 1,
        webpack: null,
      } as any);

      expect(webpackResult.devtool).toBe("source-map");
    });

    it("should not modify devtool for client builds", async () => {
      const { withTreebeardConfig } = await import("./config");

      const mockWebpackConfig = {
        devtool: "eval-source-map",
      };

      const nextConfig = withTreebeardConfig(
        {},
        {
          serviceToken: "test-token",
          uploadSourceMaps: true,
        }
      );

      const webpackResult = nextConfig.webpack!(mockWebpackConfig, {
        dev: false,
        isServer: false,
        buildId: "test",
        config: {},
        defaultLoaders: {},
        totalPages: 1,
        webpack: null,
      } as any);

      expect(webpackResult.devtool).toBe("eval-source-map");
    });

    it("should not modify devtool in development", async () => {
      const { withTreebeardConfig } = await import("./config");

      const mockWebpackConfig = {
        devtool: "eval",
      };

      const nextConfig = withTreebeardConfig(
        {},
        {
          serviceToken: "test-token",
          uploadSourceMaps: true,
        }
      );

      const webpackResult = nextConfig.webpack!(mockWebpackConfig, {
        dev: true,
        isServer: true,
        buildId: "test",
        config: {},
        defaultLoaders: {},
        totalPages: 1,
        webpack: null,
      } as any);

      expect(webpackResult.devtool).toBe("eval");
    });
  });

  describe("integration", () => {
    it("should upload both client and server source maps", async () => {
      // Create mixed source maps
      mkdirSync(join(staticDir, "chunks"), { recursive: true });
      mkdirSync(join(serverDir, "app", "api", "test"), { recursive: true });
      writeFileSync(join(staticDir, "chunks", "main.js.map"), '{"version":3}');
      writeFileSync(
        join(serverDir, "app", "api", "test", "route.js.map"),
        '{"version":3}'
      );

      const { findSourceMapFiles, createSourceMapFormData } = await import(
        "./config"
      );

      const files = findSourceMapFiles(false);
      expect(files).toHaveLength(2);

      // Test form data creation
      const formData = await createSourceMapFormData(
        files,
        "test-project",
        "test-commit",
        false
      );

      // Should have metadata fields
      expect(formData.get("project")).toBe("test-project");
      expect(formData.get("commit")).toBe("test-commit");
      expect(formData.get("version")).toBe("test-commit");

      // Should have sourcemap files
      const sourcemapEntries = formData.getAll("sourcemap");
      expect(sourcemapEntries).toHaveLength(2);
    });
  });
});
