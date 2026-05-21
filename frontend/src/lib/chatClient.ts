/**
 * @deprecated
 * This file is legacy and no longer used.
 * All chat now goes through createHermesChat + shared GatewayClient.
 * Safe to delete.
 */
export class ChatClient {
  constructor() {}
  connect() { console.warn('[ChatClient] Legacy class is deprecated'); }
  disconnect() {}
  // All other methods are intentionally removed
}
