import type {
  EnrichedLogEntry,
  EnrichedRegisteredObject,
  EnrichedSpanRequest,
  Exporter,
  ExportResult,
} from "../exporter";

export class MockExporter implements Exporter {
  public exportedLogs: EnrichedLogEntry[] = [];
  public exportedObjects: EnrichedRegisteredObject[] = [];
  public exportedSpans: EnrichedSpanRequest[] = [];
  public shouldSucceed: boolean = true;
  public errorMessage: string = "Mock export error";

  async exportLogs(logs: EnrichedLogEntry[]): Promise<ExportResult> {
    if (!this.shouldSucceed) {
      return {
        success: false,
        error: new Error(this.errorMessage),
        itemsExported: 0,
      };
    }

    this.exportedLogs.push(...logs);
    return {
      success: true,
      itemsExported: logs.length,
    };
  }

  async exportObjects(
    objects: EnrichedRegisteredObject[]
  ): Promise<ExportResult> {
    if (!this.shouldSucceed) {
      return {
        success: false,
        error: new Error(this.errorMessage),
        itemsExported: 0,
      };
    }

    this.exportedObjects.push(...objects);
    return {
      success: true,
      itemsExported: objects.length,
    };
  }

  async exportSpans(spans: EnrichedSpanRequest): Promise<ExportResult> {
    if (!this.shouldSucceed) {
      return {
        success: false,
        error: new Error(this.errorMessage),
        itemsExported: 0,
      };
    }

    this.exportedSpans.push(spans);
    const spanCount =
      spans.resourceSpans?.reduce(
        (total, rs) =>
          total +
          (rs.scopeSpans?.reduce(
            (scopeTotal, ss) => scopeTotal + (ss.spans?.length || 0),
            0
          ) || 0),
        0
      ) || 0;
    return {
      success: true,
      itemsExported: spanCount,
    };
  }

  async shutdown(): Promise<void> {
    // Mock shutdown
  }

  reset(): void {
    this.exportedLogs = [];
    this.exportedObjects = [];
    this.exportedSpans = [];
    this.shouldSucceed = true;
    this.errorMessage = "Mock export error";
  }
}
