import { TreebeardConfig, TreebeardCore, TreebeardSpanProcessor } from "@treebeardhq/core";

import { trace } from "@opentelemetry/api";
import * as Resources from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

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
      const sdk = new NodeSDK({
        resource: Resources.resourceFromAttributes({
          [ATTR_SERVICE_NAME]: options.projectName,
        }),
        spanProcessor: new TreebeardSpanProcessor({
          debug: options.debug,
        }),
      });

      sdk.start();
      TreebeardCore.init({
        ...options,
        projectName: options.projectName!,
      });

      TreebeardCore.getInstance()?.registerInjection(() => {
        const currentSpan = trace.getActiveSpan();

        if (options.debug) {
          console.debug("[Treebeard] injecting span context:", currentSpan);
        }

        if (!currentSpan) {
          console.warn("[Treebeard] No active span found for injection.");
          return {};
        }

        return {
          traceContext: {
            traceId: currentSpan.spanContext().traceId,
            spanId: currentSpan.spanContext().spanId,
          },
        };
      });
    } catch (error) {
      console.error("[Treebeard] Failed to initialize OpenTelemetry:", error);
    }
  }
}
