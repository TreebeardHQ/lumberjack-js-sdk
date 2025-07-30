import type {
  FrontendConfig,
  FrontendEvent,
  UserContext,
  Exporter,
  CustomEventData,
} from "./types";
import { SessionManager } from "./session";
import { EventBuffer } from "./buffer";
import { ErrorTracker } from "./error-tracker";
import { SessionReplay } from "./session-replay";
import { HttpExporter } from "./exporter";

class LumberjackSDK {
  private config: FrontendConfig & {
    endpoint: string;
    bufferSize: number;
    flushInterval: number;
    enableSessionReplay: boolean;
    replayPrivacyMode: "strict" | "standard";
    blockSelectors: string[];
    errorSampleRate: number;
    replaySampleRate: number;
  };
  private sessionManager: SessionManager;
  private buffer: EventBuffer;
  private errorTracker: ErrorTracker;
  private sessionReplay?: SessionReplay;
  private exporter: Exporter;
  private userContext: UserContext | null = null;

  constructor(config: FrontendConfig) {
    // Validate required configuration
    this.validateConfig(config);

    this.config = {
      endpoint: "https://api.trylumberjack.com/rum/events",
      bufferSize: 100,
      flushInterval: 10000,
      enableSessionReplay: true,
      replayPrivacyMode: "standard",
      blockSelectors: [],
      errorSampleRate: 1.0,
      replaySampleRate: 0.1,
      ...config,
    };

    // Initialize components
    this.sessionManager = new SessionManager(
      this.config.enableSessionReplay,
      this.config.replaySampleRate
    );

    // Use custom exporter if provided, otherwise default to HTTP
    this.exporter =
      this.config.exporter ||
      new HttpExporter(
        this.config.apiKey,
        this.config.projectName,
        this.config.endpoint
      );

    this.buffer = new EventBuffer(
      this.config.bufferSize,
      this.config.flushInterval,
      this.flushEvents.bind(this)
    );

    // Start session
    const session = this.sessionManager.getOrCreateSession();

    // Initialize error tracking
    this.errorTracker = new ErrorTracker(
      this.trackEvent.bind(this),
      () => this.sessionManager.getCurrentSession()?.id || "",
      this.config.errorSampleRate
    );
    this.errorTracker.start();

    // Initialize session replay if enabled for this session
    if (session.hasReplay) {
      this.sessionReplay = new SessionReplay(
        this.trackEvent.bind(this),
        () => session.id,
        this.config.replayPrivacyMode
      );
      this.sessionReplay.start(this.config.blockSelectors);
    }

    // Setup lifecycle handlers
    this.setupLifecycleHandlers();

    // Send session start event
    this.trackEvent({
      type: "custom",
      timestamp: Date.now(),
      sessionId: session.id,
      data: {
        name: "session_started",
        properties: {
          hasReplay: session.hasReplay,
        },
      },
    });
  }

  private validateConfig(config: FrontendConfig): void {
    if (!config.exporter) {
      // Only validate API key if using default HTTP exporter
      if (!config.apiKey || typeof config.apiKey !== "string") {
        throw new Error(
          "Lumberjack: apiKey is required when not using custom exporter"
        );
      }
    }
    if (!config.projectName || typeof config.projectName !== "string") {
      throw new Error(
        "Lumberjack: projectName is required and must be a string"
      );
    }
    if (
      config.errorSampleRate !== undefined &&
      (config.errorSampleRate < 0 || config.errorSampleRate > 1)
    ) {
      throw new Error("Lumberjack: errorSampleRate must be between 0 and 1");
    }
    if (
      config.replaySampleRate !== undefined &&
      (config.replaySampleRate < 0 || config.replaySampleRate > 1)
    ) {
      throw new Error("Lumberjack: replaySampleRate must be between 0 and 1");
    }
  }

  private trackEvent(event: FrontendEvent): void {
    // Add user context to all events
    if (this.userContext) {
      event.userId = this.userContext.id;
      event.userContext = this.userContext;
    }
    this.buffer.add(event);
  }

  private async flushEvents(events: FrontendEvent[]): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return;

    await this.exporter.export(events, session.id);
  }

  private setupLifecycleHandlers(): void {
    // Flush on page hide
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.buffer.flush();
      }
    });

    // Flush before unload
    window.addEventListener("beforeunload", () => {
      this.buffer.flush();
    });

    // Flush when back online
    window.addEventListener("online", () => {
      this.buffer.flush();
    });
  }

  // Public API for user context (REQUIRED)
  public setUser(user: UserContext): void {
    if (!user.id || typeof user.id !== "string") {
      throw new Error("Lumberjack: user.id is required and must be a string");
    }
    this.userContext = user;
  }

  public getUser(): UserContext | null {
    return this.userContext;
  }

  public clearUser(): void {
    this.userContext = null;
  }

  // Public API for custom events
  public track(eventName: string, properties?: Record<string, any>): void {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return;

    if (!this.userContext) {
      console.warn(
        "Lumberjack: User context not set. Call setUser() before tracking events."
      );
      return;
    }

    this.trackEvent({
      type: "custom",
      timestamp: Date.now(),
      sessionId: session.id,
      data: {
        name: eventName,
        properties,
      } as CustomEventData,
    });
  }

  // Public API for manual error tracking
  public captureError(error: Error, context?: Record<string, any>): void {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return;

    if (!this.userContext) {
      console.warn(
        "Lumberjack: User context not set. Call setUser() before capturing errors."
      );
      return;
    }

    this.trackEvent({
      type: "error",
      timestamp: Date.now(),
      sessionId: session.id,
      data: {
        message: error.message,
        stack: error.stack || '',
        type: "error" as const,
        ...context,
      },
    });
  }

  public async shutdown(): Promise<void> {
    this.sessionReplay?.stop();
    this.buffer.destroy();
  }
}

// Singleton instance
let instance: LumberjackSDK | null = null;

// Export namespace pattern
export function init(config: FrontendConfig): LumberjackSDK {
  if (!instance) {
    instance = new LumberjackSDK(config);
  }
  return instance;
}

export function getInstance(): LumberjackSDK | null {
  return instance;
}

// Re-export types and utilities
export type {
  FrontendConfig,
  UserContext,
  FrontendEvent,
  CustomEventData,
  Exporter,
} from "./types";
export { ConsoleExporter, HttpExporter } from "./exporter";

// Auto-initialize if config exists
if (typeof window !== "undefined" && (window as any).__LUMBERJACK_CONFIG__) {
  init((window as any).__LUMBERJACK_CONFIG__);
}