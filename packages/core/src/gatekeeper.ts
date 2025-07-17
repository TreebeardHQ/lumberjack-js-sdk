import { LumberjackCore } from "./core.js";
import { getEnvironmentValue } from "./runtime.js";
import {
  GatekeeperResponse,
  GatekeeperResult,
  GatekeeperSchema,
} from "./types.js";

interface CacheEntry {
  value: boolean;
  timestamp: number;
}

export class Gatekeeper {
  private core: LumberjackCore;
  private apiKey: string;
  private serviceToken: string;
  private gatekeeperEndpoint: string;
  private gatekeeperTypes: Set<string> | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 60000; // 60 seconds in milliseconds

  constructor(core: LumberjackCore) {
    this.core = core;
    const config = core.getConfig();

    this.apiKey =
      config.apiKey || getEnvironmentValue("LUMBERJACK_API_KEY") || "";
    this.serviceToken =
      config.serviceToken ||
      getEnvironmentValue("LUMBERJACK_SERVICE_TOKEN") ||
      "";
    this.gatekeeperEndpoint =
      config.gatekeeperEndpoint ||
      getEnvironmentValue("LUMBERJACK_GATEKEEPER_ENDPOINT") ||
      "https://api.trylumberjack.com/gatekeeper";

    this.loadGatekeeperTypes();
  }

  private loadGatekeeperTypes(): void {
    // Only try to load types in Node.js environment
    if (
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node
    ) {
      try {
        // Try to load the generated types file
        const typesPath = process.cwd() + "/.lumberjack/gatekeeper-types.json";
        const fs = require("fs");

        if (fs.existsSync(typesPath)) {
          const types = JSON.parse(fs.readFileSync(typesPath, "utf-8"));
          this.gatekeeperTypes = new Set(types.gatekeepers);
        }
      } catch (error) {
        // Types file doesn't exist or can't be loaded
        if (this.core.getConfig().debug) {
          console.log(
            "[Lumberjack] Could not load gatekeeper types. Run 'npx lumberjackhq build' to generate types."
          );
        }
      }
    }
  }

  private validateGatekeeperKey(key: string): void {
    if (this.gatekeeperTypes && !this.gatekeeperTypes.has(key)) {
      console.warn(
        `[Lumberjack] Unknown gatekeeper key '${key}'. Run 'npx lumberjackhq build' to update gatekeeper types.`
      );
    }
  }

  async checkGatekeeper(key: string): Promise<boolean> {
    this.validateGatekeeperKey(key);

    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.CACHE_TTL) {
        if (this.core.getConfig().debug) {
          console.log(
            `[Lumberjack] Using cached value for gatekeeper '${key}' (age: ${Math.round(
              age / 1000
            )}s)`
          );
        }
        return cached.value;
      } else {
        // Remove expired entry
        this.cache.delete(key);
      }
    }

    if (!this.apiKey) {
      console.error("[Lumberjack] No API key configured for gatekeeper check");
      return false;
    }

    try {
      const response = await fetch(`${this.gatekeeperEndpoint}/${key}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          `[Lumberjack] Gatekeeper check failed: ${response.statusText}`
        );
        return false;
      }

      const data: GatekeeperResponse = await response.json();

      // Cache the result
      this.cache.set(key, {
        value: data.allowed,
        timestamp: Date.now(),
      });

      if (this.core.getConfig().debug) {
        console.log(
          `[Lumberjack] Cached gatekeeper '${key}' value: ${data.allowed}`
        );
      }

      return data.allowed;
    } catch (error) {
      console.error("[Lumberjack] Failed to check gatekeeper:", error);
      return false;
    }
  }

  async fetchSchema(): Promise<GatekeeperSchema | null> {
    if (!this.serviceToken) {
      console.error(
        "[Lumberjack] No service token configured for fetching gatekeeper schema"
      );
      return null;
    }

    try {
      const response = await fetch(`${this.gatekeeperEndpoint}/schema`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          `[Lumberjack] Failed to fetch gatekeeper schema: ${response.statusText}`
        );
        return null;
      }

      const data: GatekeeperSchema = await response.json();
      return data;
    } catch (error) {
      console.error("[Lumberjack] Failed to fetch gatekeeper schema:", error);
      return null;
    }
  }

  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
      if (this.core.getConfig().debug) {
        console.log(`[Lumberjack] Cleared cache for gatekeeper '${key}'`);
      }
    } else {
      this.cache.clear();
      if (this.core.getConfig().debug) {
        console.log("[Lumberjack] Cleared all gatekeeper cache");
      }
    }
  }

  gatekeeper(key: string): GatekeeperResult {
    const self = this;

    return {
      async pass(): Promise<void> {
        const allowed = await self.checkGatekeeper(key);

        if (allowed) {
          self.core.info(`Gatekeeper '${key}' passed`, {
            gatekeeper: key,
            result: "pass",
          });
        } else {
          self.core.info(`Gatekeeper '${key}' failed (expected pass)`, {
            gatekeeper: key,
            result: "fail",
            expected: "pass",
          });
        }
      },

      async fail(): Promise<void> {
        const allowed = await self.checkGatekeeper(key);

        if (!allowed) {
          self.core.info(`Gatekeeper '${key}' failed`, {
            gatekeeper: key,
            result: "fail",
          });
        } else {
          self.core.info(`Gatekeeper '${key}' passed (expected fail)`, {
            gatekeeper: key,
            result: "pass",
            expected: "fail",
          });
        }
      },
    };
  }
}
