export class NetworkInterceptor {
  private originalFetch: typeof fetch;
  private originalXhrOpen: typeof XMLHttpRequest.prototype.open;
  private originalXhrSend: typeof XMLHttpRequest.prototype.send;
  private originalXhrSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader;
  private getSessionId: () => string | null;
  private isStarted = false;

  constructor(getSessionId: () => string | null) {
    this.getSessionId = getSessionId;
    this.originalFetch = window.fetch.bind(window);
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalXhrSend = XMLHttpRequest.prototype.send;
    this.originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  }

  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    this.interceptFetch();
    this.interceptXHR();
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;

    // Restore original functions
    window.fetch = this.originalFetch;
    XMLHttpRequest.prototype.open = this.originalXhrOpen;
    XMLHttpRequest.prototype.send = this.originalXhrSend;
    XMLHttpRequest.prototype.setRequestHeader = this.originalXhrSetRequestHeader;
  }

  private interceptFetch(): void {
    const self = this;
    
    window.fetch = function(...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const sessionId = self.getSessionId();
      
      if (sessionId) {
        // Clone the init object to avoid mutating the original
        const modifiedInit: RequestInit = {
          ...init,
          headers: {
            ...init?.headers,
            'x-lumberjack-session-id': sessionId
          }
        };
        
        return self.originalFetch(input, modifiedInit);
      }
      
      return self.originalFetch(...args);
    };
  }

  private interceptXHR(): void {
    const self = this;
    
    // Store headers per XHR instance
    const xhrHeaders = new WeakMap<XMLHttpRequest, Map<string, string>>();
    
    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ) {
      // Initialize headers storage for this XHR instance
      xhrHeaders.set(this, new Map());
      
      // Call original open
      return self.originalXhrOpen.apply(this, [method, url, async!, username, password]);
    };
    
    XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
      // Store headers set by the application
      const headers = xhrHeaders.get(this);
      if (headers) {
        headers.set(name, value);
      }
      
      return self.originalXhrSetRequestHeader.apply(this, [name, value]);
    };
    
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      const sessionId = self.getSessionId();
      
      // Add session ID header if available
      if (sessionId) {
        self.originalXhrSetRequestHeader.apply(this, ['x-lumberjack-session-id', sessionId]);
      }
      
      // Clean up headers storage
      xhrHeaders.delete(this);
      
      return self.originalXhrSend.apply(this, [body]);
    };
  }
}