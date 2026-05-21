/**
 * Hermes Gateway client — proxied through backend API.
 * Uses /api/gateway prefix so it works when accessing dashboard remotely.
 */

const GATEWAY_URL = '/api/gateway';
const GATEWAY_AUTH = import.meta.env.VITE_GATEWAY_AUTH || '';

export function gatewayChatUrl(): string {
  return `${GATEWAY_URL}/v1/chat/completions`;
}

export function gatewayHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (GATEWAY_AUTH) headers['Authorization'] = `Bearer ${GATEWAY_AUTH}`;
  if (sessionId) headers['X-Hermes-Session-Id'] = sessionId;
  return headers;
}
