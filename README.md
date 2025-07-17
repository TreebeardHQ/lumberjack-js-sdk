# Lumberjack JavaScript/TypeScript SDK

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
npm install @lumberjack-sdk/core@alpha @lumberjack-sdk/nextjs@alpha
```

### For Other Applications

```bash
npm install @lumberjack-sdk/core
```

## Quick Start

### Basic Setup

```typescript
import { init, log } from "@lumberjack-sdk/core";

// Initialize the SDK
init({
  apiKey: "your-api-key",
  projectName: "my-app",
  captureConsole: true,
  captureUnhandled: true,
});

// Start logging
log.info("Application started", { version: "1.0.0" });
log.error("Something went wrong", { error: new Error("Example error") });
```

## API Reference

### Core SDK

#### Initialization

```typescript
import { init } from "@lumberjack-sdk/core";

const sdk = init({
  apiKey: "your-api-key",
  projectName: "my-app",
});
```

#### Logging

```typescript
import { log } from "@lumberjack-sdk/core";

log.trace("Detailed debug info");
log.debug("Debug information");
log.info("General information");
log.warn("Warning message");
log.error("Error message", { error: new Error("Something failed") });
log.fatal("Critical error");
```

#### Manual Tracing

```typescript
import { trace } from "@lumberjack-sdk/core";

// Start a trace
const traceId = trace.start("user-registration", { userId: "123" });

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
import { LumberjackContext } from "@lumberjack-sdk/core";

// Get current trace ID
const traceId = LumberjackContext.getTraceId();

// Get current span ID
const spanId = LumberjackContext.getSpanId();

// Set custom context data
LumberjackContext.set("userId", "123");
const userId = LumberjackContext.get("userId");
```
