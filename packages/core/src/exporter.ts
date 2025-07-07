import type { LogEntry } from './types.js';
import type { RegisteredObject } from './object-batch.js';

export interface ExportResult {
  success: boolean;
  error?: Error;
  itemsExported?: number;
}

export interface ExporterConfig {
  apiKey?: string;
  endpoint?: string;
  projectName?: string;
  headers?: Record<string, string>;
}

export interface EnrichedLogEntry extends LogEntry {
  msg: string;
  lvl: string;
  ts: number;
  fl?: string | undefined;
  ln?: number | undefined;
  tb?: string | undefined;
  src?: string | undefined;
  tid?: string | undefined;
  exv?: string | undefined;
  ext?: string | undefined;
  fn?: string | undefined;
  project_name: string;
  sdk_version: string;
  commit_sha?: string | undefined;
}

export interface EnrichedRegisteredObject extends RegisteredObject {
  project_name: string;
  sdk_version: string;
  commit_sha?: string | undefined;
}

export interface Exporter {
  exportLogs(logs: EnrichedLogEntry[]): Promise<ExportResult>;
  exportObjects(objects: EnrichedRegisteredObject[]): Promise<ExportResult>;
  shutdown?(): Promise<void>;
}