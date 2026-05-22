/**
 * API Base URL helper
 *
 * In dev (Vite proxy on 5173): all /api/ and /gp/ requests are proxied
 *   to the backend behind the scenes. apiBase returns ''.
 *
 * In production with separate dashboard (vite preview on 3002): the
 *   dashboard server doesn't proxy. We detect this by checking whether
 *   we're on a non-backend port and point calls to the backend.
 *
 * You can override via VITE_API_BASE_URL env var at build time.
 */

/** Base URL for HTTP API calls (relative or absolute) */
export function apiBase(): string {
  if (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  const port = window.location.port;
  const host = window.location.hostname;
  if (port === '5173') return '';                    // dev — Vite proxy handles it
  if (port === '3002') return `http://${host}:3001`; // prod dashboard → backend
  return '';
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}

/** WebSocket host for terminal/ws connections (same-origin or absolute) */
export function wsHost(): string {
  if (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_WS_HOST) {
    return import.meta.env.VITE_WS_HOST;
  }
  const port = window.location.port;
  const host = window.location.hostname;
  if (port === '5173') return `${host}:5173`;         // dev — Vite proxy handles WS
  if (port === '3002') return `${host}:3001`;         // prod dashboard → backend
  return `${host}:${port}`;                            // same-origin
}

export function wsUrl(path: string): string {
  return `ws://${wsHost()}${path}`;
}
