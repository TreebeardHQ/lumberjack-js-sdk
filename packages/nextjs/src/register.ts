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
        const [, res] = args;
        const traceId = TreebeardContext.generateTraceId();
        const spanId = TreebeardContext.generateSpanId();
        const url = res.url;
        if (options.debug) {
          console.log("[Treebeard] Request started", { traceId, spanId, url });
        }

        res.on("finish", () => {
          if (options.debug) {
            // TODO: close span
            console.log("[Treebeard] Request finished", { traceId, spanId });
          }
        });

        res.on("error", (err: any) => {
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
          },
          () => {
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
