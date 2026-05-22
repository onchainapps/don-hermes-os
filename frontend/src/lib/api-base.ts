/**
 * API Base URL helper
 *
 * In dev (Vite proxy on 5173): all /api/ and /gp/ requests are proxied
 *   to the backend behind the scenes. apiBase returns ''.
 *
 * In production with separate dashboard (vite preview on 3002): the
 *   dashboard server doesn't proxy. We detect this by checking whether
 *   we're on a non-backend port and point /api/ calls to the backend.
 *
 * You can override via VITE_API_BASE_URL env var at build time.
 */

export function apiBase(): string {
  // Allow build-time override
  if (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Auto-detect: if we're on a dashboard port (3002/5173) but NOT the backend port (3001/3003),
  // prefix API calls with the backend URL so they actually reach it.
  const port = window.location.port;
  const host = window.location.hostname;

  // Dev Vite server (5173) has proxy configured — no prefix needed
  if (port === '5173') return '';

  // Production dashboard (3002) — no proxy, need to point to backend
  if (port === '3002') return `http://${host}:3001`;

  // Dev backend (3003) — no proxy, point to dev backend
  if (port === '3003') return `http://${host}:3003`;

  // Default: same-origin (works when backend serves the frontend)
  return '';
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}
