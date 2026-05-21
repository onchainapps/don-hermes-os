import { createSignal, Show, For, onCleanup, createEffect } from 'solid-js';
import type { Message, MessageRole } from '../types';
import MessageContent from './MessageContent';

interface MessageItemProps {
  message: Message;
  isLastStreaming?: boolean;
}

const ROLE_CONFIG: Record<
  MessageRole,
  { emoji: string; border: string; bg: string; nameColor: string }
> = {
  user: {
    emoji: '🧑',
    border: 'rgba(0,243,255,0.35)',
    bg: 'rgba(0,243,255,0.06)',
    nameColor: '#00f3ff',
  },
  assistant: {
    emoji: '🤖',
    border: 'rgba(0,255,136,0.35)',
    bg: 'rgba(0,255,136,0.06)',
    nameColor: '#00ff88',
  },
  tool: {
    emoji: '🔧',
    border: 'rgba(255,0,255,0.35)',
    bg: 'rgba(255,0,255,0.06)',
    nameColor: '#ff00ff',
  },
  system: {
    emoji: '⚡',
    border: 'rgba(0,243,255,0.15)',
    bg: 'rgba(0,243,255,0.03)',
    nameColor: 'rgba(0,243,255,0.5)',
  },
};

function formatTime(date: Date | string | number | null | undefined): string {
  const d = date instanceof Date ? date : date ? new Date(date) : null;
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Chicago',
  }) + ' CDT';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ToolStatusIcon(props: { status: string }) {
  const icons: Record<string, { icon: string; color: string }> = {
    pending: { icon: '⏳', color: '#888' },
    running: { icon: '⏱', color: '#ffaa00' },
    complete: { icon: '✅', color: '#00ff88' },
    error: { icon: '❌', color: '#ff4444' },
  };
  const c = icons[props.status] || icons.pending;
  return <span style={{ color: c.color }}>{c.icon}</span>;
}

/* ─── Collapsible reasoning block ───────────────────────────────── */
function ReasoningBlock(props: { text: string }) {
  const [open, setOpen] = createSignal(true); // default open for better UX during streaming

  return (
    <div class="mc-reasoning-block">
      <button
        class="mc-reasoning-toggle"
        onClick={() => setOpen(o => !o)}
      >
        <span class="mc-reasoning-icon">🧠</span>
        <span class="mc-reasoning-label">Thinking</span>
        <span class="mc-reasoning-count">({props.text.length} chars)</span>
        <span class="mc-reasoning-arrow">{open() ? '▼' : '▶'}</span>
      </button>
      <Show when={open()}>
        <pre class="mc-reasoning-text" style={{
          'max-height': props.text.length > 800 ? '240px' : undefined,
          overflow: props.text.length > 800 ? 'auto' : undefined
        }}>{props.text}</pre>
      </Show>
    </div>
  );
}

/* ─── Collapsible tool call block ────────────────────────────────── */
function ToolCallBlock(props: { tc: any }) {
  const [open, setOpen] = createSignal(props.tc.status === 'running');

  const statusColor = () => {
    if (props.tc.status === 'running') return '#ffaa00';
    if (props.tc.status === 'error') return '#ff5555';
    return '#00ff88';
  };

  return (
    <div class="mc-tool-block" style={{ border: `1px solid ${statusColor()}33` }}>
      <div class="mc-tool-header" onClick={() => setOpen(o => !o)}>
        <span class="mc-tool-icon">🔧</span>
        <span class="mc-tool-name">{props.tc.name}</span>
        <span class="mc-tool-status" style={{ color: statusColor() }}>
          {props.tc.status}
        </span>
        <Show when={props.tc.duration != null}>
          <span class="mc-tool-duration">{formatDuration(props.tc.duration!)}</span>
        </Show>
        <span class="mc-tool-arrow">{open() ? '▼' : '▶'}</span>
      </div>
      <Show when={open()}>
        <div class="mc-tool-body">
          <pre class="mc-tool-args">{props.tc.args || '(no args)'}</pre>
          <Show when={props.tc.result}>
            <div class="mc-tool-result">
              <div class="mc-tool-result-label">Result</div>
              <pre>{props.tc.result}</pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export default function MessageItem(props: MessageItemProps) {
  const [copied, setCopied] = createSignal(false);
  const cfg = ROLE_CONFIG[props.message.role] ?? ROLE_CONFIG.system;
  const isSystem = props.message.role === 'system';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* no-op */ }
  };

  /* ─── Empty streaming/pending assistant: show nice thinking state ─── */
  // Only show the fancy thinking animation for truly empty assistant messages.
  // As soon as any real content exists, hide it completely so the bubble transitions cleanly.
  const contentLen = props.message.content ? props.message.content.trim().length : 0;
  const isEmptyAssistant = props.message.role === 'assistant' &&
                           contentLen < 2 &&
                           (!props.message.reasoning || props.message.reasoning.trim().length === 0) &&
                           (!props.message.toolCalls || props.message.toolCalls.length === 0);

  if (isEmptyAssistant) {
    // Local rotating thinking phrases (self-contained, works in any context)
    const thinkingPhrases = [
      'Thinking', 'Ruminating', 'Puzzling over this', 'Considering options',
      'Weighing possibilities', 'Reflecting', 'Analyzing', 'Contemplating',
    ];
    const [phraseIndex, setPhraseIndex] = createSignal(0);

    createEffect(() => {
      const interval = setInterval(() => {
        setPhraseIndex(i => (i + 1) % thinkingPhrases.length);
      }, 1300);
      onCleanup(() => clearInterval(interval));
    });

    return (
      <div class="mc-thinking">
        <span class="mc-thinking-icon">🤖</span>
        <span class="mc-thinking-text">{thinkingPhrases[phraseIndex()]}</span>
        <span class="mc-thinking-cursor">▋</span>
      </div>
    );
  }

  /* ─── System message (compact, no avatar) ────────────────────── */
  if (isSystem) {
    return (
      <div class="mc-system-line">
        <span class="mc-system-icon">⚡</span>
        <MessageContent content={props.message.content} streaming={false} />
      </div>
    );
  }

  return (
    <div
      class="mc-message-item"
      style={{
        border: `1px solid ${cfg.border}`,
      }}
    >
      {/* Avatar */}
      <div class="mc-avatar">{cfg.emoji}</div>

      {/* Content */}
      <div class="mc-body">
        {/* Header */}
        <div class="mc-header">
          <span class="mc-role" style={{ color: cfg.nameColor }}>
            {props.message.role}
          </span>
          <span class="mc-time">{formatTime(props.message.timestamp)}</span>
        </div>

        {/* Reasoning (collapsible) */}
        <Show when={props.message.reasoning && props.message.reasoning.length > 0}>
          <ReasoningBlock text={props.message.reasoning!} />
        </Show>

        {/* Attached images */}
        <Show when={props.message.images && props.message.images.length > 0}>
          <div class="mc-images">
            <For each={props.message.images!}>
              {(imgUrl) => (
                <div class="mc-image-container">
                  <img src={imgUrl} alt="Attached image" class="mc-image" />
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Message body + cursor on last streaming only */}
        <MessageContent
          content={props.message.content}
          streaming={props.isLastStreaming ?? false}
        />

        {/* Tool calls (collapsible blocks) */}
        <Show when={props.message.toolCalls && props.message.toolCalls.length > 0}>
          <div class="mc-tools">
            <For each={props.message.toolCalls!}>
              {(tc) => <ToolCallBlock tc={tc} />}
            </For>
          </div>
        </Show>
      </div>

      {/* Copy button - more visible and reliable */}
      <button
        class="mc-copy"
        onClick={handleCopy}
        title="Copy message"
      >
        {copied() ? '✓' : '📋'}
      </button>

      <style>{`
        .mc-message-item {
          display: flex;
          gap: 10px;
          padding: 10px 12px;
          margin-bottom: 6px;
          border-radius: 8px;
          background: rgba(10,10,15,0.9);
          font-family: 'JetBrains Mono', monospace;
          position: relative;
        }

        .mc-avatar {
          flex-shrink: 0;
          font-size: 20px;
          line-height: 1.3;
        }

        .mc-body {
          flex: 1;
          min-width: 0;
        }

        .mc-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .mc-role {
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .mc-time {
          font-size: 11px;
          color: #555;
        }

        .mc-streaming-dots .dot {
          animation: blink 1.4s infinite both;
        }
        .mc-streaming-dots .dot:nth-child(2) { animation-delay: 0.2s; }
        .mc-streaming-dots .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink {
          0%, 80%, 100% { opacity: 0; }
          40% { opacity: 1; }
        }

        /* System line */
        .mc-system-line {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 4px 12px;
          font-size: 11px;
          color: rgba(0,243,255,0.45);
          font-family: 'JetBrains Mono', monospace;
          border-bottom: 1px solid rgba(0,243,255,0.06);
        }
        .mc-system-icon {
          flex-shrink: 0;
          opacity: 0.5;
        }
        .mc-system-line :global(.mc-root) {
          font-size: 11px;
        }

        /* Reasoning - Premium cyberpunk style */
        .mc-reasoning-block {
          margin: 6px 0 10px;
          border: 1px solid rgba(255, 200, 0, 0.25);
          border-radius: 8px;
          background: linear-gradient(145deg, rgba(255,200,0,0.04), rgba(20,20,30,0.6));
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .mc-reasoning-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 12px;
          background: none;
          border: none;
          color: #ffcc66;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.1s ease;
        }
        .mc-reasoning-toggle:hover {
          background: rgba(255,200,0,0.08);
        }
        .mc-reasoning-icon {
          font-size: 13px;
        }
        .mc-reasoning-label {
          color: #ffcc66;
        }
        .mc-reasoning-arrow {
          font-size: 10px;
          opacity: 0.7;
          margin-left: auto;
        }
        .mc-reasoning-count {
          opacity: 0.5;
          font-size: 10px;
        }
        .mc-reasoning-text {
          margin: 0;
          padding: 10px 12px;
          font-size: 11.5px;
          line-height: 1.55;
          color: #ddbb88;
          white-space: pre-wrap;
          word-break: break-word;
          border-top: 1px solid rgba(255,200,0,0.15);
          background: rgba(0,0,0,0.2);
        }

        /* Tool calls - Premium cyberpunk style */
        .mc-tools {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
        }
        .mc-tool-block {
          border-radius: 8px;
          background: linear-gradient(145deg, rgba(255,0,255,0.04), rgba(25,20,35,0.7));
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .mc-tool-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.1s ease;
        }
        .mc-tool-header:hover {
          background: rgba(255,0,255,0.08);
        }
        .mc-tool-icon {
          font-size: 13px;
        }
        .mc-tool-name {
          font-weight: 600;
          color: #ff66ff;
          font-size: 12.5px;
          font-family: 'JetBrains Mono', monospace;
        }
        .mc-tool-status {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgba(255,255,255,0.06);
        }
        .mc-tool-duration {
          margin-left: auto;
          font-size: 10px;
          color: rgba(255,100,255,0.6);
          font-family: monospace;
        }
        .mc-tool-arrow {
          opacity: 0.6;
          font-size: 10px;
        }
        .mc-tool-body {
          padding: 8px 12px;
          background: rgba(0,0,0,0.25);
          border-top: 1px solid rgba(255,0,255,0.15);
        }
        .mc-tool-args {
          margin: 0;
          font-size: 11px;
          color: #aaa;
        }
        .mc-tool-result {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,0,255,0.1);
        }
        .mc-tool-result-label {
          font-size: 10px;
          color: #ff66ff;
          margin-bottom: 4px;
          font-weight: 600;
        }
          color: #666;
          font-size: 10px;
          margin-left: 4px;
        }
        .mc-tool-arrow {
          margin-left: auto;
          font-size: 9px;
          color: #555;
        }
        .mc-tool-body {
          padding: 6px 10px;
          border-top: 1px solid rgba(255,0,255,0.1);
          font-size: 11px;
          color: rgba(170,255,204,0.5);
        }
        .mc-tool-body pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
          font-size: 11px;
        }
        .mc-tool-result {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid rgba(255,0,255,0.08);
        }
        .mc-tool-result strong {
          color: rgba(255,0,255,0.5);
          font-size: 10px;
          text-transform: uppercase;
        }

        /* Images */
        .mc-images {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }
        .mc-image-container {
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid rgba(0,243,255,0.2);
          max-width: 200px;
        }
        .mc-image {
          display: block;
          width: 100%;
          max-height: 200px;
          object-fit: cover;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .mc-image:hover {
          opacity: 0.85;
        }

        /* Copy button */
        .mc-copy {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255,255,255,0.25);
          color: #ccc;
          font-size: 13px;
          padding: 4px 7px;
          border-radius: 4px;
          cursor: pointer;
          opacity: 0.7;
          transition: all 0.15s ease;
          z-index: 10;
        }
        .mc-copy:hover {
          opacity: 1;
          background: rgba(0, 243, 255, 0.15);
          border-color: #00f3ff;
          color: #00f3ff;
        }
        .mc-copy:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
