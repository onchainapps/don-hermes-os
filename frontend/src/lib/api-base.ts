/**
 * API Base URL helper
 *
 * Vite dev server proxy handles /api/ forwarding.
 * In production (vite preview or nginx), relative paths work directly.
 */

export function apiBase(): string {
  return '';
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}
