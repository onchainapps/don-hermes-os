/**
 * GatewayClient — legacy WebSocket client
 * 
 * NOTE: The new floating chat (ModalChat) uses the pure HTTP Runs API
 * and does not depend on this WebSocket client anymore.
 * This file is kept only for backward compatibility with older components.
 */

export class GatewayClient {
  backendBase: string;
  state: any = { messages: [] };

  constructor(base: string) {
    this.backendBase = base;
  }

  async connect(): Promise<void> {
    // Legacy WebSocket connection - no longer used by new chat
    console.warn('[GatewayClient] WebSocket connect called (legacy)');
  }

  async sendChat(message: string) {
    console.warn('[GatewayClient] sendChat called (legacy)');
    return { status: 'legacy' };
  }
}

export function getSharedGatewayClient() {
  return new GatewayClient('');
}
