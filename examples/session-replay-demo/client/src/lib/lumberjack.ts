import * as Lumberjack from '@lumberjack-sdk/browser';
import type { FrontendEvent, Exporter } from '@lumberjack-sdk/browser';

// Custom exporter that sends to our demo server
class DemoExporter implements Exporter {
  async export(events: FrontendEvent[], sessionId: string): Promise<void> {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        events,
      }),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
  }
}

// Initialize Lumberjack with our custom exporter
const lumberjack = Lumberjack.init({
  apiKey: 'demo-key', // Not used with custom exporter
  projectName: 'session-replay-demo',
  exporter: new DemoExporter(),
  enableSessionReplay: true,
  errorSampleRate: 1.0,
  replaySampleRate: 1.0, // Record all sessions for demo
  bufferSize: 50,
  flushInterval: 5000, // Flush every 5 seconds
});

// Set demo user
const userId = `user-${Math.random().toString(36).substr(2, 9)}`;
lumberjack.setUser({
  id: userId,
  email: 'demo@example.com',
  name: 'Demo User',
});

// Create session on server
fetch('/api/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    session_id: (lumberjack as any).sessionManager.getCurrentSession()?.id,
    user_id: userId,
    has_replay: true,
  }),
});

export default lumberjack;