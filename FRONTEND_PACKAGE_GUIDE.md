# Lumberjack Browser Package Implementation Guide

## Overview

This guide provides instructions for implementing `@lumberjack-sdk/browser` - a browser-based monitoring package that captures JavaScript errors, custom events, and session replays for the Lumberjack observability platform.

## Core Features

1. **Error Tracking**: Capture unhandled JavaScript errors, promise rejections, and resource loading failures
2. **Custom Events**: Track user actions, business events, and performance metrics
3. **Session Replay**: Record user sessions using rrweb for debugging and analysis

## Package Structure

```
packages/browser/
├── src/
│   ├── index.ts           # Main SDK class and entry point
│   ├── types.ts           # TypeScript interfaces
│   ├── session.ts         # Session management
│   ├── buffer.ts          # Event buffering and batching
│   ├── error-tracker.ts   # Error collection logic
│   ├── session-replay.ts  # rrweb integration
│   └── exporter.ts        # API communication
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Details

### 1. Package Configuration

```json
{
  "name": "@lumberjack-sdk/browser",
  "version": "0.1.0",
  "description": "Browser error tracking, custom events, and session replay for Lumberjack",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --clean",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch",
    "clean": "rm -rf dist",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "rrweb": "^2.0.0-alpha.11"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "tsup": "^8.5.0",
    "typescript": "^5.0.0"
  }
}
```

### 2. Type Definitions

```typescript
// src/types.ts
export interface Exporter {
  export(events: FrontendEvent[], sessionId: string): Promise<void>;
}

export interface FrontendConfig {
  apiKey: string;
  projectName: string;
  endpoint?: string;

  // Custom exporter (optional)
  exporter?: Exporter;

  // Buffering
  bufferSize?: number;
  flushInterval?: number;

  // Session replay
  enableSessionReplay?: boolean;
  replayPrivacyMode?: "strict" | "standard";
  blockSelectors?: string[];

  // Sampling
  errorSampleRate?: number; // 0-1
  replaySampleRate?: number; // 0-1
}

export interface UserContext {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  [key: string]: any;
}

export interface FrontendEvent {
  type: "error" | "session_replay" | "custom";
  timestamp: number;
  sessionId: string;
  userId?: string;
  userContext?: UserContext;
  data: ErrorData | ReplayData | CustomEventData;
}

export interface ErrorData {
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  type: "error" | "unhandledRejection" | "resourceError";
}

export interface ReplayData {
  events: any[]; // rrweb events
  startTime: number;
  endTime: number;
}

export interface CustomEventData {
  name: string;
  properties?: Record<string, any>;
}

export interface Session {
  id: string;
  startTime: number;
  lastActivity: number;
  hasReplay: boolean;
}
```

### 3. Session Management

```typescript
// src/session.ts
export class SessionManager {
  private session: Session | null = null;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(private enableReplay: boolean, private replaySampleRate: number) {
    // Try to recover existing session on initialization
    this.recoverSession();
  }

  getOrCreateSession(): Session {
    const now = Date.now();

    // Check if existing session is still valid
    if (
      this.session &&
      now - this.session.lastActivity < this.SESSION_TIMEOUT
    ) {
      this.session.lastActivity = now;
      this.saveSession();
      return this.session;
    }

    // Create new session
    const shouldReplay =
      this.enableReplay && Math.random() < this.replaySampleRate;

    this.session = {
      id: this.generateSessionId(),
      startTime: now,
      lastActivity: now,
      hasReplay: shouldReplay,
    };

    this.saveSession();
    return this.session;
  }

  private recoverSession(): void {
    try {
      if (typeof sessionStorage === "undefined") return;

      const stored = sessionStorage.getItem("lumberjack_session");
      if (!stored) return;

      const session = JSON.parse(stored) as Session;
      const now = Date.now();

      // Only recover if session is still valid
      if (session && now - session.lastActivity < this.SESSION_TIMEOUT) {
        this.session = session;
      } else {
        // Clean up expired session
        sessionStorage.removeItem("lumberjack_session");
      }
    } catch (error) {
      // Ignore storage errors, create new session
      console.warn("Failed to recover session:", error);
    }
  }

  private saveSession(): void {
    try {
      if (typeof sessionStorage !== "undefined" && this.session) {
        sessionStorage.setItem(
          "lumberjack_session",
          JSON.stringify(this.session)
        );
      }
    } catch (error) {
      // Ignore storage errors
      console.warn("Failed to save session:", error);
    }
  }

  getCurrentSession(): Session | null {
    return this.session;
  }

  private generateSessionId(): string {
    // Simple UUID v4 generation for browsers
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    array[6] = (array[6] & 0x0f) | 0x40;
    array[8] = (array[8] & 0x3f) | 0x80;

    const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join(
      ""
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16
    )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}
```

### 4. Event Buffer

```typescript
// src/buffer.ts
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
```

### 5. Error Tracker

```typescript
// src/error-tracker.ts
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
        const target = event.target as HTMLElement;
        if (target !== window && target.tagName) {
          if (Math.random() > this.sampleRate) return;

          this.trackError({
            message: `Failed to load ${target.tagName} resource`,
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
```

### 6. Session Replay

```typescript
// src/session-replay.ts
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
```

### 7. API Exporter

```typescript
// src/exporter.ts
import type { FrontendEvent, Exporter } from "./types";

export class HttpExporter implements Exporter {
  private endpoint: string;

  constructor(
    private apiKey: string,
    private projectName: string,
    endpoint?: string
  ) {
    this.endpoint = endpoint || "https://api.trylumberjack.com/rum/events";
  }

  async export(events: FrontendEvent[], sessionId: string): Promise<void> {
    const payload = {
      project_name: this.projectName,
      session_id: sessionId,
      events: events.map((event) => ({
        type: event.type,
        timestamp: event.timestamp,
        data:
          event.type === "session_replay"
            ? this.compressReplayData(event.data)
            : event.data,
      })),
    };

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
  }

  private compressReplayData(data: any): any {
    // For now, just stringify large replay events
    // In production, use CompressionStream API if available
    if (data.events && data.events.length > 50) {
      return {
        ...data,
        events: JSON.stringify(data.events),
        compressed: true,
      };
    }
    return data;
  }
}

// Simple console exporter for development/debugging
export class ConsoleExporter implements Exporter {
  async export(events: FrontendEvent[], sessionId: string): Promise<void> {
    console.group(`🪵 Lumberjack Export - Session: ${sessionId}`);
    events.forEach((event) => {
      const emoji =
        event.type === "error" ? "❌" : event.type === "custom" ? "📊" : "🎥";
      console.log(`${emoji} ${event.type}:`, {
        timestamp: new Date(event.timestamp).toISOString(),
        user: event.userId,
        data: event.data,
      });
    });
    console.groupEnd();
  }
}
```

### 8. Main SDK Implementation

```typescript
// src/index.ts
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
import { HttpExporter, ConsoleExporter } from "./exporter";

class LumberjackSDK {
  private config: Required<FrontendConfig>;
  private sessionManager: SessionManager;
  private buffer: EventBuffer;
  private errorTracker: ErrorTracker;
  private sessionReplay?: SessionReplay;
  private exporter: FrontendExporter;
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
      type: "error",
      timestamp: Date.now(),
      sessionId: session.id,
      data: {
        message: "Session started",
        type: "error",
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
        stack: error.stack,
        type: "error",
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
```

## Usage Examples

### Basic Usage

```javascript
import * as Lumberjack from "@lumberjack-sdk/browser";

// Initialize the SDK
const lumberjack = Lumberjack.init({
  apiKey: "your-api-key",
  projectName: "your-project",
  enableSessionReplay: true,
  errorSampleRate: 1.0, // Capture all errors
  replaySampleRate: 0.1, // Record 10% of sessions
  replayPrivacyMode: "standard",
  blockSelectors: [".sensitive-data", "#credit-card"],
});

// REQUIRED: Set user context
lumberjack.setUser({
  id: "user-123",
  email: "user@example.com",
  name: "John Doe",
  plan: "premium",
});

// Track custom events
lumberjack.track("begin_onboarding", {
  company_id: 2,
  company_name: "Acme Corp",
});

lumberjack.track("feature_used", {
  feature: "export_report",
  format: "pdf",
});

// Errors are automatically captured
// Manually capture additional errors with context
try {
  somethingRisky();
} catch (error) {
  lumberjack.captureError(error, {
    action: "checkout",
    step: "payment",
  });
}
```

### Development/Debugging with Console Exporter

```javascript
import * as Lumberjack from "@lumberjack-sdk/browser";

// Use console exporter for local development
const lumberjack = Lumberjack.init({
  apiKey: "dev-key",
  projectName: "my-app-dev",
  exporter: new Lumberjack.ConsoleExporter(),
  enableSessionReplay: false, // Disable for dev
});

lumberjack.setUser({
  id: "dev-user",
  email: "dev@example.com",
});

// All events will be logged to console
lumberjack.track("button_clicked", { buttonId: "submit" });
```

## Privacy Considerations

1. **CSS Classes for Privacy**:

   - `.lumberjack-block` - Completely hide element from replay
   - `.lumberjack-ignore` - Don't record interactions
   - `.lumberjack-mask` - Mask text content

2. **Automatic Masking**:

   - All input fields are masked by default
   - Password fields are never recorded
   - Credit card patterns are detected and masked

3. **Privacy Modes**:
   - `standard`: Masks inputs and sensitive fields
   - `strict`: Also masks all text content

## Testing Strategy

```typescript
// Example test
describe("LumberjackFrontend", () => {
  test("captures errors", () => {
    const config = {
      apiKey: "test-key",
      projectName: "test",
      enableSessionReplay: false,
    };

    const sdk = new LumberjackFrontend(config);
    const error = new Error("Test error");

    sdk.captureError(error);

    // Verify error was buffered
    expect(sdk.buffer.length).toBe(1);
  });
});
```

## Next Steps

1. Create the package directory structure
2. Implement core components (session, buffer, error tracking)
3. Integrate rrweb for session replay
4. Add comprehensive tests
5. Create build pipeline for ESM, CJS, and CDN
6. Document API and privacy features
7. Publish to npm registry
