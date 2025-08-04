import type { FrontendEvent } from "./types";
import { collectBrowserProperties } from "./browser-properties";

export class PageViewTracker {
  private trackEvent: (event: FrontendEvent) => void;
  private getSessionId: () => string;
  private lastUrl: string;
  private originalPushState: typeof history.pushState;
  private originalReplaceState: typeof history.replaceState;

  constructor(
    trackEvent: (event: FrontendEvent) => void,
    getSessionId: () => string
  ) {
    this.trackEvent = trackEvent;
    this.getSessionId = getSessionId;
    this.lastUrl = window.location.href;
    
    // Store original History API methods
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
  }

  start(): void {
    // Track initial page view
    this.trackPageView("initial_load");

    // Listen for browser back/forward navigation
    window.addEventListener("popstate", this.handlePopState);
    
    // Listen for hash changes
    window.addEventListener("hashchange", this.handleHashChange);

    // Intercept History API methods
    this.interceptHistoryMethods();
  }

  stop(): void {
    // Remove event listeners
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("hashchange", this.handleHashChange);

    // Restore original History API methods
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;
  }

  private handlePopState = (): void => {
    this.checkForUrlChange("browser_navigation");
  };

  private handleHashChange = (): void => {
    this.checkForUrlChange("hash_change");
  };

  private interceptHistoryMethods(): void {
    const self = this;

    // Override pushState
    history.pushState = function(...args: Parameters<typeof history.pushState>) {
      const result = self.originalPushState.apply(history, args);
      self.checkForUrlChange("push_state");
      return result;
    };

    // Override replaceState
    history.replaceState = function(...args: Parameters<typeof history.replaceState>) {
      const result = self.originalReplaceState.apply(history, args);
      self.checkForUrlChange("replace_state");
      return result;
    };
  }

  private checkForUrlChange(navigationType: string): void {
    const currentUrl = window.location.href;
    
    // Only track if URL actually changed
    if (currentUrl !== this.lastUrl) {
      this.lastUrl = currentUrl;
      this.trackPageView(navigationType);
    }
  }

  private trackPageView(navigationType: string): void {
    const browserProps = collectBrowserProperties();
    
    const pageViewEvent: FrontendEvent = {
      type: "custom",
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
      data: {
        name: "page_view",
        properties: {
          url: browserProps.page_url,
          title: browserProps.page_title,
          referrer: browserProps.referrer,
          navigation_type: navigationType,
          path: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
          hostname: window.location.hostname,
          // Include viewport info for responsive tracking
          viewport_width: browserProps.viewport_width,
          viewport_height: browserProps.viewport_height,
          screen_width: browserProps.screen_width,
          screen_height: browserProps.screen_height,
          // Include user agent info
          user_agent: browserProps.user_agent,
          browser_name: browserProps.browser_name,
          browser_version: browserProps.browser_version,
          os_name: browserProps.os_name,
          os_version: browserProps.os_version,
          device_type: browserProps.device_type,
        },
      },
    };

    this.trackEvent(pageViewEvent);
  }
}