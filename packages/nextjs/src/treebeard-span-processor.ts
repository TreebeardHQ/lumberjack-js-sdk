import { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Context } from "@opentelemetry/api";
import { TreebeardCore } from "@treebeardhq/core";

export class TreebeardSpanProcessor implements SpanProcessor {
  constructor(private options: { debug?: boolean | undefined }) {}

  onStart(span: ReadableSpan, _parentContext: Context) {
    if (span.attributes["next.span_type"] === "BaseServer.handleRequest") {
      if (this.options.debug) {
        console.debug("[Treebeard] Starting span:", span.name, span);
      }
      const traceID = span.spanContext().traceId;
      const spanID = span.spanContext().spanId;
      const traceName =
        (span.attributes["next.span_name"] as string) || "Unknown";
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
