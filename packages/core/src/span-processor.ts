import { Context } from "@opentelemetry/api";
import { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { LumberjackCore } from "./core";

/**
 * Custom OpenTelemetry SpanProcessor that captures all spans and exports them
 * through Lumberjack's core SDK in OTLP format. Provides comprehensive distributed
 * tracing without manual instrumentation.
 */
export class LumberjackSpanProcessor implements SpanProcessor {
  private instance: LumberjackCore;
  constructor(
    private options: { debug?: boolean | undefined; instance: LumberjackCore }
  ) {
    this.instance = options.instance;
  }

  onStart(span: ReadableSpan, _parentContext: Context) {
    if (
      this.options.debug &&
      span.attributes["next.span_type"] === "BaseServer.handleRequest"
    ) {
      console.debug("[Lumberjack] Starting span:", span.name);
    }
  }

  onEnd(span: ReadableSpan) {
    if (span.attributes["next.span_type"] === "BaseServer.handleRequest") {
      // Always collect the span for export
      this.instance.addSpan(span);
      if (this.options.debug) {
        console.debug("[Lumberjack] Collected span:", span.name, {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          name: span.name,
          kind: span.kind,
          status: span.status,
          duration: span.duration,
        });
      }
    }
  }

  shutdown() {
    return this.instance.flushAll() || Promise.resolve();
  }

  forceFlush() {
    return this.instance.flushAll() || Promise.resolve();
  }
}
