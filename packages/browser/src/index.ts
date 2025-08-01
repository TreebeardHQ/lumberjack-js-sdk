import type {
  FrontendConfig,
  FrontendEvent,
  UserContext,
  Exporter,
  CustomEventData,
  Session,
} from "./types";
import { SessionManager } from "./session";
import { EventBuffer } from "./buffer";
import { ErrorTracker } from "./error-tracker";
import { SessionReplay } from "./session-replay";
import { HttpExporter } from "./exporter";
import { NetworkInterceptor } from "./network-interceptor";

class LumberjackSDK {
  private config: FrontendConfig & {
    endpoint: string;
    bufferSize: number;
    flushInterval: number;
    maxSessionLength: number;
    enableSessionReplay: boolean;
    replayPrivacyMode: "strict" | "standard";
    blockSelectors: string[];
    errorSampleRate: number;
    replaySampleRate: number;
  };
  private sessionManager?: SessionManager;
  private buffer?: EventBuffer;
  private errorTracker?: ErrorTracker;
  private sessionReplay?: SessionReplay;
  private networkInterceptor?: NetworkInterceptor;
  private exporter: Exporter;
  private userContext: UserContext | null = null;
  private isStarted = false;

  constructor(config: FrontendConfig) {
    // Validate required configuration
    this.validateConfig(config);

    this.config = {
      endpoint: "https://api.trylumberjack.com/rum/events",
      bufferSize: 100,
      flushInterval: 10000,
      maxSessionLength: 60 * 60 * 1000, // 1 hour
      enableSessionReplay: true,
      replayPrivacyMode: "standard",
      blockSelectors: [],
      errorSampleRate: 1.0,
      replaySampleRate: 0.1,
      ...config,
    };

    // Use custom exporter if provided, otherwise default to HTTP
    this.exporter =
      this.config.exporter ||
      new HttpExporter(
        this.config.apiKey,
        this.config.projectName,
        this.config.endpoint
      );

    // @ts-ignore
    window.__lumberjack__ = this;
  }

  // Start the session with user context
  public start(userContext: UserContext): void {
    if (this.isStarted) {
      console.warn("Lumberjack: Session already started");
      return;
    }

    // Validate user context
    if (!userContext.id || typeof userContext.id !== "string") {
      throw new Error("Lumberjack: user.id is required and must be a string");
    }

    this.userContext = userContext;
    this.isStarted = true;

    // Initialize components
    this.sessionManager = new SessionManager(
      this.config.enableSessionReplay,
      this.config.replaySampleRate,
      this.config.maxSessionLength
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
      () => this.sessionManager?.getCurrentSession()?.id || "",
      this.config.errorSampleRate
    );
    this.errorTracker.start();

    // Initialize network interceptor
    this.networkInterceptor = new NetworkInterceptor(
      () => this.sessionManager?.getCurrentSession()?.id || null
    );
    this.networkInterceptor.start();

    // Initialize session replay if enabled for this session
    if (session.hasReplay) {
      this.sessionReplay = new SessionReplay(
        this.trackEvent.bind(this),
        () => session.id,
        this.config.replayPrivacyMode,
        () => this.sessionManager?.updateActivity(), // Update session activity on rrweb events
        this.config.sessionReplayConfig || {}
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

    if (this.config.debug) {
      console.log("[Lumberjack] Starting SDK...");
    }
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
    if (
      config.maxSessionLength !== undefined &&
      (typeof config.maxSessionLength !== "number" ||
        config.maxSessionLength <= 0)
    ) {
      throw new Error(
        "Lumberjack: maxSessionLength must be a positive number (milliseconds)"
      );
    }
  }

  private trackEvent(event: FrontendEvent): void {
    if (!this.isStarted || !this.buffer) {
      console.warn("Lumberjack: Cannot track events before calling start()");
      return;
    }

    // Add user context to all events
    if (this.userContext) {
      event.userId = this.userContext.id;
      event.userContext = this.userContext;
    }
    this.buffer.add(event);
  }

  private async flushEvents(events: FrontendEvent[]): Promise<void> {
    if (!this.sessionManager) return;

    const session = this.sessionManager.getCurrentSession();
    if (!session || !this.userContext) {
      if (this.config.debug) {
        console.warn(
          "[Lumberjack] Attempted to flush logs with either no session or user context",
          session,
          this.userContext
        );
      }
      return;
    }

    if (this.config.debug) {
      console.log(
        "[Lumberjack] Flushing events",
        events.length,
        this.userContext
      );
    }

    await this.exporter.export(events, session.id, this.userContext);
  }

  private setupLifecycleHandlers(): void {
    // Flush on page hide
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.buffer?.flush();
      }
    });

    // Flush before unload
    window.addEventListener("beforeunload", () => {
      this.buffer?.flush();
    });

    // Flush when back online
    window.addEventListener("online", () => {
      this.buffer?.flush();
    });
  }

  // Public API for user context (now handled by start())
  public setUser(user: UserContext): void {
    if (!this.isStarted) {
      console.warn(
        "Lumberjack: Cannot set user before calling start(). Use start(userContext) instead."
      );
      return;
    }

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
    if (!this.isStarted) {
      console.warn("Lumberjack: Cannot track events before calling start()");
      return;
    }

    const session = this.sessionManager?.getCurrentSession();
    if (!session) return;

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
    if (!this.isStarted) {
      console.warn("Lumberjack: Cannot capture errors before calling start()");
      return;
    }

    const session = this.sessionManager?.getCurrentSession();
    if (!session) return;

    this.trackEvent({
      type: "error",
      timestamp: Date.now(),
      sessionId: session.id,
      data: {
        message: error.message,
        stack: error.stack || "",
        type: "error" as const,
        ...context,
      },
    });
  }

  // Public API for session management
  public getSession(): Session | null {
    if (!this.isStarted || !this.sessionManager) {
      return null;
    }
    return this.sessionManager.getCurrentSession();
  }

  public getSessionId(): string | null {
    const session = this.getSession();
    return session ? session.id : null;
  }

  public isRecording(): boolean {
    const session = this.getSession();
    return session ? session.hasReplay : false;
  }

  public getSessionDuration(): number {
    const session = this.getSession();
    if (!session) return 0;
    return Date.now() - session.startTime;
  }

  public getSessionRemainingTime(): number {
    const session = this.getSession();
    if (!session) return 0;
    const elapsed = this.getSessionDuration();
    return Math.max(0, this.config.maxSessionLength - elapsed);
  }

  public async shutdown(): Promise<void> {
    this.sessionReplay?.stop();
    this.networkInterceptor?.stop();
    this.buffer?.destroy();
    this.isStarted = false;
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

// Convenience method that gets the instance and starts it
export function start(userContext: UserContext): (() => Promise<void>) | null {
  const sdk = getInstance();
  if (!sdk) {
    console.warn("Lumberjack: SDK not initialized. Call init() first.");
    return null;
  }

  sdk.start(userContext);

  // Return shutdown callback
  return () => sdk.shutdown();
}

// Re-export types and utilities
export type {
  FrontendConfig,
  UserContext,
  FrontendEvent,
  CustomEventData,
  Exporter,
  Session,
} from "./types";

// Re-export rrweb types for convenience
export type { eventWithTime, recordOptions } from "rrweb";
export { ConsoleExporter, HttpExporter } from "./exporter";

// Auto-initialize if config exists (but don't auto-start)
if (typeof window !== "undefined" && (window as any).__LUMBERJACK_CONFIG__) {
  init((window as any).__LUMBERJACK_CONFIG__);
  // Note: User must still call start(userContext) manually
}
