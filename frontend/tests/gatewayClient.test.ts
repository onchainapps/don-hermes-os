/**
 * Frontend GatewayClient Tests
 *
 * These tests verify the GatewayClient state machine and event handling.
 * Run from the frontend directory with: bun test (or use Vitest if added)
 */

import { describe, test, expect, beforeEach } from 'bun:test';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  send(data: string) {
    // Simulate echo for testing
    setTimeout(() => {
      this.onmessage?.({ data: JSON.stringify({ type: 'echo', original: data }) });
    }, 5);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

// @ts-ignore - inject mock
globalThis.WebSocket = MockWebSocket;

describe('GatewayClient', () => {
  let GatewayClient: any;

  beforeEach(async () => {
    // Dynamically import to get fresh instance
    const mod = await import('../src/lib/gatewayClient.ts');
    GatewayClient = mod.GatewayClient;
  });

  test('initializes with idle state', () => {
    const client = new GatewayClient('http://localhost:3000');
    expect(client.state).toBeDefined();
    expect(client.state.messages).toEqual([]);
    expect(client.state.streaming).toBe(false);
  });

  test('connects to backend WebSocket', async () => {
    const client = new GatewayClient('http://localhost:3000');

    const connected = await new Promise<boolean>(resolve => {
      client.onState((s: string) => {
        if (s === 'open') resolve(true);
      });

      // Trigger connection
      (client as any).connect?.();

      setTimeout(() => resolve(false), 100);
    });

    expect(connected).toBe(true);
  });
});
