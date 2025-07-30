import type { FrontendEvent, ErrorData } from "./types";

export class ErrorTracker {
  private errorCount = 0;
  private recentErrors = new Map<string, number>();
  private readonly DEDUPE_WINDOW = 30000; // 30 seconds

  constructor(
    private callback: (event: FrontendEvent) => void,
    private sessionId: () => string,
    private sampleRate: number
  ) {}

  start(): void {
    // Global error handler
    window.addEventListener("error", (event) => {
      if (Math.random() > this.sampleRate) return;

      this.trackError({
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        type: "error",
      });
    });

    // Unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
      if (Math.random() > this.sampleRate) return;

      this.trackError({
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        type: "unhandledRejection",
      });
    });

    // Resource loading errors (separate listener for capture phase)
    this.setupResourceErrorHandling();
  }

  private setupResourceErrorHandling(): void {
    // Handle resource loading failures (images, scripts, stylesheets)
    window.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (target && target !== window && (target as HTMLElement).tagName) {
          if (Math.random() > this.sampleRate) return;

          this.trackError({
            message: `Failed to load ${(target as HTMLElement).tagName} resource`,
            filename: (target as any).src || (target as any).href,
            type: "resourceError",
          });
        }
      },
      true
    ); // Use capture phase
  }

  private trackError(data: ErrorData): void {
    // Simple client-side deduplication to prevent spam
    const fingerprint = this.getErrorFingerprint(data);
    const now = Date.now();
    const lastSeen = this.recentErrors.get(fingerprint);

    // Skip if we've seen this error recently
    if (lastSeen && now - lastSeen < this.DEDUPE_WINDOW) {
      return;
    }

    this.recentErrors.set(fingerprint, now);
    this.errorCount++;

    // Clean up old entries periodically
    if (this.recentErrors.size > 100) {
      this.cleanupOldErrors(now);
    }

    this.callback({
      type: "error",
      timestamp: now,
      sessionId: this.sessionId(),
      data,
    });
  }

  private getErrorFingerprint(data: ErrorData): string {
    // Simple fingerprint: message + first line of stack + type
    const stackLine = data.stack?.split("\n")[0] || "";
    return `${data.type}:${data.message}:${stackLine}`;
  }

  private cleanupOldErrors(now: number): void {
    for (const [fingerprint, timestamp] of this.recentErrors.entries()) {
      if (now - timestamp > this.DEDUPE_WINDOW * 2) {
        this.recentErrors.delete(fingerprint);
      }
    }
  }

  getErrorCount(): number {
    return this.errorCount;
  }
}