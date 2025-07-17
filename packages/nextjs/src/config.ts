import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import type { NextConfig } from "next";
import { join, relative } from "path";

export interface LumberjackConfigOptions {
  /**
   * Service token for uploading sourcemaps
   * Will be read from LUMBERJACK_SERVICE_TOKEN environment variable if not provided
   */
  serviceToken?: string;

  /**
   * Enable/disable sourcemap uploading
   * @default true
   */
  uploadSourceMaps?: boolean;

  /**
   * Custom sourcemap upload endpoint
   * @default 'https://api.trylumberjack.com/source_maps'
   */
  uploadUrl?: string;

  /**
   * Project identifier for sourcemap uploads
   * Will be read from package.json name if not provided
   */
  project?: string;

  /**
   * Git commit SHA to associate with sourcemaps
   * Will be auto-detected if not provided
   */
  commit?: string;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Get the current git commit SHA
 */
function getGitCommitSha(debug = false): string | null {
  try {
    const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    if (debug) {
      console.log("[Lumberjack] Detected git commit:", commit);
    }
    return commit;
  } catch (error) {
    if (debug) {
      console.warn("[Lumberjack] Failed to detect git commit:", error);
    }
    return null;
  }
}

/**
 * Get project name from package.json
 */
function getProjectName(debug = false): string | null {
  try {
    const packageJsonPath = join(process.cwd(), "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      const name = packageJson.name;
      if (debug) {
        console.log(
          "[Lumberjack] Detected project name from package.json:",
          name
        );
      }
      return name;
    }
  } catch (error) {
    if (debug) {
      console.warn(
        "[Lumberjack] Failed to read project name from package.json:",
        error
      );
    }
  }
  return null;
}

/**
 * Recursively find all .js.map files in a directory
 */
function findFilesRecursive(dir: string, extension: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...findFilesRecursive(fullPath, extension));
      } else if (stat.isFile() && entry.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore errors (directory might not exist or be accessible)
  }

  return files;
}

/**
 * Find all sourcemap files in the Next.js build output
 */
function findSourceMapFiles(
  debug = false
): Array<{ filePath: string; url: string }> {
  const buildDir = join(process.cwd(), ".next");
  const staticDir = join(buildDir, "static");
  const serverDir = join(buildDir, "server");

  const files: Array<{ filePath: string; url: string }> = [];

  // Find client-side source maps in .next/static
  if (existsSync(staticDir)) {
    try {
      const clientSourcemaps = findFilesRecursive(staticDir, ".js.map");

      clientSourcemaps.forEach((filePath: string) => {
        const relativePath = relative(staticDir, filePath);
        const url = `.next/static/${relativePath.replace(/\\/g, "/")}`;
        files.push({ filePath, url });
      });
    } catch (error) {
      if (debug) {
        console.warn(
          "[Lumberjack] Error finding client sourcemap files:",
          error
        );
      }
    }
  } else if (debug) {
    console.warn("[Lumberjack] No .next/static directory found");
  }

  // Find server-side source maps in .next/server
  if (existsSync(serverDir)) {
    try {
      const serverSourcemaps = findFilesRecursive(serverDir, ".js.map");

      serverSourcemaps.forEach((filePath: string) => {
        const relativePath = relative(serverDir, filePath);
        // Server files have a different URL pattern
        const url = `.next/server/${relativePath.replace(/\\/g, "/")}`;
        files.push({ filePath, url });
      });
    } catch (error) {
      if (debug) {
        console.warn(
          "[Lumberjack] Error finding server sourcemap files:",
          error
        );
      }
    }
  } else if (debug) {
    console.warn("[Lumberjack] No .next/server directory found");
  }

  if (debug) {
    console.log("[Lumberjack] Found sourcemap files:", files.length);
    files.forEach((file: { filePath: string; url: string }) => {
      console.log(`  ${file.url} -> ${file.filePath}`);
    });
  }

  return files;
}

/**
 * Create FormData for sourcemap upload
 */
async function createSourceMapFormData(
  files: Array<{ filePath: string; url: string }>,
  project: string,
  commit: string,
  debug = false
): Promise<FormData> {
  const formData = new FormData();

  // Add metadata
  formData.append("project", project);
  formData.append("commit", commit);
  formData.append("version", commit); // Use commit as version

  // Add each sourcemap file
  for (const file of files) {
    try {
      const content = readFileSync(file.filePath, "utf8");
      const blob = new Blob([content], { type: "application/json" });

      // Use the URL path as the field name
      formData.append("sourcemap", blob, file.url);

      if (debug) {
        console.log(
          `[Lumberjack] Added sourcemap: ${file.url} (${content.length} bytes)`
        );
      }
    } catch (error) {
      if (debug) {
        console.warn(
          `[Lumberjack] Failed to read sourcemap file ${file.filePath}:`,
          error
        );
      }
    }
  }

  return formData;
}

/**
 * Upload sourcemaps to Lumberjack
 */
async function uploadSourceMapsImpl(
  options: Required<
    Pick<
      LumberjackConfigOptions,
      "serviceToken" | "uploadUrl" | "project" | "commit" | "debug"
    >
  >
) {
  const { serviceToken, uploadUrl, project, commit, debug } = options;

  try {
    if (debug) {
      console.log("[Lumberjack] Starting sourcemap upload...", {
        project,
        commit,
        uploadUrl,
      });
    }

    // Find all sourcemap files
    const sourcemapFiles = findSourceMapFiles(debug);

    if (sourcemapFiles.length === 0) {
      if (debug) {
        console.log("[Lumberjack] No sourcemap files found, skipping upload");
      }
      return;
    }

    // Create form data
    const formData = await createSourceMapFormData(
      sourcemapFiles,
      project,
      commit,
      debug
    );

    if (debug) {
      console.log("[Lumberjack] Form data:", formData);
    }

    // Upload to Lumberjack API
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "User-Agent": "@lumberjack-sdk/nextjs",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (debug) {
      console.log("[Lumberjack] Sourcemap upload successful:", result);
    } else {
      console.log(
        `[Lumberjack] Successfully uploaded ${sourcemapFiles.length} sourcemap(s) for ${project}@${commit}`
      );
    }
  } catch (error) {
    console.error("[Lumberjack] Failed to upload sourcemaps:", error);
    throw error;
  }
}

/**
 * Validate service token and show warning if missing
 */
function validateServiceToken(
  serviceToken?: string,
  debug = false
): string | null {
  const token = serviceToken || process.env.LUMBERJACK_SERVICE_TOKEN;

  if (!token) {
    console.warn(
      "\n⚠️  [Lumberjack] Service token not found!\n" +
        "Sourcemap uploading is disabled. To enable it:\n" +
        "1. Get your service token from: https://app.trylumberjack.com/service-token\n" +
        "2. Set LUMBERJACK_SERVICE_TOKEN environment variable\n" +
        '   or pass it to withLumberjackConfig({ serviceToken: "..." })\n'
    );
    return null;
  }

  if (debug) {
    console.log("[Lumberjack] Service token found");
  }

  return token;
}

/**
 * Wraps Next.js config to add Lumberjack functionality
 */
export function withLumberjackConfig(
  nextConfig: NextConfig & LumberjackConfigOptions = {},
  lumberjackOptions: LumberjackConfigOptions = {}
): NextConfig {
  // Extract Lumberjack options from nextConfig and merge with lumberjackOptions
  const {
    serviceToken: configServiceToken,
    uploadSourceMaps: configUploadSourceMaps,
    uploadUrl: configUploadUrl,
    project: configProject,
    commit: configCommit,
    debug: configDebug,
    ...cleanNextConfig
  } = nextConfig;

  const {
    serviceToken = configServiceToken,
    uploadSourceMaps = configUploadSourceMaps ?? true,
    uploadUrl = configUploadUrl ?? "https://api.trylumberjack.com/source_maps",
    project = configProject,
    commit = configCommit,
    debug = configDebug ?? false,
  } = lumberjackOptions;

  const commitEnvVar = "LUMBERJACK_COMMIT_SHA";

  // Validate service token
  const validatedServiceToken = validateServiceToken(serviceToken, debug);

  // Get commit SHA
  const commitSha = commit || getGitCommitSha(debug);

  // Get project name
  const projectName = project || getProjectName(debug) || "unknown";

  if (debug) {
    console.log("[Lumberjack] Config wrapper initialized", {
      uploadSourceMaps,
      uploadUrl,
      project: projectName,
      commit: commitSha,
      hasServiceToken: !!validatedServiceToken,
    });
  }

  // Merge environment variables
  const env = {
    ...(nextConfig.env || {}),
  };

  // Add commit SHA to environment if available
  if (commitSha) {
    env[commitEnvVar] = commitSha;
    console.log(
      `[Lumberjack] Injected ${commitEnvVar}=${commitSha} into environment`
    );
  }

  // Create the enhanced config using the clean config
  const enhancedConfig: NextConfig = {
    ...cleanNextConfig,
    env,
    // Enable source maps for production builds
    productionBrowserSourceMaps:
      cleanNextConfig.productionBrowserSourceMaps ?? true,
  };

  // Check if user is using Turbopack by looking for --turbo flag or turbo: true in config
  const isTurbopack =
    process.argv.includes("--turbo") || cleanNextConfig.experimental?.turbo;

  if (!isTurbopack) {
    // Use webpack plugin for traditional webpack builds
    const originalWebpack = cleanNextConfig.webpack;
    enhancedConfig.webpack = (config, options) => {
      // Call original webpack config if it exists
      if (originalWebpack) {
        config = originalWebpack(config, options) || config;
      }

      // Enable source maps for server-side code in production
      if (!options.dev && options.isServer) {
        config.devtool = "source-map";
      }

      // Add sourcemap upload plugin for production builds
      if (
        !options.dev &&
        uploadSourceMaps &&
        validatedServiceToken &&
        commitSha
      ) {
        if (debug) {
          console.log("[Lumberjack] Adding sourcemap upload to webpack build");
        }

        // Add a plugin to upload sourcemaps after build
        config.plugins = config.plugins || [];
        config.plugins.push(
          new SourceMapUploadPlugin({
            serviceToken: validatedServiceToken,
            uploadUrl,
            project: projectName,
            commit: commitSha,
            debug,
          })
        );
      }

      return config;
    };
  } else {
    // For Turbopack, we'll need to use a different approach since webpack hooks aren't available
    // if (uploadSourceMaps && validatedServiceToken && commitSha) {
    //   if (debug) {
    //     console.log(
    //       "[Lumberjack] Turbopack detected, setting up post-build sourcemap upload"
    //     );
    //   }
    //   // Store upload configuration for later use
    //   const uploadConfig = {
    //     serviceToken: validatedServiceToken,
    //     uploadUrl,
    //     project: projectName,
    //     commit: commitSha,
    //     debug,
    //   };
    //   // Only set up upload for production builds (not dev)
    //   if (
    //     process.env.NODE_ENV === "production" &&
    //     process.env.NEXT_PHASE === "phase-production-build"
    //   ) {
    //     const handleExit = async () => {
    //       try {
    //         if (debug) {
    //           console.log(
    //             "[Lumberjack] Production build ending, uploading sourcemaps..."
    //           );
    //         }
    //         await uploadSourceMapsImpl(uploadConfig);
    //       } catch (error) {
    //         if (debug) {
    //           console.error(
    //             "[Lumberjack] Post-build sourcemap upload failed:",
    //             error
    //           );
    //         }
    //       }
    //     };
    //     // Register exit handlers for production builds only
    //     process.on("beforeExit", handleExit);
    //     process.on("exit", () => {
    //       // For synchronous cleanup, we can't await here
    //       if (debug) {
    //         console.log("[Lumberjack] Production build process exiting");
    //       }
    //     });
    //   } else if (debug) {
    //     console.log(
    //       "[Lumberjack] Turbopack dev mode - skipping sourcemap upload setup"
    //     );
    //   }
    // } else if (debug) {
    //   console.log(
    //     "[Lumberjack] Turbopack detected, but sourcemap upload not configured"
    //   );
    // }
  }

  return enhancedConfig;
}

/**
 * Webpack plugin to upload sourcemaps after build
 */
class SourceMapUploadPlugin {
  private options: Required<
    Pick<
      LumberjackConfigOptions,
      "serviceToken" | "uploadUrl" | "project" | "commit" | "debug"
    >
  >;

  constructor(
    options: Required<
      Pick<
        LumberjackConfigOptions,
        "serviceToken" | "uploadUrl" | "project" | "commit" | "debug"
      >
    >
  ) {
    this.options = options;
  }

  apply(compiler: any) {
    compiler.hooks.afterEmit.tapAsync(
      "SourceMapUploadPlugin",
      async (_compilation: any, callback: any) => {
        try {
          if (this.options.debug) {
            console.log(
              "[Lumberjack] Build completed, uploading sourcemaps...",
              this.options
            );
          }

          await uploadSourceMapsImpl(this.options);

          if (this.options.debug) {
            console.log("[Lumberjack] Sourcemap upload completed");
          }
        } catch (error) {
          console.error("[Lumberjack] Sourcemap upload failed:", error);
          // Don't fail the build, just log the error
        }

        callback();
      }
    );
  }
}

// Export internal functions for testing
export { createSourceMapFormData, findSourceMapFiles, uploadSourceMapsImpl };
