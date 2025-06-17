import {
  detectRuntime,
  TreebeardConfig,
  TreebeardContext,
  TreebeardCore,
} from "@treebeardhq/core";
import http from "node:http";
let isRegistered = false;

export interface InstrumentationOptions extends TreebeardConfig {
  debug?: boolean;
}

/**
 * Register Treebeard instrumentation for Next.js applications
 * Call this in your instrumentation.ts file
 */
export function register(options: InstrumentationOptions = {}) {
  if (isRegistered) {
    if (options.debug) {
      console.log("[Treebeard] Already registered, skipping");
    }
    return;
  }

  const runtime = detectRuntime();

  if (options.debug) {
    console.log(
      "[Treebeard] Registering instrumentation for runtime:",
      runtime
    );
  }

  // Initialize Treebeard SDK as singleton
  const treebeard = TreebeardCore.init({
    ...options,
    captureConsole: options.captureConsole || false,
    captureUnhandled: true,
  });

  // Add graceful shutdown for Node.js runtime only
  if (runtime.isNode && runtime.hasProcess) {
    const handleShutdown = async (signal: string) => {
      if (options.debug) {
        console.log(`[Treebeard] Received ${signal}, shutting down gracefully`);
      }
      await treebeard.shutdown();
      process.exit(0);
    };

    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));

    if (options.debug) {
      console.log(
        "[Treebeard] Registered SIGTERM/SIGINT handlers for graceful shutdown"
      );
    }
  } else if (options.debug) {
    console.log(
      "[Treebeard] Skipping SIGTERM handlers (not in Node.js runtime)"
    );
  }

  if (runtime.isNode) {
    const originalEmit = http.Server.prototype.emit;
    if (options.debug) {
      console.log("[Treebeard] Registering request instrumentation");
    }
    // @ts-ignore
    http.Server.prototype.emit = function (event: string, ...args: any[]) {
      if (event === "request") {
        const [req, res] = args;
        const traceId = TreebeardContext.generateTraceId();
        const spanId = TreebeardContext.generateSpanId();
        const fullTrace = `00-${traceId}-${spanId}-01`;

        res.setHeader("X-Treebeard-Trace", fullTrace);

        const path = req.url;

        if (options.debug) {
          console.log("[Treebeard] Request started", {
            traceId,
            spanId,
            path,
          });
        }

        res.on("finish", () => {
          if (options.debug) {
            // TODO: close span
            console.log("[Treebeard] Request finished", { traceId, spanId });
          }

          treebeard.completeTrace(traceId, spanId, true);
        });

        res.on("error", (err: any) => {
          treebeard.completeTrace(traceId, spanId, false, {
            error: err,
          });

          if (options.debug) {
            console.log("[Treebeard] Response error", {
              traceId,
              spanId,
              error: err,
            });
          }
        });

        return TreebeardContext.run(
          {
            traceId,
            spanId,
            traceName: `${req.method} ${normalizePath(path)}`,
          },
          () => {
            if (options.debug) {
              console.log("[Treebeard] Request starting", { traceId, spanId });
            }
            treebeard.startTrace(traceId, spanId, "Request", {
              method: req.method,
              path,
            });
            return originalEmit.apply(this, arguments as any);
          }
        );
      } else {
        if (options.debug) {
          console.log("[Treebeard] default emit");
        }
        return originalEmit.apply(this, arguments as any);
      }
    };
  }

  isRegistered = true;

  if (options.debug) {
    console.log("[Treebeard] Instrumentation registered successfully");
  }

  return {
    treebeard,
  };
}

function normalizePath(path: string): string {
  // Remove trailing slashes
  let normalized = path.replace(/\/+$/, "");

  // Remove query parameters and hash fragments
  normalized = normalized.split("?")[0].split("#")[0];

  // Replace multiple consecutive slashes with a single slash
  normalized = normalized.replace(/\/+/g, "/");

  // Ensure path starts with a slash
  if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }

  // Handle empty path case
  if (normalized === "") {
    normalized = "/";
  }

  // Split path into segments
  const segments = normalized.split("/").filter(Boolean);

  // Process segments to replace IDs with named parameters
  const processedSegments = segments.map((segment, index) => {
    // Check if segment is a UUID (8-4-4-4-12 format)
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        segment
      );
    // Check if segment is a number
    const isNumber = /^\d+$/.test(segment);

    if (isUUID || isNumber) {
      // Get the preceding segment name or use 'id' if it's the first segment
      const paramName =
        index > 0 ? segments[index - 1].replace(/s$/, "") : "id";
      return `:${paramName}`;
    }
    return segment;
  });

  // Reconstruct the path
  return "/" + processedSegments.join("/");
}
