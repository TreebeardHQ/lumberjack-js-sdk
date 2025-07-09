/**
 * Simplified span types for OTLP export
 * These match the OTLP JSON schema but avoid dependencies on internal OpenTelemetry types
 */

type KeyValue = {
  key: string;
  value: AnyValue;
};

/**
 * AnyValue type for OTLP span attributes.
 * This matches the OTLP JSON schema for AnyValue.
 */
export type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: number }
  | { doubleValue: number }
  | { arrayValue: AnyValue[] }
  | { kvlistValue: KeyValue[] }
  | { bytesValue: string };

export type SpanAttributes = KeyValue[];

export interface SpanEvent {
  timeUnixNano: number;
  name: string;
  attributes?: SpanAttributes | undefined;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: SpanAttributes | undefined;
}

export interface SpanStatus {
  code: number; // 0=Unset, 1=Ok, 2=Error
  message?: string | undefined;
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  attributes?: SpanAttributes | undefined;
  events?: SpanEvent[] | undefined;
  links?: SpanLink[] | undefined;
  status?: SpanStatus | undefined;
}

export interface InstrumentationScope {
  name?: string;
  version?: string;
  attributes?: SpanAttributes | undefined;
}

export interface ScopeSpans {
  scope?: InstrumentationScope;
  spans: OTLPSpan[];
}

export interface Resource {
  attributes?: SpanAttributes | undefined;
}

export interface ResourceSpans {
  resource?: Resource;
  scopeSpans?: ScopeSpans[];
}

export interface SpanExportRequest {
  resourceSpans: ResourceSpans[];
}

export interface EnrichedSpanRequest extends SpanExportRequest {
  project_name: string;
  sdk_version: string;
  commit_sha?: string | undefined;
}

// Internal span representation for easier manipulation
export interface InternalSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string | undefined;
  name: string;
  kind?: number;
  startTimeNano: number;
  endTimeNano: number;
  attributes?: SpanAttributes | undefined;
  events?:
    | Array<{
        timeNano: number;
        name: string;
        attributes?: SpanAttributes | undefined;
      }>
    | undefined;
  status?:
    | {
        code: number;
        message?: string;
      }
    | undefined;
  serviceName?: string | undefined;
  instrumentationScope?:
    | {
        name?: string;
        version?: string;
      }
    | undefined;
}
