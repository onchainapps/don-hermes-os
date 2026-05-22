/**
 * Hermes Gateway client — proxied through backend /gp (profile-aware).
 * No import.meta.env dependencies (ModalChat antipode fixed).
 * Uses /gp/v1/chat/completions which routes through the profile-aware proxy.
 */

export function gatewayChatUrl(profileName?: string): string {
  return `/gp/v1/chat/completions`;
}

export function gatewayHeaders(profileName?: string, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (profileName) headers['X-Hermes-Profile'] = profileName;
  if (sessionId) headers['X-Hermes-Session-Id'] = sessionId;
  return headers;
}
