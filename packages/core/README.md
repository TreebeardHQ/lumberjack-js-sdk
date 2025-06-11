# @treebeard/core

Core JavaScript/TypeScript SDK for Treebeard logging and tracing.

## Installation

```bash
npm install @treebeard/core
```

## Quick Start

```typescript
import { init, log } from '@treebeard/core';

// Initialize the SDK
init({
  apiKey: 'your-api-key',
  projectName: 'my-app',
  captureConsole: true,
  captureUnhandled: true
});

// Start logging
log.info('Application started', { version: '1.0.0' });
log.error('Something went wrong', { error: new Error('Example error') });
```

## Features

- ✅ **Global exception handling** - Captures uncaught exceptions and unhandled promise rejections
- ✅ **Console log capture** - Optional monkey-patching of console methods
- ✅ **AsyncLocalStorage context** - Automatic trace/span ID management across async boundaries
- ✅ **TypeScript support** - Full type safety with declaration files
- ✅ **Automatic batching** - Efficient log batching with configurable size and age limits
- ✅ **Zero dependencies** - Minimal footprint with no external dependencies

## API Reference

### Initialization

```typescript
import { init } from '@treebeard/core';

const sdk = init({
  apiKey: 'your-api-key',
  projectName: 'my-app',
  captureConsole: true,
  captureUnhandled: true
});
```

### Logging

```typescript
import { log } from '@treebeard/core';

log.trace('Detailed debug info');
log.debug('Debug information');
log.info('General information');
log.warn('Warning message');
log.error('Error message', { error: new Error('Something failed') });
log.fatal('Critical error');
```

### Manual Tracing

```typescript
import { trace } from '@treebeard/core';

// Start a trace
const traceId = trace.start('user-registration', { userId: '123' });

try {
  // Your business logic
  await registerUser();
  
  // Mark success
  trace.end(true, { success: true });
} catch (error) {
  // Mark failure
  trace.end(false, { error: error.message });
}
```

### Context Management

```typescript
import { TreebeardContext } from '@treebeard/core';

// Get current trace ID
const traceId = TreebeardContext.getTraceId();

// Get current span ID
const spanId = TreebeardContext.getSpanId();

// Set custom context data
TreebeardContext.set('userId', '123');
const userId = TreebeardContext.get('userId');

// Run code with custom context
TreebeardContext.run({ traceId: 'custom-trace' }, () => {
  log.info('This log will have the custom trace ID');
});
```

## Configuration

```typescript
interface TreebeardConfig {
  apiKey?: string;           // Your Treebeard API key
  endpoint?: string;         // Custom API endpoint
  projectName?: string;      // Project identifier
  batchSize?: number;        // Log batch size (default: 100)
  batchAge?: number;         // Max batch age in ms (default: 5000)
  flushInterval?: number;    // Auto-flush interval in ms (default: 30000)
  captureConsole?: boolean;  // Capture console.* calls (default: false)
  captureUnhandled?: boolean; // Capture unhandled errors (default: true)
}
```

## Environment Variables

```bash
TREEBEARD_API_KEY=your-api-key
TREEBEARD_ENDPOINT=https://api.treebeardhq.com/logs/batch
```

For complete documentation and examples, see the [main repository README](https://github.com/treebeardhq/js-sdk).