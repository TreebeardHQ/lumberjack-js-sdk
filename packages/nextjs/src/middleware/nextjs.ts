import { TreebeardCore } from "@treebeardhq/core";
import { NextRequest, NextResponse } from "next/server";

export interface NextJSMiddlewareConfig {
  ignorePaths?: string[];
  captureHeaders?: boolean;
  captureBody?: boolean;
  sanitizeHeaders?: string[];
}

export function createTreebeardMiddleware(config: NextJSMiddlewareConfig = {}) {
  const {
    ignorePaths = ["/api/health", "/_next", "/favicon.ico"],
    captureHeaders = true,
    captureBody = false,
    sanitizeHeaders = ["authorization", "cookie", "x-api-key"],
  } = config;

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    if (ignorePaths.some((path) => pathname.startsWith(path))) {
      return NextResponse.next();
    }

    const treebeard = TreebeardCore.getInstance();
    if (!treebeard) {
      return NextResponse.next();
    }

    // Generate trace and span IDs
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const traceName = `${request.method} ${pathname}`;
    const startTime = Date.now();

    // Set trace context in global for console capture
    if (typeof globalThis !== "undefined") {
      (globalThis as any).__TREEBEARD_TRACE_CONTEXT = { traceId, spanId };
    }

    const requestData: Record<string, any> = {
      method: request.method,
      url: request.url,
      pathname,
      query: Object.fromEntries(request.nextUrl.searchParams.entries()),
      userAgent: request.headers.get("user-agent"),
      ip:
        request.ip ||
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip"),
      requestId: request.headers.get("x-request-id") || `req_${Date.now()}`,
    };

    if (captureHeaders) {
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        if (sanitizeHeaders.includes(key.toLowerCase())) {
          headers[key] = "[REDACTED]";
        } else {
          headers[key] = value;
        }
      });
      requestData.headers = headers;
    }

    if (captureBody && ["POST", "PUT", "PATCH"].includes(request.method)) {
      try {
        const clonedRequest = request.clone();
        requestData.body = await clonedRequest.json();
      } catch {
        // Body might not be JSON or already consumed
      }
    }

    // Start trace
    treebeard.log("info", `Starting request: ${traceName}`, {
      ...requestData,
      traceId,
      spanId,
      _traceStart: true,
    });

    let response: NextResponse;
    let error: Error | null = null;

    try {
      response = NextResponse.next();

      // Add trace headers to response
      response.headers.set("x-treebeard-trace-id", traceId);
      response.headers.set("x-treebeard-span-id", spanId);
      response.headers.set("x-treebeard-trace-name", traceName);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      response = NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
      );

      const duration = Date.now() - startTime;
      treebeard.logError(`Failed request: ${traceName}`, error, {
        statusCode: 500,
        duration,
        traceId,
        spanId,
        _traceEnd: true,
        success: false,
      });

      // Clear global trace context
      if (typeof globalThis !== "undefined") {
        delete (globalThis as any).__TREEBEARD_TRACE_CONTEXT;
      }
    }

    return response;
  };
}

// Helper functions for trace ID generation
function generateTraceId(): string {
  return `T${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

function generateSpanId(): string {
  return `S${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
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

    const name = traceName || handler.name || "handler";

    // Try to get existing trace context or create new one
    let traceId: string;
    let spanId: string;

    if (
      typeof globalThis !== "undefined" &&
      (globalThis as any).__TREEBEARD_TRACE_CONTEXT
    ) {
      traceId = (globalThis as any).__TREEBEARD_TRACE_CONTEXT.traceId;
      spanId = generateSpanId(); // New span for this handler
    } else {
      traceId = generateTraceId();
      spanId = generateSpanId();
    }

    const startTime = Date.now();

    treebeard.log("info", `Starting ${name}`, {
      traceId,
      spanId,
      _traceStart: true,
    });

    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;

      treebeard.log("info", `Completed ${name}`, {
        traceId,
        spanId,
        duration,
        _traceEnd: true,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      treebeard.logError(`Failed ${name}`, err, {
        traceId,
        spanId,
        duration,
        _traceEnd: true,
        success: false,
      });

      throw error;
    }
  }) as T;
}
