import type { Exporter, ExporterConfig, ExportResult, EnrichedLogEntry, EnrichedRegisteredObject } from './exporter.js';
import type { LogEntryForAPI } from './types.js';

export class HttpExporter implements Exporter {
  private readonly config: ExporterConfig;
  private readonly logsEndpoint: string;
  private readonly objectsEndpoint: string;

  constructor(config: ExporterConfig) {
    this.config = config;
    const baseEndpoint = config.endpoint || 'https://api.treebeardhq.com/logs/batch';
    this.logsEndpoint = baseEndpoint;
    this.objectsEndpoint = baseEndpoint.replace('/logs/batch', '/objects/register');
  }

  async exportLogs(logs: EnrichedLogEntry[]): Promise<ExportResult> {
    if (logs.length === 0) {
      return { success: true, itemsExported: 0 };
    }

    if (!this.config.apiKey) {
      // Output to console when no API key is provided (backward compatibility)
      console.warn(
        "[Treebeard]: No API key provided - logs will be output to console"
      );
      logs.forEach((log) => console.log("[Treebeard]", JSON.stringify(log)));
      return { success: true, itemsExported: logs.length };
    }

    try {
      // Extract metadata from first log entry (all logs have same metadata)
      const firstLog = logs[0];
      const project_name = firstLog.project_name || this.config.projectName;
      const sdk_version = firstLog.sdk_version;
      const commit_sha = firstLog.commit_sha;

      // Transform logs to API format
      const apiLogs: LogEntryForAPI[] = logs.map((log) => ({
        msg: log.msg,
        lvl: log.lvl,
        ts: log.ts,
        fl: log.fl,
        ln: log.ln,
        tb: log.tb,
        src: log.src,
        props: log.props,
        tid: log.tid,
        exv: log.exv,
        ext: log.ext,
        fn: log.fn
      }));

      const response = await fetch(this.logsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...this.config.headers
        },
        body: JSON.stringify({
          logs: apiLogs,
          project_name,
          sdk_version,
          commit_sha
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send logs: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return { success: true, itemsExported: logs.length };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        itemsExported: 0
      };
    }
  }

  async exportObjects(objects: EnrichedRegisteredObject[]): Promise<ExportResult> {
    if (objects.length === 0) {
      return { success: true, itemsExported: 0 };
    }

    if (!this.config.apiKey) {
      // Skip object registration when no API key is provided (backward compatibility)
      return { success: true, itemsExported: objects.length };
    }

    try {
      // Extract metadata from first object (all objects have same metadata)
      const firstObject = objects[0];
      const project_name = firstObject.project_name || this.config.projectName;
      const sdk_version = firstObject.sdk_version;
      const commit_sha = firstObject.commit_sha;

      // Clean objects to remove metadata fields
      const cleanObjects = objects.map((obj) => {
        const { project_name, sdk_version, commit_sha, ...cleanObj } = obj;
        return cleanObj;
      });

      const response = await fetch(this.objectsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...this.config.headers
        },
        body: JSON.stringify({
          objects: cleanObjects,
          project_name,
          sdk_version,
          commit_sha
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send objects: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return { success: true, itemsExported: objects.length };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        itemsExported: 0
      };
    }
  }
}