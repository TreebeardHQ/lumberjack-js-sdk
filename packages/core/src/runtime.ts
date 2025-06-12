export interface RuntimeEnvironment {
  isNode: boolean;
  isBrowser: boolean;
  isEdgeRuntime: boolean;
  isWorkerd: boolean;
  hasProcess: boolean;
  hasWindow: boolean;
}

export function detectRuntime(): RuntimeEnvironment {
  // Check for Edge Runtime (Vercel, Next.js middleware, Cloudflare Workers)
  const isEdgeRuntime = (typeof globalThis !== 'undefined' && 'EdgeRuntime' in globalThis) || 
                       (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers');

  // Check for Cloudflare Workers specifically
  const isWorkerd = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

  // Check for process object (Node.js)
  const hasProcess = typeof process !== 'undefined' && 
                    process.versions && 
                    process.versions.node;

  // Check for window object (Browser)
  const hasWindow = typeof window !== 'undefined';

  // Determine environment
  const isNode = Boolean(hasProcess) && !isEdgeRuntime;
  const isBrowser = Boolean(hasWindow) && !isEdgeRuntime;

  return {
    isNode,
    isBrowser,
    isEdgeRuntime: Boolean(isEdgeRuntime),
    isWorkerd: Boolean(isWorkerd),
    hasProcess: Boolean(hasProcess),
    hasWindow: Boolean(hasWindow)
  };
}

export function getEnvironmentValue(key: string, fallback?: string): string | undefined {
  const runtime = detectRuntime();
  
  if (runtime.hasProcess && process.env) {
    return process.env[key] || fallback;
  }
  
  return fallback;
}