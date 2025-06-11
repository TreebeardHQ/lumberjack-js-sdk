import { AsyncLocalStorage } from 'async_hooks';
import { TraceContext } from './types.js';

class TreebeardContext {
  private static asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

  static run<T>(store: TraceContext, callback: () => T): T {
    return this.asyncLocalStorage.run(store, callback);
  }

  static runAsync<T>(store: TraceContext, callback: () => Promise<T>): Promise<T> {
    return this.asyncLocalStorage.run(store, callback);
  }

  static getStore(): TraceContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  static set(key: string, value: any): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      store[key] = value;
    }
  }

  static get<T>(key: string, defaultValue?: T): T | undefined {
    const store = this.asyncLocalStorage.getStore();
    return store?.[key] ?? defaultValue;
  }

  static getTraceId(): string | undefined {
    return this.get('traceId');
  }

  static getSpanId(): string | undefined {
    return this.get('spanId');
  }

  static setTraceId(traceId: string): void {
    this.set('traceId', traceId);
  }

  static setSpanId(spanId: string): void {
    this.set('spanId', spanId);
  }

  static generateTraceId(): string {
    return `T${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateSpanId(): string {
    return `S${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  }

  static clear(): void {
    const store = this.getStore();
    if (store) {
      Object.keys(store).forEach(key => delete store[key]);
    }
  }
}

export { TreebeardContext };