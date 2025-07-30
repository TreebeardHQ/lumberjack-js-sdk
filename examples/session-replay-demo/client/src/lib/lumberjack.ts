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

// Initialize Lumberjack with our custom exporter and full session replay config
const lumberjack = Lumberjack.init({
  apiKey: 'demo-key', // Not used with custom exporter
  projectName: 'session-replay-demo',
  exporter: new DemoExporter(),
  
  // Session replay configuration
  enableSessionReplay: true,
  replayPrivacyMode: 'standard', // 'strict' | 'standard'
  blockSelectors: [
    '.sensitive-data',
    '#credit-card-form',
    '[data-private]'
  ],
  
  // Advanced session replay configuration
  sessionReplayConfig: {
    // Flush settings
    flushInterval: 3000, // Flush every 3 seconds (faster for demo)
    maxEventsPerChunk: 80, // Smaller chunks for demo
    
    // Privacy settings
    maskAllInputs: true,
    blockClass: 'lumberjack-block',
    ignoreClass: 'lumberjack-ignore', 
    maskClass: 'lumberjack-mask',
    
    // Performance sampling
    sampling: {
      mousemove: false, // Don't record every mouse move
      mouseInteraction: true, // Record clicks
      scroll: 100, // Record scroll every 100ms
      input: 'last', // Only record final input value
    },
    
    // Recording options
    recordCanvas: false, // Don't record canvas for performance
    inlineImages: false, // Don't inline images
    inlineStylesheet: true, // Inline stylesheets for better replay
  },
  
  // Sampling rates
  errorSampleRate: 1.0, // Capture all errors for demo
  replaySampleRate: 1.0, // Record all sessions for demo
  
  // Buffering configuration
  bufferSize: 50, // Number of events before auto-flush
  flushInterval: 5000, // Flush every 5 seconds
  
  // Optional: Custom endpoint (not used with custom exporter)
  endpoint: 'https://api.trylumberjack.com/rum/events',
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