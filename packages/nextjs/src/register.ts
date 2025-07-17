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
    try {
      // Initialize OpenTelemetry SDK
      return LumberjackCore.init({
        ...options,
        projectName: options.projectName!,
      });
    } catch (error) {
      console.error("[Lumberjack] Failed to initialize OpenTelemetry:", error);
      return undefined;
    }
  }
  return undefined;
}
