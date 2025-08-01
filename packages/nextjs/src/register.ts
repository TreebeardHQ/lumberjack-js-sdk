import { LumberjackConfig, LumberjackCore } from "@lumberjack-sdk/core";

export interface InstrumentationOptions extends LumberjackConfig {
  debug?: boolean;
  projectName?: string;
}

/**
 * Register Lumberjack instrumentation for Next.js applications
 * Call this in your instrumentation.ts file
 */
export function register(
  options: InstrumentationOptions = {}
): LumberjackCore | undefined {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const headers = require("next/headers");
    try {
      // Initialize OpenTelemetry SDK
      return LumberjackCore.init({
        ...options,
        projectName: options.projectName!,
        getHeaders: async () => {
          const h = await headers.headers();
          const result = Object.fromEntries(h.entries());
          return result;
        },
      });
    } catch (error) {
      console.error("[Lumberjack] Failed to initialize OpenTelemetry:", error);
      return undefined;
    }
  }
  return undefined;
}
