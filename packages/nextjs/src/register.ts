import { TreebeardConfig, TreebeardCore } from "@treebeardhq/core";

export interface InstrumentationOptions extends TreebeardConfig {
  debug?: boolean;
  projectName?: string;
}

/**
 * Register Treebeard instrumentation for Next.js applications
 * Call this in your instrumentation.ts file
 */
export function register(options: InstrumentationOptions = {}) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // Custom span processor to intercept and log all spans

      // Initialize OpenTelemetry SDK
      TreebeardCore.init({
        ...options,
        projectName: options.projectName!,
      });
    } catch (error) {
      console.error("[Treebeard] Failed to initialize OpenTelemetry:", error);
    }
  }
}
