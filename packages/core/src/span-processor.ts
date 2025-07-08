import { Context } from "@opentelemetry/api";
import { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { TreebeardCore } from "./core.js";
import { getCommitSha } from "./environment.js";
import type { EnrichedSpanRequest } from "./span-types.js";

/**
 * Convert OpenTelemetry ReadableSpan to our OTLP format
 */
function convertReadableSpansToOTLP(
  spans: ReadableSpan[]
): EnrichedSpanRequest {
  // Group spans by resource (service name)
  const spansByResource = new Map<string, ReadableSpan[]>();

  for (const span of spans) {
    const serviceName =
      (span.resource.attributes["service.name"] as string) || "unknown";
    if (!spansByResource.has(serviceName)) {
      spansByResource.set(serviceName, []);
    }
    spansByResource.get(serviceName)!.push(span);
  }

  const resourceSpans = Array.from(spansByResource.entries()).map(
    ([serviceName, spans]) => ({
      resource: {
        attributes: { "service.name": serviceName },
      },
      scopeSpans: [
        {
          scope: {
            name: spans[0]?.instrumentationScope?.name || "@treebeardhq/core",
            version: spans[0]?.instrumentationScope?.version || "1.0.0",
          },
          spans: spans.map((span) => {
            // Convert OpenTelemetry attributes to simple key-value pairs
            const attributes: Record<string, string | number | boolean> = {};
            if (span.attributes) {
              for (const [key, value] of Object.entries(span.attributes)) {
                if (value !== undefined && value !== null) {
                  if (
                    typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean"
                  ) {
                    attributes[key] = value;
                  } else {
                    attributes[key] = String(value);
                  }
                }
              }
            }

            const result: any = {
              traceId: span.spanContext().traceId,
              spanId: span.spanContext().spanId,
              name: span.name,
              kind: span.kind,
              startTimeUnixNano:
                span.startTime[0] * 1000000000 + span.startTime[1],
              endTimeUnixNano: span.endTime[0] * 1000000000 + span.endTime[1],
              attributes,
              events: span.events?.map((event) => {
                const eventAttributes: Record<
                  string,
                  string | number | boolean
                > = {};
                if (event.attributes) {
                  for (const [key, value] of Object.entries(event.attributes)) {
                    if (value !== undefined && value !== null) {
                      if (
                        typeof value === "string" ||
                        typeof value === "number" ||
                        typeof value === "boolean"
                      ) {
                        eventAttributes[key] = value;
                      } else {
                        eventAttributes[key] = String(value);
                      }
                    }
                  }
                }
                return {
                  timeUnixNano: event.time[0] * 1000000000 + event.time[1],
                  name: event.name,
                  attributes: eventAttributes,
                };
              }),
              status: {
                code: span.status.code,
                message: span.status.message || undefined,
              },
            };

            // Add parentSpanId if available
            const spanContext = span.spanContext();
            if (spanContext.traceFlags && (span as any).parentSpanId) {
              result.parentSpanId = (span as any).parentSpanId;
            }

            return result;
          }),
        },
      ],
    })
  );

  return {
    resourceSpans,
    project_name: "", // Will be set by caller
    sdk_version: "2",
  };
}

/**
 * Custom OpenTelemetry SpanProcessor that captures all spans and exports them
 * through Treebeard's core SDK in OTLP format. Provides comprehensive distributed
 * tracing without manual instrumentation.
 */
export class TreebeardSpanProcessor implements SpanProcessor {
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
        attributes: span.attributes,
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
        duration: span.duration,
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
      // Convert OpenTelemetry spans to OTLP format using our converter
      const otlpRequest = convertReadableSpansToOTLP(this.pendingSpans);

      // Get core instance and export through unified export system
      const coreInstance = TreebeardCore.getInstance();
      if (coreInstance && coreInstance.getConfig().exporter) {
        // Enrich with metadata and send through core SDK exporter
        const enrichedRequest: EnrichedSpanRequest = {
          ...otlpRequest,
          project_name: coreInstance.getConfig().projectName,
          sdk_version: "2",
          commit_sha: getCommitSha(),
        };

        if (this.options.debug) {
          console.debug("[Treebeard] Exporting spans:", enrichedRequest);
        }

        coreInstance
          .getConfig()
          .exporter!.exportSpans(enrichedRequest)
          .catch((error) => {
            console.error("[Treebeard] Failed to export spans:", error);
          });

        if (this.options.debug) {
          console.debug(
            `[Treebeard] Exported ${this.pendingSpans.length} spans to core SDK`
          );
        }
      } else {
        if (this.options.debug) {
          console.debug("[Treebeard] No exporter found");
        }
      }
    } catch (error) {
      console.error(
        "[Treebeard] Error converting spans to OTLP format:",
        error
      );
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
