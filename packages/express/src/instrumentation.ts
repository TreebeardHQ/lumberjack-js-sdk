import { Application, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { TreebeardCore, TreebeardContext } from '@treebeardhq/core';
import { 
  ExpressInstrumentationConfig, 
  InstrumentedRequest, 
  InstrumentedResponse 
} from './types.js';

class ExpressInstrumentation {
  private static isInstrumented = new WeakSet<Application>();
  
  static instrument(app: Application, config: ExpressInstrumentationConfig = {}): void {
    if (this.isInstrumented.has(app)) {
      console.warn('Treebeard: Express app is already instrumented');
      return;
    }

    const {
      ignorePaths = ['/health', '/metrics', '/favicon.ico'],
      captureHeaders = true,
      captureBody = false,
      captureQuery = true,
      captureParams = true,
      sanitizeHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
      maxBodySize = 10000, // 10KB
      errorHandler = true
    } = config;

    // Add tracing middleware
    app.use((req: InstrumentedRequest, res: InstrumentedResponse, next: NextFunction) => {
      const pathname = req.path;

      // Skip ignored paths
      if (ignorePaths.some(path => pathname.startsWith(path))) {
        return next();
      }

      const treebeard = TreebeardCore.getInstance();
      if (!treebeard) {
        return next();
      }

      const traceId = TreebeardContext.generateTraceId();
      const spanId = TreebeardContext.generateSpanId();
      const traceName = `${req.method} ${pathname}`;
      const startTime = Date.now();

      // Set trace info on request/response
      req.treebeardTraceId = traceId;
      req.treebeardSpanId = spanId;
      req.treebeardStartTime = startTime;
      res.treebeardTraceId = traceId;

      const context = {
        traceId,
        spanId,
        traceName,
        requestId: req.headers['x-request-id'] as string || `req_${Date.now()}`
      };

      TreebeardContext.run(context, () => {
        // Collect request metadata
        const requestData: Record<string, any> = {
          method: req.method,
          url: req.url,
          path: req.path,
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
          protocol: req.protocol,
          httpVersion: req.httpVersion
        };

        if (captureQuery && Object.keys(req.query).length > 0) {
          requestData.query = req.query;
        }

        if (captureParams && Object.keys(req.params).length > 0) {
          requestData.params = req.params;
        }

        if (captureHeaders) {
          const headers: Record<string, string> = {};
          Object.entries(req.headers).forEach(([key, value]) => {
            if (sanitizeHeaders.includes(key.toLowerCase())) {
              headers[key] = '[REDACTED]';
            } else {
              headers[key] = Array.isArray(value) ? value.join(', ') : String(value || '');
            }
          });
          requestData.headers = headers;
        }

        if (captureBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (req.body) {
            const bodyStr = JSON.stringify(req.body);
            if (bodyStr.length <= maxBodySize) {
              requestData.body = req.body;
            } else {
              requestData.body = '[BODY_TOO_LARGE]';
              requestData.bodySize = bodyStr.length;
            }
          }
        }

        treebeard.info(`Starting request: ${traceName}`, {
          ...requestData,
          _traceStart: true
        });

        // Hook into response finish
        const originalEnd = res.end;
        const originalJson = res.json;
        
        let responseBody: any;
        
        // Capture response body if json() is used
        res.json = function(body: any) {
          responseBody = body;
          return originalJson.call(this, body);
        };

        res.end = function(chunk?: any, encoding?: any) {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          
          const responseData: Record<string, any> = {
            statusCode,
            duration,
            statusMessage: res.statusMessage
          };

          if (captureHeaders) {
            responseData.headers = res.getHeaders();
          }

          if (responseBody && captureBody) {
            const bodyStr = JSON.stringify(responseBody);
            if (bodyStr.length <= maxBodySize) {
              responseData.body = responseBody;
            } else {
              responseData.body = '[BODY_TOO_LARGE]';
              responseData.bodySize = bodyStr.length;
            }
          }

          if (statusCode >= 400) {
            treebeard.error(`Request completed with error: ${traceName}`, {
              ...responseData,
              _traceEnd: true,
              success: false
            });
          } else {
            treebeard.info(`Completed request: ${traceName}`, {
              ...responseData,
              _traceEnd: true,
              success: true
            });
          }

          return originalEnd.call(this, chunk, encoding);
        };

        next();
      });
    });

    // Add error handler if requested
    if (errorHandler) {
      const errorHandlerMiddleware: ErrorRequestHandler = (err, req: InstrumentedRequest, res: InstrumentedResponse, next: NextFunction) => {
        const treebeard = TreebeardCore.getInstance();
        
        if (treebeard && req.treebeardTraceId) {
          const duration = req.treebeardStartTime ? Date.now() - req.treebeardStartTime : 0;
          const traceName = `${req.method} ${req.path}`;
          
          treebeard.logError(`Request failed: ${traceName}`, err, {
            statusCode: res.statusCode || 500,
            duration,
            method: req.method,
            path: req.path,
            _traceEnd: true,
            success: false
          });
        }

        next(err);
      };

      app.use(errorHandlerMiddleware);
    }

    this.isInstrumented.add(app);
  }

  static createMiddleware(config: ExpressInstrumentationConfig = {}) {
    return (req: Request, _res: Response, next: NextFunction) => {
      // This is for manual middleware usage if someone prefers not to use instrument()
      const app = req.app;
      this.instrument(app, config);
      next();
    };
  }

  static withTreebeard<T extends (...args: any[]) => any>(
    handler: T,
    traceName?: string
  ): T {
    return (async (...args: Parameters<T>) => {
      const treebeard = TreebeardCore.getInstance();
      if (!treebeard) {
        return handler(...args);
      }

      const name = traceName || handler.name || 'express-handler';
      const traceId = TreebeardContext.generateTraceId();
      const spanId = TreebeardContext.generateSpanId();

      const context = {
        traceId,
        spanId,
        traceName: name
      };

      return await TreebeardContext.runAsync(context, async () => {
        const startTime = Date.now();
        
        treebeard.info(`Starting ${name}`, { _traceStart: true });

        try {
          const result = await handler(...args);
          const duration = Date.now() - startTime;
          
          treebeard.info(`Completed ${name}`, {
            duration,
            _traceEnd: true,
            success: true
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const err = error instanceof Error ? error : new Error(String(error));
          
          treebeard.logError(`Failed ${name}`, err, {
            duration,
            _traceEnd: true,
            success: false
          });
          
          throw error;
        }
      });
    }) as T;
  }
}

export { ExpressInstrumentation };