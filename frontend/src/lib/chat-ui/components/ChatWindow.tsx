// ChatWindow — the main drop-in component
// Combines session sidebar, message list, activity bar, and composer
// Uses createChat hook internally for all chat logic (SolidJS)

import { createSignal, createMemo, Show, For, onMount, onCleanup, createEffect } from 'solid-js';
import type { Message, ActivityItem } from '../types';
import { createChat } from '../hooks/createChat';
import { createAutoScroll } from '../hooks/createAutoScroll';
import ChatComposer from './ChatComposer';
import MessageList from './MessageList';
import ScrollAnchor from './ScrollAnchor';
import SessionSidebar from './SessionSidebar';
import type { ChatClient } from '../../chatClient';

export interface ChatWindowProps {
  // --- Required ---
  sendFn?: (
    text: string,
    sessionId: string | null,
    messageHistory: Message[]
  ) => Promise<Response>;

  // --- API Configuration ---
  apiBase?: string;

  // --- Optional ---
  initialMessages?: Message[];
  sessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  onStreamingChange?: (streaming: boolean) => void;
  onActivity?: (item: ActivityItem) => void;
  clusters?: any[];
  searchResultCount?: number;
  searching?: boolean;
  searchPlaceholder?: string;
  footerText?: string;
  showSessionSidebar?: boolean;
  showSidebarDefault?: boolean;
  showFooter?: boolean;
  placeholder?: string;
  introMessage?: string;
  headerTitle?: string;
  diffComponent?: any;
  // Optional: inject a ChatClient for RPC/slash commands
  chatClient?: ChatClient;
}

export default function ChatWindow(props: ChatWindowProps) {
  const [showSidebar, setShowSidebar] = createSignal(props.showSidebarDefault ?? true);
  const [agentModel, setAgentModel] = createSignal('');
  const [agentStatus, setAgentStatus] = createSignal<'idle' | 'busy' | 'unknown'>('unknown');

  // Chat hook (headless)
  const chat = createChat({
    send: props.sendFn,
    sessionId: props.sessionId ?? null,
    onSessionChange: props.onSessionChange,
    initialMessages: props.initialMessages || [],
    onSendComplete: (msg, sid) => {
      props.onActivity?.({
        type: 'run_complete',
        label: `Message sent${sid ? ` to ${sid.slice(0, 8)}` : ''}`,
        timestamp: Date.now(),
        emoji: '✅',
      });
    },
  });

  // Auto-scroll for status bar
  let activityRef: HTMLDivElement | undefined;
  const scrollActivity = () => {
    if (activityRef) activityRef.scrollTop = activityRef.scrollHeight;
  };

  // Override addActivity to also scroll
  const origAddActivity = chat.addActivity;
  chat.addActivity = (item: ActivityItem) => {
    origAddActivity(item);
    setTimeout(scrollActivity, 50);
  };

  // Polling for session updates — deduplicate by message ID
  onMount(() => {
    const base = props.apiBase || '';
    const interval = setInterval(() => {
      if (chat.sessionId() && !chat.isStreaming()) {
        fetch(`${base}/api/sessions/${chat.sessionId()}/messages?limit=5`)
          .then(r => r.json())
          .then(data => {
            const existingIds = new Set(chat.messages().map(m => m.id));
            const newMsgs = (data.messages || [])
              .filter((m: any) => m.role === 'user' || m.role === 'assistant')
              .filter((m: any) => !existingIds.has(m.id));
            if (newMsgs.length > 0) {
              const appended = newMsgs.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content || '',
                status: 'complete' as const,
                timestamp: new Date(m.created_at || Date.now()),
              }));
              chat.loadSession([...chat.messages(), ...appended]);
            }
          })
          .catch(() => {});
      }
    }, 15000);
    onCleanup(() => clearInterval(interval));

    // Poll agent status
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${base}/api/gateway/status`);
        const data = await res.json();
        setAgentModel(data.model || '');
        setAgentStatus(data.busy ? 'busy' : 'idle');
      } catch {}
    };
    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 10000);
    onCleanup(() => clearInterval(statusInterval));
  });

  // Slash command handler
  const handleSlashCommand = async (cmd: string, args: string) => {
    const client = props.chatClient;
    const base = props.apiBase || '';

    switch (cmd) {
      case '/help':
        chat.addActivity({ type: 'run_start', label: 'Available commands:', detail: '/new /clear /status /model <m> /steer <mode> /bg <prompt> /retry', timestamp: Date.now(), emoji: '❓' });
        return;
      case '/new':
        chat.newSession();
        return;
      case '/clear':
        chat.clearMessages();
        return;
      case '/status':
        try {
          const res = await fetch(`${base}/api/gateway/status`);
          const data = await res.json();
          chat.addActivity({ type: 'run_complete', label: 'Status', detail: `${data.status} · ${data.model} · busy: ${data.busy}`, timestamp: Date.now(), emoji: '📊' });
        } catch {
          chat.addActivity({ type: 'run_error', label: 'Status fetch failed', timestamp: Date.now(), emoji: '❌' });
        }
        return;
      case '/model':
        if (client) {
          try {
            await client.rpc('config.set', { key: 'model', value: args });
            setAgentModel(args);
            chat.addActivity({ type: 'run_complete', label: 'Model changed', detail: args, timestamp: Date.now(), emoji: '🔄' });
          } catch (e: any) {
            chat.addActivity({ type: 'run_error', label: 'Model change failed', detail: e?.message, timestamp: Date.now(), emoji: '❌' });
          }
        } else {
          // Fallback: direct API call
          try {
            await fetch(`${base}/api/hermes/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'model', value: args }) });
            setAgentModel(args);
            chat.addActivity({ type: 'run_complete', label: 'Model changed', detail: args, timestamp: Date.now(), emoji: '🔄' });
          } catch (e: any) {
            chat.addActivity({ type: 'run_error', label: 'Model change failed', detail: e?.message, timestamp: Date.now(), emoji: '❌' });
          }
        }
        return;
      case '/steer':
        if (client) {
          try {
            await client.rpc('busy.set', { mode: args || 'status' });
            chat.addActivity({ type: 'run_complete', label: 'Busy mode', detail: args || 'status', timestamp: Date.now(), emoji: '🎯' });
          } catch (e: any) {
            chat.addActivity({ type: 'run_error', label: 'Steer failed', detail: e?.message, timestamp: Date.now(), emoji: '❌' });
          }
        }
        return;
      case '/bg':
        if (client) {
          try {
            await client.rpc('runs.create_background', { prompt: args });
            chat.addActivity({ type: 'run_complete', label: 'Background task', detail: args, timestamp: Date.now(), emoji: '📧' });
          } catch (e: any) {
            chat.addActivity({ type: 'run_error', label: 'Background task failed', detail: e?.message, timestamp: Date.now(), emoji: '❌' });
          }
        }
        return;
      case '/retry':
        const msgs = chat.messages();
        const lastUser = [...msgs].reverse().find(m => m.role === 'user');
        if (lastUser) chat.sendMessage(lastUser.content);
        return;
      default:
        chat.addActivity({ type: 'run_error', label: `Unknown command: ${cmd}`, timestamp: Date.now(), emoji: '❓' });
    }
  };

  const handleSend = (text: string, images?: string[]) => {
    chat.sendMessage(text, images);
  };

  const handleStop = () => {
    chat.stopStreaming();
  };

  const handleSessionSelect = (sid: string) => {
    const base = props.apiBase || '';
    fetch(`${base}/api/sessions/${sid}/messages?limit=50`)
      .then(r => r.json())
      .then(data => {
        const rawMsgs = (data.messages || [])
          .filter((m: any) => m.role === 'user' || m.role === 'assistant');
        const msgs: Message[] = rawMsgs.map((m: any) => ({
          id: m.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          role: m.role,
          content: m.content || '',
          status: 'complete' as const,
          timestamp: new Date(m.created_at || Date.now()),
        }));
        chat.loadSession(msgs);
        chat.newSession();
        // Re-set the loaded session
        setTimeout(() => {
          props.onSessionChange?.(sid);
        }, 0);
      })
      .catch(e => console.warn('Chat load error:', e));
  };

  return (
    <div class="flex h-full overflow-hidden" style={{ background: '#050507' }}>
      {/* Session sidebar */}
      <Show when={props.showSessionSidebar ?? true}>
        <SessionSidebar
          clusters={props.clusters}
          selectedSessionId={chat.sessionId()}
          onSessionSelect={handleSessionSelect}
          onNewChat={chat.newSession}
          searchResultCount={props.searchResultCount}
          searching={props.searching}
          searchPlaceholder={props.searchPlaceholder}
          footerText={props.footerText}
          apiBase={props.apiBase}
        />
      </Show>

      {/* Main chat area */}
      <div class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)', background: 'rgba(10,10,15,0.5)' }}>
          <div class="flex items-center gap-3">
            <Show when={props.showSessionSidebar ?? true}>
              <button
                class="text-[10px] cursor-pointer transition-opacity"
                style={{ color: 'rgba(0,243,255,0.4)' }}
                onClick={() => setShowSidebar(!showSidebar())}
              >
                {showSidebar() ? '◀' : '▶'}
              </button>
            </Show>
            <span class="text-sm font-bold tracking-widest" style={{ color: '#00f3ff', 'text-shadow': '0 0 6px rgba(0,243,255,0.4)' }}>
              {props.headerTitle || 'HERMES CHAT'}
            </span>
            <Show when={chat.sessionId()}>
              <span class="text-[9px] font-mono" style={{ color: 'rgba(0,243,255,0.25)' }}>
                {chat.sessionId()?.slice(0, 12)}…
              </span>
            </Show>
            {/* Reconnection status */}
            <Show when={chat.reconnectionStatus && chat.reconnectionStatus() !== 'idle'}>
              <span style={{
                'font-size': '10px',
                color: chat.reconnectionStatus() === 'reconnecting' ? '#ffaa00' :
                       chat.reconnectionStatus() === 'reconnected' ? '#00ff9f' : '#ff4444'
              }}>
                {chat.reconnectionStatus() === 'reconnecting' && '⟳ Reconnecting'}
                {chat.reconnectionStatus() === 'reconnected' && '✓ Reconnected'}
                {chat.reconnectionStatus() === 'failed' && '✕ Failed'}
              </span>
            </Show>
          </div>
          <div class="flex items-center gap-3">
            <button
              class="text-[10px] cursor-pointer transition-colors"
              style={{ color: 'rgba(0,255,159,0.5)' }}
              onClick={() => {
                const base = props.apiBase || '';
                fetch(`${base}/api/sessions/clustered?limit=200`)
                  .then(r => r.json())
                  .then(data => {
                    // Trigger re-render of sidebar
                    window.dispatchEvent(new CustomEvent('don-chat-refresh-sessions'));
                  })
                  .catch(() => {});
              }}
              title="Refresh sessions"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Activity / status bar */}
        <Show when={chat.statusText() || chat.activityLog().length > 0}>
          <div
            ref={activityRef}
            class="flex-shrink-0 overflow-y-auto px-3 py-1.5"
            style={{
              'max-height': '120px',
              background: 'rgba(0,0,0,0.3)',
              'border-bottom': '1px solid rgba(0,243,255,0.06)',
              'scrollbar-width': 'thin',
              'scrollbar-color': 'rgba(0,243,255,0.1) transparent',
            }}
          >
            <Show when={chat.statusText()}>
              <div class="text-[10px] font-mono py-0.5" style={{ color: 'rgba(170,255,204,0.5)' }}>
                <span class="animate-pulse">{chat.statusText()}</span>
              </div>
            </Show>
            <For each={chat.activityLog()}>{(item, i) => (
              <div class="flex items-center gap-2 py-0.5 text-[10px] font-mono" style={{ color: 'rgba(170,255,204,0.5)' }}>
                <span style={{ color: 'rgba(0,243,255,0.3)' }}>┊</span>
                <span>{item.emoji || '⚡'}</span>
                <span style={{ color: item.type === 'tool_error' ? '#ff006e' : 'rgba(170,255,204,0.6)' }}>
                  {item.label}
                </span>
                <Show when={item.detail}>
                  <span style={{ color: 'rgba(170,255,204,0.3)' }}>{item.detail}</span>
                </Show>
                <Show when={item.duration}>
                  <span style={{ color: 'rgba(0,255,159,0.4)' }}>{item.duration!.toFixed(1)}s</span>
                </Show>
              </div>
            )}</For>
          </div>
        </Show>

        {/* Message list */}
        <MessageList
          messages={chat.messages()}
          introMessage={props.introMessage ?? 'Hey Bakon. Connected to Hermes. What do you need?'}
        />

        {/* Composer */}
        <ChatComposer
          onSubmit={handleSend}
          onStop={handleStop}
          streaming={chat.isStreaming()}
          placeholder={props.placeholder ?? 'Ask Hermes anything… (type / for commands)'}
          onSlashCommand={handleSlashCommand}
        />

        {/* Footer */}
        <Show when={props.showFooter ?? true}>
          <div class="flex items-center justify-between px-4 py-1 flex-shrink-0 text-[9px]" style={{ color: 'rgba(170,255,204,0.2)', background: 'rgba(5,5,7,0.8)', 'border-top': '1px solid rgba(0,243,255,0.06)' }}>
            <span>Hermes Gateway · streaming</span>
            <span>{chat.sessionId() ? `session: ${chat.sessionId()?.slice(0, 8)}` : 'new session'}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}
