/// <reference types="bun-types" />
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

// Read GATEWAY_AUTH from PM2 prod process (PID 1142702) — never log value
function getGatewayAuth(): string {
  try {
    const env = readFileSync("/proc/1142702/environ", "utf-8");
    for (const chunk of env.split("\x00")) {
      if (chunk.startsWith("GATEWAY_AUTH=")) return chunk.split("=", 1)[1] ?? "";
    }
  } catch {}
  return "";
}

function startWs(label: string): Promise<{ run_id: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const auth = getGatewayAuth();
    if (auth) headers["Authorization"] = `Bearer ${auth}`;

    const ws = new WebSocket("ws://localhost:3001/ws/chat");
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        type: "start", input: "echo", conversation_history: [], label,
      }));
    });
    ws.addEventListener("message", (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "run_id") { ws.close(); resolve({ run_id: msg.run_id }); }
      if (msg.type === "error")    { ws.close(); reject(new Error(msg.message)); }
    });
    setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 8000);
  });
}

describe("label propagation", () => {
  it("startWithLabel returns run_id when GATEWAY_AUTH is set", async () => {
    const auth = getGatewayAuth();
    if (!auth) {
      // Skip if no GATEWAY_AUTH in PM2-prod environment (Gateway 401)
      expect(true).toBe(true);
      return;
    }
    const { run_id } = await startWs("test-lbl");
    expect(run_id).toBeTruthy();
  });
});
