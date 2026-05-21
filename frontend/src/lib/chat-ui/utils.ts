import { marked } from 'marked';

// ─── Markdown Setup ──────────────────────────────────────────────────────────

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function parseMarkdown(text: string): string {
  return marked.parse(text) as string;
}

// ─── Time Formatting ─────────────────────────────────────────────────────────

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/Chicago' });
}

export function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const h = Math.floor((Date.now() - d.getTime()) / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return '';
  }
}

// ─── ID Generation ───────────────────────────────────────────────────────────

export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
