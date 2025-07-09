import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import {
  EnrichedSpanRequest,
  OTLPSpan,
  ResourceSpans,
  SpanAttributes,
} from "./span-types";

/**
 * Convert OpenTelemetry ReadableSpan to our OTLP format
 */
export function convertReadableSpansToOTLP(
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

  const resourceSpans: ResourceSpans[] = Array.from(
    spansByResource.entries()
  ).map(([serviceName, spans]) => ({
    resource: {
      attributes: [
        {
          key: "service.name",
          value: { stringValue: serviceName },
        },
      ],
    },
    scopeSpans: [
      {
        scope: {
          name: spans[0]?.instrumentationScope?.name || "@treebeardhq/core",
          version: spans[0]?.instrumentationScope?.version || "1.0.0",
        },
        spans: spans.map((span) => {
          // Convert OpenTelemetry attributes to simple key-value pairs
          const attributes: SpanAttributes = convertSpanAttributesToOTLP(
            span.attributes
          );

          const result: OTLPSpan = {
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
            name: span.name,
            kind: span.kind,
            startTimeUnixNano:
              span.startTime[0] * 1000000000 + span.startTime[1],
            endTimeUnixNano: span.endTime[0] * 1000000000 + span.endTime[1],
            attributes,
            events: span.events?.map((event) => {
              const eventAttributes: SpanAttributes = event.attributes
                ? convertSpanAttributesToOTLP(event.attributes)
                : [];

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
  }));

  return {
    resourceSpans,
    project_name: "", // Will be set by caller
    sdk_version: "2",
  };
}

export function convertSpanAttributesToOTLP(
  attributes: ReadableSpan["attributes"]
): SpanAttributes {
  const result: SpanAttributes = [];
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) {
        if (typeof value === "string") {
          result.push({
            key,
            value: { stringValue: String(value) },
          });
        } else if (typeof value === "number") {
          result.push({
            key,
            value: { intValue: value },
          });
        } else if (typeof value === "boolean") {
          result.push({
            key,
            value: { boolValue: value },
          });
        } else {
          result.push({
            key,
            value: { stringValue: String(value) },
          });
        }
      }
    }
  }
  return result;
}

export class SpanBatch {
  private spans: ReadableSpan[] = [];
  private maxSize: number;
  private maxAge: number;
  private lastFlush: number;

  constructor(maxSize = 500, maxAge = 30000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.lastFlush = Date.now();
  }

  add(span: ReadableSpan): boolean {
    this.spans.push(span);

    const shouldFlush =
      this.spans.length >= this.maxSize ||
      Date.now() - this.lastFlush >= this.maxAge;

    return shouldFlush;
  }

  getSpans(): ReadableSpan[] {
    const spans = [...this.spans];
    this.spans = [];
    this.lastFlush = Date.now();
    return spans;
  }

  get size(): number {
    return this.spans.length;
  }
}
