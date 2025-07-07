import { TreebeardConfig, TreebeardCore, getCommitSha } from "@treebeardhq/core";

import { trace } from "@opentelemetry/api";
import * as Resources from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/esm/trace/internal";

export interface InstrumentationOptions extends TreebeardConfig {
  debug?: boolean;
  projectName?: string;
}

import { Context } from "@opentelemetry/api";
import { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";

/**
 * Custom OpenTelemetry SpanProcessor that captures all spans and exports them
 * through Treebeard's core SDK in OTLP format. Provides comprehensive distributed
 * tracing without manual instrumentation.
 */
class TreebeardSpanProcessor implements SpanProcessor {
  private pendingSpans: ReadableSpan[] = [];
  private flushTimeout?: NodeJS.Timeout;
  
  constructor(private options: { debug?: boolean | undefined }) {}

  onStart(span: ReadableSpan, _parentContext: Context) {
    if (this.options.debug) {
      console.debug("[Treebeard] Starting span:", span.name, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        name: span.name,
        kind: span.kind,
        attributes: span.attributes
      });
    }
  }

  onEnd(span: ReadableSpan) {
    // Always collect the span for export
    this.pendingSpans.push(span);
    
    if (this.options.debug) {
      console.debug("[Treebeard] Collected span:", span.name, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        name: span.name,
        kind: span.kind,
        status: span.status,
        duration: span.duration
      });
    }

    // Batch export spans (export immediately or batch them)
    this.scheduleSpanExport();
  }

  private scheduleSpanExport() {
    // Export spans in batches for better performance
    if (this.pendingSpans.length >= 10) {
      this.exportPendingSpans();
    } else if (!this.flushTimeout) {
      // Export remaining spans after a delay
      this.flushTimeout = setTimeout(() => {
        this.exportPendingSpans();
      }, 5000); // 5 second delay
    }
  }

  /**
   * Exports accumulated spans to Treebeard core SDK in OTLP format
   */
  private exportPendingSpans() {
    if (this.pendingSpans.length === 0) return;

    try {
      // Convert OpenTelemetry spans to OTLP format using official transformer
      const otlpRequest = createExportTraceServiceRequest(this.pendingSpans);
      
      // Get core instance and export through unified export system
      const coreInstance = TreebeardCore.getInstance();
      if (coreInstance && coreInstance.getConfig().exporter) {
        // Enrich with metadata and send through core SDK exporter
        const enrichedRequest = {
          ...otlpRequest,
          project_name: coreInstance.getConfig().projectName,
          sdk_version: '2',
          commit_sha: getCommitSha()
        };

        coreInstance.getConfig().exporter!.exportSpans(enrichedRequest).catch(error => {
          console.error('[Treebeard] Failed to export spans:', error);
        });

        if (this.options.debug) {
          console.debug(`[Treebeard] Exported ${this.pendingSpans.length} spans to core SDK`);
        }
      }
    } catch (error) {
      console.error('[Treebeard] Error converting spans to OTLP format:', error);
    }

    // Clear pending spans and reset timer
    this.pendingSpans = [];
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = undefined as any;
    }
  }

  shutdown() {
    this.exportPendingSpans();
    return TreebeardCore.getInstance()?.flush() || Promise.resolve();
  }

  forceFlush() {
    this.exportPendingSpans();
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
