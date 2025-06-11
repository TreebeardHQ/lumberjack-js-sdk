import { NextRequest, NextResponse } from 'next/server';
import { TreebeardCore, TreebeardContext } from '@treebeard/core';

export interface NextJSMiddlewareConfig {
  ignorePaths?: string[];
  captureHeaders?: boolean;
  captureBody?: boolean;
  sanitizeHeaders?: string[];
}

export function createTreebeardMiddleware(config: NextJSMiddlewareConfig = {}) {
  const {
    ignorePaths = ['/api/health', '/_next', '/favicon.ico'],
    captureHeaders = true,
    captureBody = false,
    sanitizeHeaders = ['authorization', 'cookie', 'x-api-key']
  } = config;

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    if (ignorePaths.some(path => pathname.startsWith(path))) {
      return NextResponse.next();
    }

    const treebeard = TreebeardCore.getInstance();
    if (!treebeard) {
      return NextResponse.next();
    }

    const traceId = TreebeardContext.generateTraceId();
    const spanId = TreebeardContext.generateSpanId();
    const traceName = `${request.method} ${pathname}`;

    const context = {
      traceId,
      spanId,
      traceName,
      requestId: request.headers.get('x-request-id') || `req_${Date.now()}`
    };

    return await TreebeardContext.runAsync(context, async () => {
      const startTime = Date.now();

      const requestData: Record<string, any> = {
        method: request.method,
        url: request.url,
        pathname,
        query: Object.fromEntries(request.nextUrl.searchParams.entries()),
        userAgent: request.headers.get('user-agent'),
        ip: request.ip || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
      };

      if (captureHeaders) {
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          if (sanitizeHeaders.includes(key.toLowerCase())) {
            headers[key] = '[REDACTED]';
          } else {
            headers[key] = value;
          }
        });
        requestData.headers = headers;
      }

      if (captureBody && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        try {
          requestData.body = await request.json();
        } catch {
          // Body might not be JSON or already consumed
        }
      }

      treebeard.info(`Starting request: ${traceName}`, {
        ...requestData,
        _traceStart: true
      });

      let response: NextResponse;
      let error: Error | null = null;

      try {
        response = NextResponse.next();
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        response = NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 }
        );
      }

      const duration = Date.now() - startTime;
      const responseData = {
        statusCode: response.status,
        duration,
        headers: captureHeaders ? Object.fromEntries(response.headers.entries()) : undefined
      };

      if (error) {
        treebeard.logError(`Failed request: ${traceName}`, error, {
          ...responseData,
          _traceEnd: true,
          success: false
        });
      } else if (response.status >= 400) {
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

      return response;
    });
  };
}

export function withTreebeard<T extends (...args: any[]) => any>(
  handler: T,
  traceName?: string
): T {
  return (async (...args: Parameters<T>) => {
    const treebeard = TreebeardCore.getInstance();
    if (!treebeard) {
      return handler(...args);
    }

    const name = traceName || handler.name || 'handler';
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