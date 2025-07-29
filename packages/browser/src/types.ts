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