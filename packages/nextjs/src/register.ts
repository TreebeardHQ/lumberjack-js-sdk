import { LumberjackConfig, LumberjackCore } from "@lumberjack-sdk/core";

export interface InstrumentationOptions extends LumberjackConfig {
  debug?: boolean;
  projectName?: string;
}

/**
 * Register Lumberjack instrumentation for Next.js applications
 * Call this in your instrumentation.ts file
 */
export function register(options: InstrumentationOptions = {}) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // Custom span processor to intercept and log all spans

      // Initialize OpenTelemetry SDK
      LumberjackCore.init({
        ...options,
        projectName: options.projectName!,
      });
    } catch (error) {
      console.error("[Lumberjack] Failed to initialize OpenTelemetry:", error);
    }
  }
}
