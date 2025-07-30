import type { FrontendEvent, Exporter } from "./types";

export class HttpExporter implements Exporter {
  private endpoint: string;

  constructor(
    private apiKey: string,
    private projectName: string,
    endpoint?: string
  ) {
    this.endpoint = endpoint || "https://api.trylumberjack.com/rum/events";
  }

  async export(events: FrontendEvent[], sessionId: string): Promise<void> {
    const payload = {
      project_name: this.projectName,
      session_id: sessionId,
      events: events.map((event) => ({
        type: event.type,
        timestamp: event.timestamp,
        data: event.data,
      })),
    };

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
  }

}

// Simple console exporter for development/debugging
export class ConsoleExporter implements Exporter {
  async export(events: FrontendEvent[], sessionId: string): Promise<void> {
    console.group(`🪵 Lumberjack Export - Session: ${sessionId}`);
    events.forEach((event) => {
      const emoji =
        event.type === "error" ? "❌" : event.type === "custom" ? "📊" : "🎥";
      console.log(`${emoji} ${event.type}:`, {
        timestamp: new Date(event.timestamp).toISOString(),
        user: event.userId,
        data: event.data,
      });
    });
    console.groupEnd();
  }
}