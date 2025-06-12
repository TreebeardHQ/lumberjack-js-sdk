# @treebeardhq/nextjs

Next.js integration for Treebeard logging and tracing with Edge Runtime support.

## Installation

```bash
npm install @treebeardhq/core @treebeardhq/nextjs
```

## Quick Start

### 1. Setup Configuration

Create or update your `next.config.js` (or `next.config.ts`) file to wrap it with Treebeard:

```javascript
// next.config.js
import { withTreebeardConfig } from '@treebeardhq/nextjs';

const nextConfig = {
  // Your existing Next.js config
};

export default withTreebeardConfig(nextConfig, {
  // Treebeard config options (all optional)
  uploadSourceMaps: true, // Enable sourcemap uploading (default: true)
  debug: process.env.NODE_ENV === 'development', // Enable debug logging
  // serviceToken will be read from TREEBEARD_SERVICE_TOKEN env var
});
```

**TypeScript version (`next.config.ts`):**
```typescript
import { withTreebeardConfig } from '@treebeardhq/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Your existing Next.js config
};

export default withTreebeardConfig(nextConfig, {
  uploadSourceMaps: true,
  debug: process.env.NODE_ENV === 'development',
});
```

### 2. Set Environment Variables

Add your service token to your environment variables:

```bash
TREEBEARD_SERVICE_TOKEN=your-service-token-here
```

Get your service token from: https://app.treebeardhq.com/service-token

### 3. Create Instrumentation File

Create `instrumentation.ts` in your Next.js project root:

```typescript
import { register } from '@treebeardhq/nextjs';

export function register() {
  register({
    apiKey: process.env.TREEBEARD_API_KEY,
    projectName: 'my-nextjs-app',
    debug: process.env.NODE_ENV === 'development',
    captureConsole: true
  });
}
```

### 4. Create Middleware

Create `middleware.ts` in your Next.js project root:

```typescript
import { createTreebeardMiddleware } from '@treebeardhq/nextjs';

// Export the middleware (SDK is already initialized in instrumentation.ts)
export default createTreebeardMiddleware({
  ignorePaths: ['/api/health', '/_next', '/favicon.ico'],
  captureHeaders: true,
  captureBody: false
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
```

### 5. Use in API Routes

```typescript
import { withTreebeard } from '@treebeardhq/nextjs';
import { log } from '@treebeardhq/core';

async function handler(req: NextRequest) {
  log.info('Processing API request', { 
    method: req.method,
    path: req.nextUrl.pathname 
  });
  
  // Your API logic here
  
  return Response.json({ success: true });
}

// Wrap your handler for automatic tracing
export const GET = withTreebeard(handler, 'api-users');
export const POST = withTreebeard(handler, 'api-users-create');
```

### 6. Use in Server Components

```typescript
import { log } from '@treebeardhq/core';

export default async function UserPage({ params }: { params: { id: string } }) {
  // Logs will automatically include trace context from middleware headers
  log.info('Loading user page', { userId: params.id });
  
  try {
    const user = await fetchUser(params.id);
    log.info('User loaded successfully', { userId: params.id });
    
    return <div>User: {user.name}</div>;
  } catch (error) {
    log.error('Failed to load user', { 
      userId: params.id, 
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    return <div>Error loading user</div>;
  }
}
```

## Architecture

The Next.js integration uses a **header-based approach** instead of AsyncLocalStorage for **Edge Runtime compatibility**:

1. **Instrumentation**: Initialize the SDK singleton in `instrumentation.ts`
2. **Middleware**: Sets trace headers (`x-treebeard-trace-id`, `x-treebeard-span-id`) and logs request start/end
3. **Console Capture**: Automatically associates logs with active traces via global context
4. **Graceful Shutdown**: SIGTERM handlers flush logs before exit (Node.js runtime only)

## API Reference

### Config Wrapper

```typescript
withTreebeardConfig(nextConfig?: NextConfig, options?: TreebeardConfigOptions): NextConfig
```

Wraps your Next.js configuration to add Treebeard functionality, including automatic sourcemap uploading.

#### Configuration Options

```typescript
interface TreebeardConfigOptions {
  serviceToken?: string;         // Service token for uploads (read from TREEBEARD_SERVICE_TOKEN if not provided)
  uploadSourceMaps?: boolean;    // Enable sourcemap uploading (default: true)
  uploadUrl?: string;            // Custom upload endpoint (default: 'https://api.treebeard.com/sourcemaps')
  project?: string;              // Project identifier (read from package.json if not provided)
  commit?: string;               // Git commit SHA (auto-detected if not provided)
  debug?: boolean;               // Enable debug logging (default: false)
  commitEnvVar?: string;         // Environment variable name for commit SHA (default: 'TREEBEARD_COMMIT_SHA')
}
```

#### Features

- **Automatic Sourcemap Upload**: Uploads sourcemaps to Treebeard during production builds
- **Git Integration**: Automatically detects the current commit SHA and injects it as an environment variable
- **Service Token Validation**: Warns if the service token is missing with helpful instructions
- **Debug Mode**: Detailed logging of the upload process when enabled

#### Example

```typescript
import { withTreebeardConfig } from '@treebeardhq/nextjs';

const nextConfig = {
  experimental: {
    appDir: true
  }
};

export default withTreebeardConfig(nextConfig, {
  uploadSourceMaps: true,
  debug: process.env.NODE_ENV === 'development',
  project: 'my-app',
  commitEnvVar: 'GIT_COMMIT_SHA' // Custom env var name
});
```

### Instrumentation Registration

```typescript
register(options?: InstrumentationOptions)
```

Call this in your `instrumentation.ts` file to initialize the Treebeard SDK.

#### Configuration Options

```typescript
interface InstrumentationOptions {
  apiKey?: string;            // Your Treebeard API key
  endpoint?: string;          // Custom API endpoint
  projectName?: string;       // Project identifier
  debug?: boolean;            // Enable debug logging
  captureConsole?: boolean;   // Capture console.* calls
  captureUnhandled?: boolean; // Capture unhandled errors
  batchSize?: number;         // Log batch size (default: 100)
  batchAge?: number;          // Max batch age in ms (default: 5000)
  flushInterval?: number;     // Auto-flush interval in ms (default: 30000)
}
```

### Middleware

```typescript
createTreebeardMiddleware(config?: NextJSMiddlewareConfig)
```

Creates middleware that automatically traces all requests.

#### Configuration Options

```typescript
interface NextJSMiddlewareConfig {
  ignorePaths?: string[];     // Paths to skip tracing (default: ['/api/health', '/_next', '/favicon.ico'])
  captureHeaders?: boolean;   // Include request/response headers (default: true)
  captureBody?: boolean;      // Include request body for POST/PUT/PATCH (default: false)
  sanitizeHeaders?: string[]; // Headers to redact (default: ['authorization', 'cookie', 'x-api-key'])
}
```

### Function Wrapper

```typescript
withTreebeard<T>(handler: T, traceName?: string): T
```

Wraps any async function to provide automatic tracing:

```typescript
import { withTreebeard } from '@treebeardhq/nextjs';

const processOrder = withTreebeard(async (orderId: string) => {
  // Function logic here
  return result;
}, 'process-order');

// Usage
await processOrder('order-123');
```

## Features

- ✅ **Edge Runtime compatible** - Works in both Node.js and Edge Runtime
- ✅ **Automatic request tracing** - Every request gets a unique trace ID
- ✅ **Header-based context** - Trace context propagated via headers
- ✅ **Console capture** - All console.log calls automatically include trace context
- ✅ **Graceful shutdown** - SIGTERM handlers ensure logs are flushed
- ✅ **Error handling** - Automatic error capture and logging
- ✅ **Performance tracking** - Request duration and status code logging
- ✅ **Sourcemap uploading** - Automatic sourcemap upload during production builds
- ✅ **Git integration** - Automatic commit SHA detection and environment injection

## Examples

### Complete App Router Setup

**instrumentation.ts:**
```typescript
import { register } from '@treebeardhq/nextjs';

export function register() {
  register({
    apiKey: process.env.TREEBEARD_API_KEY,
    projectName: 'my-ecommerce-app',
    debug: process.env.NODE_ENV === 'development',
    captureConsole: true,
    captureUnhandled: true
  });
}
```

**middleware.ts:**
```typescript
import { createTreebeardMiddleware } from '@treebeardhq/nextjs';

export default createTreebeardMiddleware({
  ignorePaths: ['/api/health', '/_next', '/favicon.ico', '/robots.txt'],
  captureHeaders: true,
  captureBody: true,
  sanitizeHeaders: ['authorization', 'cookie', 'x-api-key', 'x-session-id']
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
```

**API Route (app/api/orders/route.ts):**
```typescript
import { withTreebeard } from '@treebeardhq/nextjs';
import { log } from '@treebeardhq/core';

async function createOrder(req: NextRequest) {
  const body = await req.json();
  log.info('Creating new order', { customerId: body.customerId });
  
  try {
    // Validate order
    log.info('Validating order data');
    await validateOrder(body);
    
    // Process payment
    log.info('Processing payment', { amount: body.total });
    const payment = await processPayment(body.payment);
    
    // Create order
    log.info('Creating order in database');
    const order = await db.orders.create({
      data: {
        customerId: body.customerId,
        items: body.items,
        total: body.total,
        paymentId: payment.id
      }
    });
    
    log.info('Order created successfully', { orderId: order.id });
    
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    log.error('Failed to create order', { 
      error: error instanceof Error ? error : new Error(String(error)),
      customerId: body.customerId 
    });
    
    return Response.json(
      { error: 'Failed to create order' }, 
      { status: 500 }
    );
  }
}

export const POST = withTreebeard(createOrder, 'create-order');
```

**Server Component (app/orders/[id]/page.tsx):**
```typescript
import { log } from '@treebeardhq/core';

interface OrderPageProps {
  params: { id: string };
}

export default async function OrderPage({ params }: OrderPageProps) {
  log.info('Loading order page', { orderId: params.id });
  
  try {
    const order = await fetchOrder(params.id);
    
    if (!order) {
      log.warn('Order not found', { orderId: params.id });
      return <div>Order not found</div>;
    }
    
    log.info('Order loaded successfully', { 
      orderId: params.id, 
      status: order.status 
    });
    
    return (
      <div>
        <h1>Order #{order.id}</h1>
        <p>Status: {order.status}</p>
        <p>Total: ${order.total}</p>
      </div>
    );
  } catch (error) {
    log.error('Failed to load order', { 
      orderId: params.id, 
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    return <div>Error loading order</div>;
  }
}
```

### Server Actions

```typescript
'use server';

import { withTreebeard } from '@treebeardhq/nextjs';
import { log } from '@treebeardhq/core';

async function updateOrderStatus(orderId: string, status: string) {
  log.info('Updating order status', { orderId, status });
  
  try {
    const order = await db.orders.update({
      where: { id: orderId },
      data: { status }
    });
    
    log.info('Order status updated successfully', { 
      orderId, 
      newStatus: status 
    });
    
    return { success: true, order };
  } catch (error) {
    log.error('Failed to update order status', { 
      orderId, 
      status,
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    throw new Error('Failed to update order status');
  }
}

export const updateOrderStatusAction = withTreebeard(updateOrderStatus, 'update-order-status');
```

## Environment Variables

Configure the SDK using environment variables:

```bash
# Required for logging
TREEBEARD_API_KEY=your-api-key
TREEBEARD_ENDPOINT=https://api.treebeardhq.com/logs/batch

# Required for sourcemap uploading
TREEBEARD_SERVICE_TOKEN=your-service-token

# Optional
NODE_ENV=development  # Enables debug mode when set to 'development'
TREEBEARD_COMMIT_SHA=abc123  # Automatically set by withTreebeardConfig
```

## Best Practices

1. **Use withTreebeardConfig** - Wrap your Next.js config to enable sourcemap uploading and git integration
2. **Use instrumentation.ts** - Always initialize the SDK in `instrumentation.ts` for proper singleton behavior
3. **Set service token** - Add `TREEBEARD_SERVICE_TOKEN` to your environment for sourcemap uploads
4. **Filter paths** - Use `ignorePaths` to avoid tracing static assets and health checks
5. **Sanitize headers** - Always sanitize sensitive headers in production
6. **Console capture** - Enable console capture to automatically trace all console.log calls
7. **Debug mode** - Enable debug logging in development to understand SDK behavior
8. **Wrap functions** - Use `withTreebeard` for important business logic
9. **Structured logging** - Include relevant context in your log messages
10. **Error handling** - Let the SDK automatically capture unhandled errors

## Troubleshooting

### Common Issues

1. **No logs appearing**: Check your API key and network connectivity
2. **Missing trace context**: Ensure middleware is properly configured
3. **Edge Runtime errors**: The new architecture is compatible with Edge Runtime

### Debug Mode

Enable debug logging to see SDK activity:

```typescript
register({
  debug: true,
  // ... other options
});
```

You'll see logs like:
```
[Treebeard] Initializing SDK for runtime: { isEdge: true, ... }
[Treebeard] Adding log entry to buffer: { message: "...", traceId: "..." }
[Treebeard] Successfully sent 5 logs
```

## Requirements

- Next.js 13.0.0 or higher
- Node.js 16.0.0 or higher

For complete documentation and examples, see the [main repository README](https://github.com/treebeardhq/js-sdk).