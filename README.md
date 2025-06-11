# Treebeard JavaScript/TypeScript SDK

A comprehensive logging and tracing SDK for JavaScript and TypeScript applications, with built-in support for Next.js and other modern frameworks.

## Features

- 🚀 **Zero-configuration setup** - Works out of the box with sensible defaults
- 🔍 **Automatic tracing** - Uses AsyncLocalStorage for request-scoped trace context
- 🐛 **Global exception handling** - Captures unhandled errors and promise rejections
- 📝 **Console capture** - Optional monkey-patching of console methods
- ⚡ **Next.js integration** - Purpose-built middleware for Next.js applications
- 📦 **TypeScript support** - Full type safety with declaration files
- 🎯 **Lightweight** - Minimal dependencies and optimized for performance

## Installation

### For Next.js Applications

```bash
npm install @treebeard/core @treebeard/nextjs
```

### For Other Applications

```bash
npm install @treebeard/core
```

## Quick Start

### Basic Setup

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

### Next.js Integration

**1. Create middleware (middleware.ts):**

```typescript
import { createTreebeardMiddleware } from '@treebeard/nextjs';
import { init } from '@treebeard/core';

// Initialize Treebeard
init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'my-nextjs-app'
});

// Export the middleware
export default createTreebeardMiddleware({
  ignorePaths: ['/api/health', '/_next', '/favicon.ico'],
  captureHeaders: true,
  captureBody: false
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
```

**2. Use in API routes:**

```typescript
import { withTreebeard, log } from '@treebeard/nextjs';

async function handler(req: NextRequest) {
  log.info('Processing API request', { path: req.nextUrl.pathname });
  
  // Your API logic here
  
  return Response.json({ success: true });
}

export const GET = withTreebeard(handler, 'api-endpoint');
```

## Configuration

### Core SDK Options

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

### Next.js Middleware Options

```typescript
interface NextJSMiddlewareConfig {
  ignorePaths?: string[];     // Paths to skip tracing
  captureHeaders?: boolean;   // Include request/response headers
  captureBody?: boolean;      // Include request body (POST/PUT/PATCH)
  sanitizeHeaders?: string[]; // Headers to redact
}
```

## API Reference

### Core SDK

#### Initialization

```typescript
import { init } from '@treebeard/core';

const sdk = init({
  apiKey: 'your-api-key',
  projectName: 'my-app'
});
```

#### Logging

```typescript
import { log } from '@treebeard/core';

log.trace('Detailed debug info');
log.debug('Debug information');
log.info('General information');
log.warn('Warning message');
log.error('Error message', { error: new Error('Something failed') });
log.fatal('Critical error');
```

#### Manual Tracing

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

#### Context Access

```typescript
import { TreebeardContext } from '@treebeard/core';

// Get current trace ID
const traceId = TreebeardContext.getTraceId();

// Get current span ID
const spanId = TreebeardContext.getSpanId();

// Set custom context data
TreebeardContext.set('userId', '123');
const userId = TreebeardContext.get('userId');
```

### Next.js Integration

#### Middleware

```typescript
import { createTreebeardMiddleware } from '@treebeard/nextjs';

export default createTreebeardMiddleware({
  ignorePaths: ['/health'],
  captureHeaders: true,
  sanitizeHeaders: ['authorization', 'cookie']
});
```

#### Function Wrapper

```typescript
import { withTreebeard } from '@treebeard/nextjs';

const myFunction = withTreebeard(async (data) => {
  // Function logic
  return result;
}, 'custom-function-name');
```

## Environment Variables

You can configure the SDK using environment variables:

```bash
TREEBEARD_API_KEY=your-api-key
TREEBEARD_ENDPOINT=https://api.treebeardhq.com/logs/batch
```

## Examples

### Express.js Application

```typescript
import express from 'express';
import { init, log, TreebeardContext } from '@treebeard/core';

const app = express();

// Initialize Treebeard
init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'express-app',
  captureConsole: true
});

// Custom middleware for tracing
app.use((req, res, next) => {
  const traceId = TreebeardContext.generateTraceId();
  const context = {
    traceId,
    requestId: req.headers['x-request-id'] || `req_${Date.now()}`
  };

  TreebeardContext.run(context, () => {
    log.info(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    next();
  });
});

app.get('/api/users', (req, res) => {
  log.info('Fetching users');
  res.json({ users: [] });
});

app.listen(3000, () => {
  log.info('Server started', { port: 3000 });
});
```

### Error Handling

```typescript
import { log } from '@treebeard/core';

async function processData(data: any) {
  try {
    log.info('Starting data processing', { dataSize: data.length });
    
    // Process data
    const result = await someAsyncOperation(data);
    
    log.info('Data processing completed', { resultSize: result.length });
    return result;
  } catch (error) {
    log.error('Data processing failed', {
      error: error instanceof Error ? error : new Error(String(error)),
      dataSize: data?.length
    });
    throw error;
  }
}
```

### Custom Context

```typescript
import { TreebeardContext, log } from '@treebeard/core';

async function handleUserAction(userId: string, action: string) {
  const context = {
    traceId: TreebeardContext.generateTraceId(),
    userId,
    action
  };

  return await TreebeardContext.runAsync(context, async () => {
    log.info(`User action started: ${action}`, { userId });
    
    // Your business logic here
    await performAction(action);
    
    log.info(`User action completed: ${action}`, { userId });
  });
}
```

## Best Practices

1. **Initialize early** - Call `init()` as early as possible in your application lifecycle
2. **Use structured logging** - Include relevant metadata in your log calls
3. **Leverage automatic tracing** - Let the SDK handle trace context automatically
4. **Sanitize sensitive data** - Configure header sanitization for security
5. **Monitor performance** - Adjust batch settings based on your application's load

## TypeScript Support

The SDK is written in TypeScript and provides full type safety:

```typescript
import type { TreebeardConfig, LogEntry, TraceContext } from '@treebeard/core';

const config: TreebeardConfig = {
  apiKey: 'your-key',
  projectName: 'typed-app'
};

// All methods are fully typed
log.info('Typed message', { count: 42, enabled: true });
```

## Performance Considerations

- **Batching**: Logs are automatically batched to reduce network overhead
- **Async**: All network operations are asynchronous and non-blocking
- **Context**: AsyncLocalStorage provides efficient context propagation
- **Memory**: Automatic cleanup prevents memory leaks

## Troubleshooting

### Common Issues

1. **No logs appearing**: Check your API key and network connectivity
2. **Missing trace context**: Ensure you're using the middleware or manual tracing
3. **TypeScript errors**: Make sure you have the latest type definitions

### Debug Mode

```typescript
init({
  apiKey: 'your-key',
  // Logs will be output to console if no API key is provided
});
```

## License

MIT

## Support

For issues and questions, please visit our [GitHub repository](https://github.com/treebeardhq/js-sdk).