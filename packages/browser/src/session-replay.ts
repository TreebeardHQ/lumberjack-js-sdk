import { record } from "rrweb";
import type { eventWithTime } from "rrweb/typings/types";
import type { FrontendEvent } from "./types";

export class SessionReplay {
  private stopFn?: () => void;
  private events: eventWithTime[] = [];
  private lastFlush = Date.now();

  constructor(
    private callback: (event: FrontendEvent) => void,
    private sessionId: () => string,
    private privacyMode: "strict" | "standard"
  ) {}

  start(blockSelectors: string[] = []): void {
    this.stopFn = record({
      emit: (event) => {
        this.events.push(event);

        // Flush every 5 seconds or 100 events
        if (Date.now() - this.lastFlush > 5000 || this.events.length > 100) {
          this.flush();
        }
      },

      // Privacy settings
      maskAllInputs: true,
      maskTextContent: this.privacyMode === "strict",
      blockClass: "lumberjack-block",
      ignoreClass: "lumberjack-ignore",
      maskClass: "lumberjack-mask",
      blockSelector: blockSelectors.join(","),

      // Performance
      sampling: {
        mousemove: false,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },

      // Don't record canvas or images
      recordCanvas: false,
      inlineImages: false,
    });
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