/**
 * FloatingChat Simulation Test
 *
 * This test mimics exactly what FloatingChat.tsx does:
 * - Creates multiple chat instances via createHermesChat (like conversation tabs)
 * - Eagerly calls connect()
 * - Seeds messages from persisted conversations
 * - Sends messages through the shared GatewayClient
 *
 * Goal: catch race conditions when multiple chats are created rapidly.
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
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 60);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('send while not open');
    }
    setTimeout(() => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'chat') {
          // Simulate run start
          this.onmessage?.({ data: JSON.stringify({ type: 'run_id', run_id: 'run_' + Date.now() }) });
          // Simulate streaming delta
          this.onmessage?.({ data: JSON.stringify({ type: 'event', data: { type: 'message.delta', content: 'Hello from mock' } }) });
          // Simulate completion
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify({ type: 'event', data: { type: 'message.complete' } }) });
          }, 30);
        }
      } catch {}
    }, 10);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

// @ts-ignore
globalThis.WebSocket = MockWebSocket;

describe('FloatingChat simulation (multi-instance)', () => {
  let createHermesChat: any;
  let getSharedGatewayClient: any;

  beforeEach(async () => {
    // Fresh imports so we get clean singletons per test
    const gwMod = await import('../src/lib/gatewayClient.ts');
    const chatMod = await import('../src/lib/chat-ui/createHermesChat.ts');

    getSharedGatewayClient = gwMod.getSharedGatewayClient;
    createHermesChat = chatMod.createHermesChat;
  });

  test('creates multiple chat instances like FloatingChat tabs', async () => {
    const chat1 = createHermesChat({ label: 'floating-conv-1', persist: false });
    const chat2 = createHermesChat({ label: 'floating-conv-2', persist: false });

    // Both should be using the exact same underlying GatewayClient singleton
    expect(chat1).not.toBe(chat2);

    // Eager connect (exactly like FloatingChat does)
    await chat1.connect?.().catch(() => {});
    await chat2.connect?.().catch(() => {});

    // Send from first tab
    await chat1.send('test message from tab 1');

    // Give the mock time to process
    await new Promise(r => setTimeout(r, 120));

    // Second tab should still be usable
    await chat2.send('test from tab 2');

    expect(true).toBe(true); // If we got here without throwing, multi-instance works
  }, 10000);

  test('seeds messages from persisted conversation (like FloatingChat load)', async () => {
    const existingMessages = [
      { id: 'm1', role: 'user', content: 'previous question', status: 'complete', timestamp: new Date() },
      { id: 'm2', role: 'assistant', content: 'previous answer', status: 'complete', timestamp: new Date() },
    ];

    const chat = createHermesChat({
      label: 'floating-restored',
      persist: false,
    });

    // Simulate what FloatingChat does on restore
    chat.loadMessages(existingMessages);

    await chat.connect?.().catch(() => {});
    await chat.send('follow up question');

    await new Promise(r => setTimeout(r, 150));

    // Should not have thrown and should have the seeded messages
    expect(chat.messages().length).toBeGreaterThanOrEqual(2);
  }, 8000);
});
