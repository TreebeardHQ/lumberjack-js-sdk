# @treebeard/nextjs

Next.js integration for Treebeard logging and tracing.

## Installation

```bash
npm install @treebeard/core @treebeard/nextjs
```

## Quick Start

### 1. Create Middleware

Create `middleware.ts` in your Next.js project root:

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

### 2. Use in API Routes

```typescript
import { withTreebeard } from '@treebeard/nextjs';
import { log } from '@treebeard/core';

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

### 3. Use in Server Components

```typescript
import { log, TreebeardContext } from '@treebeard/core';

export default async function UserPage({ params }: { params: { id: string } }) {
  // Logs will automatically include trace context from middleware
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

## API Reference

### Middleware

```typescript
createTreebeardMiddleware(config?: NextJSMiddlewareConfig)
```

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
import { withTreebeard } from '@treebeard/nextjs';

const processOrder = withTreebeard(async (orderId: string) => {
  // Function logic here
  return result;
}, 'process-order');

// Usage
await processOrder('order-123');
```

## Features

- ✅ **Automatic request tracing** - Every request gets a unique trace ID
- ✅ **Header capture** - Configurable request/response header logging
- ✅ **Path filtering** - Skip tracing for health checks, static assets, etc.
- ✅ **Error handling** - Automatic error capture and logging
- ✅ **Performance tracking** - Request duration and status code logging
- ✅ **Context propagation** - Trace context flows through your entire request
- ✅ **Function wrapping** - Easy tracing for any async function

## Examples

### API Route with Error Handling

```typescript
import { withTreebeard } from '@treebeard/nextjs';
import { log } from '@treebeard/core';

async function createUser(req: NextRequest) {
  try {
    const body = await req.json();
    log.info('Creating new user', { email: body.email });
    
    const user = await db.user.create({
      data: { email: body.email, name: body.name }
    });
    
    log.info('User created successfully', { userId: user.id });
    
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    log.error('Failed to create user', { 
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    return Response.json(
      { error: 'Failed to create user' }, 
      { status: 500 }
    );
  }
}

export const POST = withTreebeard(createUser, 'create-user');
```

### Server Action

```typescript
'use server';

import { withTreebeard } from '@treebeard/nextjs';
import { log } from '@treebeard/core';

async function updateUserProfile(userId: string, data: ProfileData) {
  log.info('Updating user profile', { userId });
  
  // Update logic here
  
  log.info('Profile updated successfully', { userId });
}

export const updateProfile = withTreebeard(updateUserProfile, 'update-profile');
```

### Custom Middleware Configuration

```typescript
import { createTreebeardMiddleware } from '@treebeard/nextjs';

export default createTreebeardMiddleware({
  // Skip tracing for these paths
  ignorePaths: [
    '/api/health',
    '/api/metrics', 
    '/_next',
    '/favicon.ico',
    '/robots.txt'
  ],
  
  // Include headers but sanitize sensitive ones
  captureHeaders: true,
  sanitizeHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token'
  ],
  
  // Capture request body for write operations
  captureBody: true
});
```

## Best Practices

1. **Initialize early** - Call `init()` in your middleware file
2. **Filter paths** - Use `ignorePaths` to avoid tracing static assets
3. **Sanitize headers** - Always sanitize sensitive headers like authorization tokens
4. **Wrap functions** - Use `withTreebeard` for important business logic functions
5. **Structured logging** - Include relevant context in your log messages

## Requirements

- Next.js 13.0.0 or higher
- Node.js 16.0.0 or higher

For complete documentation and examples, see the [main repository README](https://github.com/treebeardhq/js-sdk).