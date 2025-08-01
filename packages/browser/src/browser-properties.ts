export interface BrowserProperties {
  page_url: string;
  page_title: string;
  referrer: string;
  user_agent: string;
  browser_name: string;
  browser_version: string;
  os_name: string;
  os_version: string;
  device_type: string;
  screen_width: number;
  screen_height: number;
  viewport_width: number;
  viewport_height: number;
  domain: string;
  language: string;
  timezone: string;
  timezone_offset: number;
}

export function collectBrowserProperties(): BrowserProperties {
  const userAgent = navigator.userAgent;
  const browserInfo = detectBrowser(userAgent);
  const osInfo = detectOS(userAgent);
  
  return {
    page_url: window.location.href,
    page_title: document.title,
    referrer: document.referrer,
    user_agent: userAgent,
    browser_name: browserInfo.name,
    browser_version: browserInfo.version,
    os_name: osInfo.name,
    os_version: osInfo.version,
    device_type: detectDeviceType(userAgent),
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    domain: window.location.hostname,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone_offset: new Date().getTimezoneOffset(),
  };
}

function detectBrowser(userAgent: string): { name: string; version: string } {
  let name = "Unknown";
  let version = "Unknown";

  if (userAgent.includes("Firefox/")) {
    name = "Firefox";
    version = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || "Unknown";
  } else if (userAgent.includes("Edg/")) {
    name = "Edge";
    version = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || "Unknown";
  } else if (userAgent.includes("Chrome/") && !userAgent.includes("Edg/")) {
    name = "Chrome";
    version = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || "Unknown";
  } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) {
    name = "Safari";
    version = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || "Unknown";
  } else if (userAgent.includes("Opera/") || userAgent.includes("OPR/")) {
    name = "Opera";
    version = userAgent.match(/(?:Opera|OPR)\/(\d+\.\d+)/)?.[1] || "Unknown";
  }

  return { name, version };
}

function detectOS(userAgent: string): { name: string; version: string } {
  let name = "Unknown";
  let version = "Unknown";

  if (userAgent.includes("Windows NT")) {
    name = "Windows";
    const match = userAgent.match(/Windows NT (\d+\.\d+)/);
    if (match) {
      const ntVersion = match[1];
      switch (ntVersion) {
        case "10.0": version = "10"; break;
        case "6.3": version = "8.1"; break;
        case "6.2": version = "8"; break;
        case "6.1": version = "7"; break;
        default: version = ntVersion;
      }
    }
  } else if (userAgent.includes("Mac OS X")) {
    name = "macOS";
    version = userAgent.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace(/_/g, ".") || "Unknown";
  } else if (userAgent.includes("Android")) {
    name = "Android";
    version = userAgent.match(/Android (\d+\.\d+)/)?.[1] || "Unknown";
  } else if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    name = "iOS";
    version = userAgent.match(/OS (\d+[._]\d+)/)?.[1]?.replace(/_/g, ".") || "Unknown";
  } else if (userAgent.includes("Linux")) {
    name = "Linux";
    version = "Unknown";
  }

  return { name, version };
}

function detectDeviceType(userAgent: string): string {
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    return "tablet";
  } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    return "mobile";
  } else {
    return "desktop";
  }
}