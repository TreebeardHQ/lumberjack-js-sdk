import { eventWithTime, record, recordOptions } from "rrweb";
import type { FrontendEvent } from "./types";

type Handler = ReturnType<typeof record>;

export class SessionReplay {
  private stopFn: Handler;
  private events: eventWithTime[] = [];
  private lastFlush = Date.now();
  private config: recordOptions<eventWithTime> & {
    flushInterval: number;
    maxEventsPerChunk: number;
  };

  constructor(
    private callback: (event: FrontendEvent) => void,
    private sessionId: () => string,
    _privacyMode: "strict" | "standard", // Unused for now, not stored as private property
    private onActivity: () => void, // New callback to update session activity
    config: recordOptions<eventWithTime> = {}
  ) {
    // Set defaults for all config options
    const defaultSampling = {
      mousemove: false,
      mouseInteraction: true,
      scroll: 150,
      input: "last" as const,
    };

    this.config = {
      flushInterval: 5000,
      maxEventsPerChunk: 100,
      maskAllInputs: true,
      blockClass: "lumberjack-block",
      ignoreClass: "lumberjack-ignore",
      maskTextSelector: "lumberjack-mask",
      recordCanvas: false,
      inlineImages: false,
      inlineStylesheet: true,

      ...config,
      // Merge sampling config properly
      sampling: {
        ...defaultSampling,
        ...config.sampling,
      },
    };
  }

  start(blockSelectors: string[] = []): void {
    const recordConfig: recordOptions<eventWithTime> = {
      ...this.config,
      emit: (event: eventWithTime) => {
        this.events.push(event);

        // Update session activity on user interactions
        this.onActivity();

        // Use configurable flush settings
        const timeSinceFlush = Date.now() - this.lastFlush;
        if (
          timeSinceFlush > this.config.flushInterval ||
          this.events.length > this.config.maxEventsPerChunk
        ) {
          this.flush();
        }
      },
      blockSelector: blockSelectors.join(","),
    };

    // Add optional functions if provided
    if (this.config.maskTextFn) {
      recordConfig.maskTextFn = this.config.maskTextFn;
    }
    if (this.config.maskInputFn) {
      recordConfig.maskInputFn = this.config.maskInputFn;
    }

    this.stopFn = record(recordConfig);
  }

  private flush(): void {
    if (this.events.length === 0) return;

    const event: FrontendEvent = {
      type: "session_replay",
      timestamp: Date.now(),
      sessionId: this.sessionId(),
      data: {
        events: [...this.events],
        startTime: this.events[0].timestamp,
        endTime: this.events[this.events.length - 1].timestamp,
      },
    };

    this.callback(event);
    this.events = [];
    this.lastFlush = Date.now();
  }

  stop(): void {
    this.flush();
    this.stopFn?.();
  }
}
