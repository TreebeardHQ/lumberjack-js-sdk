import type { Session } from "./types";

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