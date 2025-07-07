import type { Exporter, ExportResult, EnrichedLogEntry, EnrichedRegisteredObject } from '../exporter.js';

export class MockExporter implements Exporter {
  public exportedLogs: EnrichedLogEntry[] = [];
  public exportedObjects: EnrichedRegisteredObject[] = [];
  public shouldSucceed: boolean = true;
  public errorMessage: string = 'Mock export error';
  
  async exportLogs(logs: EnrichedLogEntry[]): Promise<ExportResult> {
    if (!this.shouldSucceed) {
      return {
        success: false,
        error: new Error(this.errorMessage),
        itemsExported: 0
      };
    }
    
    this.exportedLogs.push(...logs);
    return {
      success: true,
      itemsExported: logs.length
    };
  }
  
  async exportObjects(objects: EnrichedRegisteredObject[]): Promise<ExportResult> {
    if (!this.shouldSucceed) {
      return {
        success: false,
        error: new Error(this.errorMessage),
        itemsExported: 0
      };
    }
    
    this.exportedObjects.push(...objects);
    return {
      success: true,
      itemsExported: objects.length
    };
  }
  
  async shutdown(): Promise<void> {
    // Mock shutdown
  }
  
  reset(): void {
    this.exportedLogs = [];
    this.exportedObjects = [];
    this.shouldSucceed = true;
    this.errorMessage = 'Mock export error';
  }
}