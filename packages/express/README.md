# @treebeard/express

Express.js integration for Treebeard logging and tracing.

## Installation

```bash
npm install @treebeard/core @treebeard/express
```

## Quick Start

### Basic Usage

```typescript
import express from 'express';
import { init } from '@treebeard/core';
import { Treebeard } from '@treebeard/express';

const app = express();

// Initialize Treebeard
init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'my-express-app'
});

// Instrument your Express app
Treebeard.instrument(app, {
  captureHeaders: true,
  captureBody: true,
  ignorePaths: ['/health', '/metrics']
});

// Your routes
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Alternative: Manual Middleware

```typescript
import express from 'express';
import { init } from '@treebeard/core';
import { middleware } from '@treebeard/express';

const app = express();

init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'my-express-app'
});

// Add middleware manually
app.use(middleware({
  captureHeaders: true,
  captureBody: true
}));

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});
```

## API Reference

### Instrumentation

```typescript
Treebeard.instrument(app, config?)
```

Automatically instruments an Express application with Treebeard tracing.

#### Configuration Options

```typescript
interface ExpressInstrumentationConfig {
  ignorePaths?: string[];     // Paths to skip tracing (default: ['/health', '/metrics', '/favicon.ico'])
  captureHeaders?: boolean;   // Include request/response headers (default: true)
  captureBody?: boolean;      // Include request/response body (default: false)
  captureQuery?: boolean;     // Include query parameters (default: true)
  captureParams?: boolean;    // Include route parameters (default: true)
  sanitizeHeaders?: string[]; // Headers to redact (default: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'])
  maxBodySize?: number;       // Max body size to capture in bytes (default: 10000)
  errorHandler?: boolean;     // Add automatic error handler (default: true)
}
```

### Function Wrapper

```typescript
import { withTreebeard } from '@treebeard/express';

const processData = withTreebeard(async (data) => {
  // Your business logic
  return result;
}, 'process-data');
```

### Manual Middleware

```typescript
import { middleware } from '@treebeard/express';

app.use(middleware({
  captureHeaders: true,
  captureBody: false
}));
```

## Features

- ✅ **Automatic request tracing** - Every request gets a unique trace ID
- ✅ **Request/response capture** - Configurable logging of headers, body, query params
- ✅ **Error handling** - Automatic error capture and logging
- ✅ **Performance tracking** - Request duration and status code logging
- ✅ **Path filtering** - Skip tracing for health checks and static assets
- ✅ **Header sanitization** - Automatic redaction of sensitive headers
- ✅ **Context propagation** - Trace context flows through your entire request
- ✅ **Function wrapping** - Easy tracing for any async function

## Examples

### Basic API Server

```typescript
import express from 'express';
import { init, log } from '@treebeard/core';
import { Treebeard } from '@treebeard/express';

const app = express();
app.use(express.json());

// Initialize Treebeard
init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'api-server',
  captureConsole: true
});

// Instrument Express
Treebeard.instrument(app, {
  captureHeaders: true,
  captureBody: true,
  captureQuery: true,
  ignorePaths: ['/health', '/metrics', '/favicon.ico']
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/users', async (req, res) => {
  log.info('Fetching users', { page: req.query.page });
  
  try {
    const users = await fetchUsers(req.query);
    log.info('Users fetched successfully', { count: users.length });
    res.json({ users });
  } catch (error) {
    log.error('Failed to fetch users', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', async (req, res) => {
  log.info('Creating user', { email: req.body.email });
  
  try {
    const user = await createUser(req.body);
    log.info('User created successfully', { userId: user.id });
    res.status(201).json({ user });
  } catch (error) {
    log.error('Failed to create user', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(3000, () => {
  log.info('Server started', { port: 3000 });
});
```

### With Database Operations

```typescript
import express from 'express';
import { init, log } from '@treebeard/core';
import { Treebeard, withTreebeard } from '@treebeard/express';

const app = express();
app.use(express.json());

init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'user-service'
});

Treebeard.instrument(app);

// Wrapped database functions
const findUser = withTreebeard(async (id: string) => {
  log.info('Querying user from database', { userId: id });
  const user = await db.user.findUnique({ where: { id } });
  log.info('User query completed', { found: !!user });
  return user;
}, 'db-find-user');

const createUser = withTreebeard(async (userData: any) => {
  log.info('Creating user in database', { email: userData.email });
  const user = await db.user.create({ data: userData });
  log.info('User created in database', { userId: user.id });
  return user;
}, 'db-create-user');

// Routes
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Custom Error Handling

```typescript
import express from 'express';
import { init, log } from '@treebeard/core';
import { Treebeard } from '@treebeard/express';

const app = express();
app.use(express.json());

init({
  apiKey: process.env.TREEBEARD_API_KEY,
  projectName: 'my-app'
});

// Instrument without automatic error handler
Treebeard.instrument(app, {
  errorHandler: false
});

// Your routes
app.get('/api/data', (req, res) => {
  throw new Error('Something went wrong');
});

// Custom error handler
app.use((err, req, res, next) => {
  log.error('Unhandled error in request', {
    error: err,
    method: req.method,
    path: req.path,
    statusCode: 500
  });
  
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});
```

### Route-Specific Tracing

```typescript
import { withTreebeard } from '@treebeard/express';

// Wrap individual route handlers
app.get('/api/heavy-operation', withTreebeard(async (req, res) => {
  log.info('Starting heavy operation');
  
  const result = await performHeavyOperation();
  
  log.info('Heavy operation completed', { resultSize: result.length });
  res.json({ result });
}, 'heavy-operation'));

// Wrap middleware
const authenticateUser = withTreebeard(async (req, res, next) => {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const user = await verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}, 'authenticate-user');

app.use('/api/protected', authenticateUser);
```

## Configuration Examples

### Production Configuration

```typescript
Treebeard.instrument(app, {
  captureHeaders: true,
  captureBody: false,        // Disable body capture in production
  captureQuery: true,
  captureParams: true,
  ignorePaths: [
    '/health',
    '/metrics', 
    '/favicon.ico',
    '/robots.txt'
  ],
  sanitizeHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-session-id'
  ],
  maxBodySize: 5000,        // Smaller body size limit
  errorHandler: true
});
```

### Development Configuration

```typescript
Treebeard.instrument(app, {
  captureHeaders: true,
  captureBody: true,         // Enable body capture for debugging
  captureQuery: true,
  captureParams: true,
  ignorePaths: ['/health'],
  sanitizeHeaders: ['authorization'],
  maxBodySize: 50000,       // Larger body size limit
  errorHandler: true
});
```

## Best Practices

1. **Initialize early** - Call `init()` before instrumenting your app
2. **Filter paths** - Use `ignorePaths` to avoid tracing health checks and static assets
3. **Sanitize headers** - Always sanitize sensitive headers in production
4. **Body capture** - Be careful with body capture in production (performance/privacy)
5. **Wrap functions** - Use `withTreebeard` for important business logic
6. **Structured logging** - Include relevant context in your log messages

## Requirements

- Express.js 4.0.0 or higher
- Node.js 16.0.0 or higher

For complete documentation and examples, see the [main repository README](https://github.com/treebeardhq/js-sdk).