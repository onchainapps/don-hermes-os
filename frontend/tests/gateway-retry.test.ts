/**
 * GatewayClient sendChat() retry & race-condition test
 * 
 * This test verifies that sendChat() properly waits for connection
 * instead of immediately throwing when the socket isn't ready yet.
 * 
 * Run with: bun test tests/gateway-retry.test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';

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
    // Simulate slow connection (realistic race condition)
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 80);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('Cannot send while not open');
    }
    setTimeout(() => {
      this.onmessage?.({ data: JSON.stringify({ type: 'echo', original: data }) });
    }, 5);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

// @ts-ignore
globalThis.WebSocket = MockWebSocket;

describe('GatewayClient sendChat retry logic', () => {
  let GatewayClient: any;

  beforeEach(async () => {
    const mod = await import('../src/lib/gatewayClient.ts');
    GatewayClient = mod.GatewayClient;
  });

  test('sendChat waits for connection instead of failing immediately', async () => {
    const client = new GatewayClient('http://localhost:3000');

    // Immediately call sendChat without waiting for connect()
    // This used to throw "Not connected to backend"
    const sendPromise = client.sendChat('hello world');

    // Should eventually succeed after the mock connects
    await expect(sendPromise).resolves.toBeUndefined();
  }, 5000);

  test('sendChat succeeds after multiple rapid calls', async () => {
    const client = new GatewayClient('http://localhost:3000');

    const results = await Promise.allSettled([
      client.sendChat('msg1'),
      client.sendChat('msg2'),
      client.sendChat('msg3'),
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    expect(succeeded).toBeGreaterThanOrEqual(2);
  }, 5000);
});
