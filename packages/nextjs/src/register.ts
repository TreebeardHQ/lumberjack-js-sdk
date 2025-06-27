import { TreebeardConfig, TreebeardCore } from "@treebeardhq/core";

import { trace } from "@opentelemetry/api";
import * as Resources from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export interface InstrumentationOptions extends TreebeardConfig {
  debug?: boolean;
  projectName?: string;
}

import { Context } from "@opentelemetry/api";
import { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";

class TreebeardSpanProcessor implements SpanProcessor {
  constructor(private options: { debug?: boolean | undefined }) {}

  onStart(span: ReadableSpan, _parentContext: Context) {
    if (span.attributes["next.span_type"] === "BaseServer.handleRequest") {
      if (this.options.debug) {
        console.debug("[Treebeard] Starting span:", span.name, span);
      }
      const traceID = span.spanContext().traceId;
      const spanID = span.spanContext().spanId;
      const traceName = (span.attributes["next.route"] as string) || "Unknown";
      TreebeardCore.getInstance()?.startTrace(traceID, spanID, traceName, {});
    }
  }

  onEnd(span: ReadableSpan) {
    if (span.attributes["next.span_type"] === "BaseServer.handleRequest") {
      if (this.options.debug) {
        console.debug("[Treebeard] Ending span:", span.name, span);
      }
      const traceID = span.spanContext().traceId;
      const spanID = span.spanContext().spanId;

      const success = span.status.code !== 2; // SpanStatusCode.ERROR
      TreebeardCore.getInstance()?.completeTrace(traceID, spanID, success);
    }
  }

  shutdown() {
    return TreebeardCore.getInstance()?.flush() || Promise.resolve();
  }

  forceFlush() {
    return TreebeardCore.getInstance()?.flush() || Promise.resolve();
  }
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
