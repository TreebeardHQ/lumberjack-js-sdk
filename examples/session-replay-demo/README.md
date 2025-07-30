# Lumberjack Session Replay Demo

This demo application showcases the full capabilities of the `@lumberjack-sdk/browser` package, including:

- 🎥 **Session Replay**: Record and playback user sessions using rrweb
- 🐛 **Error Tracking**: Automatic capture of JavaScript errors, promise rejections, and resource failures
- 📊 **Custom Events**: Track user interactions and business events
- 🔒 **Privacy Controls**: Demonstration of CSS masking classes
- 📈 **Analytics Dashboard**: View sessions, events, and errors in real-time

## Architecture

The demo consists of:

1. **Express Server** (`/server`): 
   - SQLite in-memory database (data resets on restart)
   - REST API for storing and retrieving session data
   - TypeScript with ES modules

2. **React Client** (`/client`):
   - Vite + TypeScript + React
   - React Router for navigation
   - rrweb-player for replay visualization
   - Custom Lumberjack exporter for demo server

## Getting Started

### Prerequisites

- Node.js 16+
- npm 8+

### Installation

From the `session-replay-demo` directory:

```bash
# Install all dependencies
npm run install:all
```

### Running the Demo

```bash
# Start both server and client
npm run dev
```

This will start:
- Express server on http://localhost:3001
- React app on http://localhost:3000

## Using the Demo

### 1. Recording Sessions

When you open the app, recording starts automatically. You'll see a red "Recording Session" indicator in the top-right corner.

### 2. Interacting with Pages

Navigate through the demo pages:

- **Home**: Demo buttons for custom events and different error types
- **Shop**: E-commerce simulation with cart functionality
- **Profile**: User settings form with privacy-masked sections

### 3. Triggering Events

#### Custom Events
- Click "Track Custom Event" on the home page
- Add items to cart in the shop
- Update profile settings

#### Errors
- "Trigger Error": Synchronous JavaScript error
- "Trigger Async Error": Unhandled promise rejection
- "Trigger Resource Error": Failed resource loading
- Random checkout failures in the shop

### 4. Privacy Features

Look for these examples:
- `.lumberjack-mask`: Content is masked in replays (Home page)
- `.lumberjack-block`: Entire section hidden from replays (Profile page - API key section)
- Password fields are automatically masked

### 5. Viewing Analytics

Click "Dashboard" in the navigation to see:
- **Sessions**: All recorded sessions with metadata
- **Events**: Custom events tracked during sessions
- **Errors**: Captured JavaScript errors

### 6. Watching Replays

1. Navigate to the Dashboard
2. Find a session with replay data (green checkmark)
3. Click "View Replay"
4. Use the player controls to watch the recorded session
5. View the events timeline below the player

## Key Features Demonstrated

### Error Tracking
```javascript
// Automatic capture
window.addEventListener('error', handler);
window.addEventListener('unhandledrejection', handler);

// Manual capture
lumberjack.captureError(error, { context: 'checkout' });
```

### Custom Events
```javascript
lumberjack.track('add_to_cart', {
  product_id: 123,
  price: 99.99
});
```

### Privacy Controls
```html
<!-- Mask text content -->
<div className="lumberjack-mask">Sensitive text</div>

<!-- Hide entire element -->
<div className="lumberjack-block">Hidden from replay</div>
```

### Session Management
- Sessions persist across page navigation
- 30-minute timeout for inactive sessions
- Automatic session recovery on page reload

## Technical Details

### Custom Exporter

The demo uses a custom exporter to send data to the local server instead of the Lumberjack API:

```typescript
class DemoExporter implements Exporter {
  async export(events: FrontendEvent[], sessionId: string) {
    await fetch('/api/events', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, events })
    });
  }
}
```

### Database Schema

SQLite tables:
- `sessions`: Session metadata
- `events`: Custom events and errors
- `replay_chunks`: rrweb recording data

### Development Tips

- Data is stored in memory - refresh the server to reset
- The client proxies `/api` requests to the server
- All sessions are recorded (100% sample rate for demo)
- Event buffer flushes every 5 seconds

## Troubleshooting

**Sessions not appearing?**
- Wait for the 5-second flush interval
- Click "Stop Recording" to force flush
- Check browser console for errors

**Replay not working?**
- Ensure you navigated between pages during recording
- Check that session has replay data (green checkmark)
- Try refreshing the replay page

**Server errors?**
- Restart the server (data will be reset)
- Check that ports 3000 and 3001 are available