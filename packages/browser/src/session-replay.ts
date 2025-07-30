import { record } from "rrweb";
import type { eventWithTime } from "rrweb/typings/types";
import type { FrontendEvent, SessionReplayConfig } from "./types";

export class SessionReplay {
  private stopFn?: () => void;
  private events: eventWithTime[] = [];
  private lastFlush = Date.now();
  private config: Required<SessionReplayConfig>;

  constructor(
    private callback: (event: FrontendEvent) => void,
    private sessionId: () => string,
    private privacyMode: "strict" | "standard",
    config: SessionReplayConfig = {}
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
      maskClass: "lumberjack-mask",
      recordCanvas: false,
      inlineImages: false,
      inlineStylesheet: true,
      maskTextFn: undefined,
      maskInputFn: undefined,
      ...config,
      // Merge sampling config properly
      sampling: {
        ...defaultSampling,
        ...config.sampling,
      },
    };
  }

  start(blockSelectors: string[] = []): void {
    const recordConfig = {
      emit: (event) => {
        this.events.push(event);

        // Use configurable flush settings
        const timeSinceFlush = Date.now() - this.lastFlush;
        if (timeSinceFlush > this.config.flushInterval || this.events.length > this.config.maxEventsPerChunk) {
          this.flush();
        }
      },

      // Privacy settings
      maskAllInputs: this.config.maskAllInputs,
      maskTextContent: this.privacyMode === "strict",
      blockClass: this.config.blockClass,
      ignoreClass: this.config.ignoreClass,
      maskClass: this.config.maskClass,
      blockSelector: blockSelectors.join(","),

      // Performance
      sampling: this.config.sampling,

      // Recording options
      recordCanvas: this.config.recordCanvas,
      inlineImages: this.config.inlineImages,
      inlineStylesheet: this.config.inlineStylesheet,
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