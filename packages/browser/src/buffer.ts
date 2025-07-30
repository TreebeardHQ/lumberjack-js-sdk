import type { FrontendEvent } from "./types";

export class EventBuffer {
  private buffer: FrontendEvent[] = [];
  private flushTimer?: number;

  constructor(
    private maxSize: number,
    private flushInterval: number,
    private onFlush: (events: FrontendEvent[]) => Promise<void>
  ) {
    this.startTimer();
  }

  add(event: FrontendEvent): void {
    this.buffer.push(event);

    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      await this.onFlush(events);
    } catch (error) {
      // Re-add events on failure (with limit)
      const reAddCount = Math.min(events.length, Math.floor(this.maxSize / 2));
      this.buffer.unshift(...events.slice(0, reAddCount));
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.flushTimer = window.setInterval(
      () => this.flush(),
      this.flushInterval
    );
  }

  private stopTimer(): void {
    if (this.flushTimer) {
      window.clearInterval(this.flushTimer);
    }
  }

  destroy(): void {
    this.stopTimer();
    this.flush();
  }
}