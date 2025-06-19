import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Application, Request } from 'express';
import { TreebeardCore } from '@treebeardhq/core';
import { ExpressInstrumentation } from './instrumentation.js';
import { InstrumentedRequest, InstrumentedResponse } from './types.js';

// Mock express app
const createMockApp = (): Application => {
  const middleware: any[] = [];
  const mockApp = {
    use: jest.fn((handler) => middleware.push(handler)),
    get middleware() { return middleware; }
  } as unknown as Application;
  return mockApp;
};

// Mock request/response objects
const createMockRequest = (overrides: Partial<Request> = {}): InstrumentedRequest => ({
  method: 'GET',
  path: '/test',
  url: '/test?query=value',
  headers: { 'user-agent': 'test-agent' },
  query: { query: 'value' },
  params: {},
  body: {},
  ip: '127.0.0.1',
  protocol: 'http',
  httpVersion: '1.1',
  connection: { remoteAddress: '127.0.0.1' },
  app: {} as Application,
  ...overrides
} as InstrumentedRequest);

const createMockResponse = (): InstrumentedResponse => {
  const headers: Record<string, any> = {};
  const mockRes = {
    statusCode: 200,
    statusMessage: 'OK',
    getHeaders: jest.fn(() => headers),
    setHeader: jest.fn((name: string, value: any) => { headers[name] = value; }),
    end: jest.fn(),
    json: jest.fn()
  } as unknown as InstrumentedResponse;
  return mockRes;
};

describe('ExpressInstrumentation', () => {
  let app: Application;
  let core: TreebeardCore;
  let fetchMock: any;

  beforeEach(() => {
    // Clear singleton and create fresh app
    (TreebeardCore as any).instance = null;
    app = createMockApp();
    
    // Mock fetch
    fetchMock = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK'
    });
    global.fetch = fetchMock;
    
    // Mock console to avoid test output clutter
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Initialize core
    core = TreebeardCore.init({ 
      batchSize: 1, 
      apiKey: 'test-key' 
    });
  });

  afterEach(async () => {
    if (core) {
      await core.shutdown();
    }
    jest.restoreAllMocks();
  });

  describe('Basic Instrumentation', () => {
    it('should instrument express app with middleware', () => {
      ExpressInstrumentation.instrument(app);
      
      expect(app.use).toHaveBeenCalledTimes(2); // trace middleware + error handler
      expect(app.use).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should not double-instrument the same app', () => {
      ExpressInstrumentation.instrument(app);
      ExpressInstrumentation.instrument(app);
      
      expect(app.use).toHaveBeenCalledTimes(2); // Should still be 2, not 4
      expect(console.warn).toHaveBeenCalledWith('Treebeard: Express app is already instrumented');
    });

    it('should skip instrumentation when TreebeardCore not initialized', () => {
      (TreebeardCore as any).instance = null;
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      ExpressInstrumentation.instrument(app);
      const middleware = (app as any).middleware[0];
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.treebeardTraceId).toBeUndefined();
    });
  });

  describe('Request Tracing', () => {
    beforeEach(() => {
      ExpressInstrumentation.instrument(app);
    });

    it('should add trace information to request and response', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      expect(req.treebeardTraceId).toBeDefined();
      expect(req.treebeardSpanId).toBeDefined();
      expect(req.treebeardStartTime).toBeDefined();
      expect(res.treebeardTraceId).toBe(req.treebeardTraceId);
      expect(next).toHaveBeenCalled();
    });

    it('should skip ignored paths', () => {
      ExpressInstrumentation.instrument(app, {
        ignorePaths: ['/health', '/metrics']
      });
      
      const req = createMockRequest({ path: '/health' });
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      expect(req.treebeardTraceId).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should log request start with metadata', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Starting request: GET /test"')
        })
      );
    });

    it('should capture request metadata correctly', () => {
      const req = createMockRequest({
        query: { param1: 'value1' },
        params: { id: '123' },
        headers: { 'user-agent': 'test-browser', 'authorization': 'Bearer token' }
      });
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.method).toBe('GET');
      expect(logEntry.props.query).toEqual({ param1: 'value1' });
      expect(logEntry.props.params).toEqual({ id: '123' });
      expect(logEntry.props.headers.authorization).toBe('[REDACTED]');
      expect(logEntry.props.headers['user-agent']).toBe('test-browser');
    });
  });

  describe('Response Handling', () => {
    beforeEach(() => {
      ExpressInstrumentation.instrument(app);
    });

    it('should log successful response completion', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      fetchMock.mockClear();
      
      // Simulate response end
      res.statusCode = 200;
      const originalEnd = res.end;
      (res.end as any) = jest.fn().mockImplementation(function(this: any, _chunk: any, _encoding: any) {
        // Simulate the actual end behavior
        if (typeof originalEnd === 'function') {
          originalEnd.call(this, _chunk, _encoding);
        }
        return this;
      });
      
      res.end();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Completed request: GET /test"')
        })
      );
    });

    it('should log error response for 4xx/5xx status codes', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      fetchMock.mockClear();
      
      // Simulate error response
      res.statusCode = 404;
      res.end();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Request completed with error: GET /test"')
        })
      );
    });

    it('should capture response body when using res.json()', () => {
      ExpressInstrumentation.instrument(app, { captureBody: true });
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const responseData = { message: 'success', data: [1, 2, 3] };
      
      // Mock json method behavior
      (res.json as any) = jest.fn().mockImplementation(function(this: any, body: any) {
        // Store the response body for capture testing
        (this as any)._responseBody = body;
        return this;
      });
      
      res.json(responseData);
      
      fetchMock.mockClear();
      res.end();
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.body).toEqual(responseData);
    });

    it('should handle large response bodies appropriately', () => {
      ExpressInstrumentation.instrument(app, { 
        captureBody: true,
        maxBodySize: 50 
      });
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const largeData = { data: 'x'.repeat(100) }; // Larger than maxBodySize
      
      res.json(largeData);
      
      fetchMock.mockClear();
      res.end();
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.body).toBe('[BODY_TOO_LARGE]');
      expect(logEntry.props.bodySize).toBeGreaterThan(50);
    });
  });

  describe('Error Handling', () => {
    it('should add error handler middleware when enabled', () => {
      ExpressInstrumentation.instrument(app, { errorHandler: true });
      
      expect(app.use).toHaveBeenCalledTimes(2);
      
      // Test error handler
      const errorHandler = (app as any).middleware[1];
      const error = new Error('Test error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      // Set trace info on request
      req.treebeardTraceId = 'test-trace-id';
      req.treebeardStartTime = Date.now() - 100;
      
      errorHandler(error, req, res, next);
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Request failed: GET /test"')
        })
      );
      expect(next).toHaveBeenCalledWith(error);
    });

    it('should not add error handler when disabled', () => {
      ExpressInstrumentation.instrument(app, { errorHandler: false });
      
      expect(app.use).toHaveBeenCalledTimes(1); // Only trace middleware
    });

    it('should handle errors gracefully when no trace info present', () => {
      ExpressInstrumentation.instrument(app, { errorHandler: true });
      
      const errorHandler = (app as any).middleware[1];
      const error = new Error('Test error');
      const req = createMockRequest(); // No trace info
      const res = createMockResponse();
      const next = jest.fn();
      
      expect(() => errorHandler(error, req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('Configuration Options', () => {
    it('should respect captureHeaders configuration', () => {
      ExpressInstrumentation.instrument(app, { captureHeaders: false });
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.headers).toBeUndefined();
    });

    it('should respect captureQuery configuration', () => {
      ExpressInstrumentation.instrument(app, { captureQuery: false });
      
      const req = createMockRequest({ query: { test: 'value' } });
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.query).toBeUndefined();
    });

    it('should respect captureParams configuration', () => {
      ExpressInstrumentation.instrument(app, { captureParams: false });
      
      const req = createMockRequest({ params: { id: '123' } });
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.params).toBeUndefined();
    });

    it('should use custom sanitization headers', () => {
      ExpressInstrumentation.instrument(app, { 
        sanitizeHeaders: ['x-custom-secret'] 
      });
      
      const req = createMockRequest({
        headers: { 
          'x-custom-secret': 'secret-value',
          'authorization': 'Bearer token' // Default sanitized header
        }
      });
      const res = createMockResponse();
      const next = jest.fn();
      
      const middleware = (app as any).middleware[0];
      middleware(req, res, next);
      
      const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      const logEntry = callBody.logs[0];
      
      expect(logEntry.props.headers['x-custom-secret']).toBe('[REDACTED]');
      expect(logEntry.props.headers.authorization).toBe('Bearer token'); // Not in custom list
    });
  });

  describe('createMiddleware', () => {
    it('should create middleware that instruments the app', () => {
      const middleware = ExpressInstrumentation.createMiddleware();
      
      const req = createMockRequest({ app });
      const res = createMockResponse();
      const next = jest.fn();
      
      middleware(req, res, next);
      
      expect(app.use).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('withTreebeard', () => {
    it('should wrap handler with tracing', async () => {
      const handler = jest.fn() as any;
      handler.mockResolvedValue('result');
      const wrappedHandler = ExpressInstrumentation.withTreebeard(handler, 'test-handler');
      
      const result = await wrappedHandler('arg1', 'arg2');
      
      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toBe('result');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Starting test-handler"')
        })
      );
    });

    it('should handle handler errors and re-throw', async () => {
      const error = new Error('Handler error');
      const handler = jest.fn() as any;
      handler.mockRejectedValue(error);
      const wrappedHandler = ExpressInstrumentation.withTreebeard(handler);
      
      await expect(wrappedHandler()).rejects.toThrow('Handler error');
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Failed handler"')
        })
      );
    });

    it('should work without TreebeardCore initialized', async () => {
      (TreebeardCore as any).instance = null;
      
      const handler = jest.fn() as any;
      handler.mockResolvedValue('result');
      const wrappedHandler = ExpressInstrumentation.withTreebeard(handler);
      
      const result = await wrappedHandler();
      
      expect(result).toBe('result');
      expect(handler).toHaveBeenCalled();
    });

    it('should use function name when no trace name provided', async () => {
      function namedFunction() {
        return 'result';
      }
      
      const wrappedHandler = ExpressInstrumentation.withTreebeard(namedFunction);
      
      await wrappedHandler();
      
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"msg":"Starting namedFunction"')
        })
      );
    });
  });
});