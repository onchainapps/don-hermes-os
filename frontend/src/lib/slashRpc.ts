/**
 * Lightweight RPC helper for slash commands in non-WebSocket contexts.
/**
 * Slash command RPC helper.
 * For WebSocket-based contexts, prefer the shared GatewayClient.
 */

export interface SlashRpcResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export async function slashRpc(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch('/api/gateway/v1/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `slash_${Date.now()}`, method, params }),
  });

  if (!res.ok) {
    throw new Error(`RPC ${method} failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`RPC ${method} error: ${data.error.message || data.error}`);
  }
  return data.result;
}

/**
 * Check gateway status (busy mode, model, queue length).
 */
export async function getStatus(): Promise<{
  status: string;
  model: string;
  busy: boolean;
  queue_length?: number;
}> {
  const res = await fetch('/api/gateway/status');
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
  return res.json();
}
