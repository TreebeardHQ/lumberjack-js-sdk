import { EventEmitter } from 'events';
import type { 
  IResourceSpans, 
  ISpan, 
  IScopeSpans 
} from '@opentelemetry/otlp-transformer/build/src/trace/internal-types';
import type { 
  IKeyValue, 
  IAnyValue,
  IInstrumentationScope
} from '@opentelemetry/otlp-transformer/build/src/common/internal-types';
import type { EnrichedSpanRequest } from './exporter.js';

export interface SpanBatchConfig {
  maxBatchSize?: number;
  maxBatchAge?: number;
  flushInterval?: number;
}

export interface InternalSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string | undefined;
  name: string;
  kind?: number;
  startTimeNano: number;
  endTimeNano: number;
  attributes?: Record<string, string | number | boolean> | undefined;
  events?: Array<{
    timeNano: number;
    name: string;
    attributes?: Record<string, string | number | boolean> | undefined;
  }> | undefined;
  status?: {
    code: number;
    message?: string;
  } | undefined;
  serviceName?: string | undefined;
  instrumentationScope?: {
    name?: string;
    version?: string;
  } | undefined;
}

export class SpanBatch extends EventEmitter {
  private spans: InternalSpan[] = [];
  private batchStartTime: number = Date.now();
  private flushTimer?: NodeJS.Timeout;
  private readonly config: Required<SpanBatchConfig>;

  constructor(config: SpanBatchConfig = {}) {
    super();
    this.config = {
      maxBatchSize: config.maxBatchSize || 100,
      maxBatchAge: config.maxBatchAge || 30000, // 30 seconds
      flushInterval: config.flushInterval || 5000, // 5 seconds
    };

    this.scheduleFlush();
  }

  addSpan(span: InternalSpan): void {
    this.spans.push(span);

    if (this.spans.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      const age = Date.now() - this.batchStartTime;
      if (this.spans.length > 0 && age >= this.config.maxBatchAge) {
        this.flush();
      }
      this.scheduleFlush();
    }, this.config.flushInterval);
  }

  flush(): void {
    if (this.spans.length === 0) {
      return;
    }

    const spansToFlush = [...this.spans];
    this.spans = [];
    this.batchStartTime = Date.now();

    // Convert internal spans to OTLP format
    const enrichedSpanRequest = this.createEnrichedSpanRequest(spansToFlush);
    
    this.emit('flush', enrichedSpanRequest);
  }

  private createEnrichedSpanRequest(spans: InternalSpan[]): EnrichedSpanRequest {
    // Group spans by service name
    const spansByService = new Map<string, InternalSpan[]>();
    
    for (const span of spans) {
      const serviceName = span.serviceName || 'unknown';
      if (!spansByService.has(serviceName)) {
        spansByService.set(serviceName, []);
      }
      spansByService.get(serviceName)!.push(span);
    }

    // Create ResourceSpans for each service
    const resourceSpans: IResourceSpans[] = [];
    
    for (const [serviceName, serviceSpans] of spansByService) {
      // Group spans by instrumentation scope
      const spansByScope = new Map<string, InternalSpan[]>();
      
      for (const span of serviceSpans) {
        const scopeKey = `${span.instrumentationScope?.name || '@treebeardhq/core'}:${span.instrumentationScope?.version || '1.0.0'}`;
        if (!spansByScope.has(scopeKey)) {
          spansByScope.set(scopeKey, []);
        }
        spansByScope.get(scopeKey)!.push(span);
      }

      // Create ScopeSpans for each scope
      const scopeSpans: IScopeSpans[] = [];
      
      for (const [scopeKey, scopeSpans_] of spansByScope) {
        const [name, version] = scopeKey.split(':');
        
        const scope: IInstrumentationScope = {
          name,
          version,
        };

        const otlpSpans: ISpan[] = scopeSpans_.map(span => this.convertInternalSpanToOTLP(span));

        scopeSpans.push({
          scope,
          spans: otlpSpans,
        });
      }

      resourceSpans.push({
        resource: {
          attributes: [this.createKeyValue('service.name', serviceName)],
          droppedAttributesCount: 0,
        },
        scopeSpans,
      });
    }

    return {
      resourceSpans,
      project_name: '', // Will be set by the exporter
      sdk_version: '1.0.0', // Will be set by the exporter
    } as EnrichedSpanRequest;
  }

  private createAnyValue(value: string | number | boolean): IAnyValue {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    }
    return { stringValue: String(value) };
  }

  private createKeyValue(key: string, value: string | number | boolean): IKeyValue {
    return { key, value: this.createAnyValue(value) };
  }

  private convertInternalSpanToOTLP(span: InternalSpan): ISpan {
    const otlpSpan: ISpan = {
      traceId: span.traceId,
      spanId: span.spanId,
      ...(span.parentSpanId && { parentSpanId: span.parentSpanId }),
      name: span.name,
      kind: span.kind || 0,
      startTimeUnixNano: span.startTimeNano,
      endTimeUnixNano: span.endTimeNano,
      attributes: [],
      droppedAttributesCount: 0,
      events: [],
      droppedEventsCount: 0,
      links: [],
      droppedLinksCount: 0,
      status: span.status || { code: 0 },
    };

    // Convert attributes
    if (span.attributes) {
      otlpSpan.attributes = Object.entries(span.attributes).map(([key, value]) =>
        this.createKeyValue(key, value)
      );
    }

    // Convert events
    if (span.events) {
      otlpSpan.events = span.events.map(event => ({
        timeUnixNano: event.timeNano,
        name: event.name,
        attributes: event.attributes
          ? Object.entries(event.attributes).map(([key, value]) =>
              this.createKeyValue(key, value)
            )
          : [],
        droppedAttributesCount: 0,
      }));
    }

    return otlpSpan;
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined as any;
    }
    this.flush();
  }
}