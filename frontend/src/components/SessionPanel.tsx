import { createSignal, createEffect, on, onMount, onCleanup, For, Show } from 'solid-js';

interface Session {
  id: string;
  source: string;
  model: string;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  title: string | null;
  active: boolean;
}

interface Message {
  role: string;
  content: string;
  tool_name: string | null;
  created_at: number;
}

export default function SessionPanel() {
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [total, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [filter, setFilter] = createSignal<'all' | 'active' | 'done'>('all');
  const [sourceFilter, setSourceFilter] = createSignal<string>('');
  const [selectedSession, setSelectedSession] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = createSignal(false);

  const fetchSessions = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    const f = filter();
    if (f === 'active') params.set('active', 'true');
    if (f === 'done') params.set('active', 'false');
    if (sourceFilter()) params.set('source', sourceFilter());

    fetch(`/api/sessions?${params}`)
      .then(r => r.json())
      .then(data => {
        setSessions(data.sessions || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchMessages = (sessionId: string) => {
    setSelectedSession(sessionId);
    setLoadingMessages(true);
    fetch(`/api/sessions/${sessionId}/messages?limit=50`)
      .then(r => r.json())
      .then(data => {
        setMessages(data.messages || []);
        setLoadingMessages(false);
      })
      .catch(() => setLoadingMessages(false));
  };

  onMount(() => {
    const i = setInterval(fetchSessions, 10000);
    onCleanup(() => clearInterval(i));
  });

  createEffect(on(
    () => [filter(), sourceFilter()],
    () => fetchSessions(),
    { defer: true }
  ));

  const sourceColor = (src: string) => {
    switch (src) {
      case 'api_server': return '#00f3ff';
      case 'telegram': return '#00ff9f';
      case 'cron': return '#ffd700';
      case 'cli': return '#ff00cc';
      default: return '#aaffcc';
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div class="flex h-full" style={{ background: '#050507' }}>
      {/* Session list */}
      <div class="flex flex-col w-80 flex-shrink-0 border-r border-hermes-cyan/10">
        {/* Filters */}
        <div class="p-3 flex gap-2 flex-wrap" style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)' }}>
          <For each={['all', 'active', 'done'] as const}>
            {(f) => (
              <button
                class="px-2 py-1 text-[10px] rounded cursor-pointer transition-all"
                style={{
                  background: filter() === f ? 'rgba(0,243,255,0.15)' : 'transparent',
                  border: `1px solid ${filter() === f ? 'rgba(0,243,255,0.4)' : 'rgba(0,243,255,0.1)'}`,
                  color: filter() === f ? '#00f3ff' : '#aaffcc',
                }}
                onClick={() => setFilter(f)}
              >
                {f.toUpperCase()}
              </button>
            )}
          </For>
          <For each={['', 'api_server', 'telegram', 'cron', 'cli'] as const}>
            {(src) => (
              <button
                class="px-2 py-1 text-[10px] rounded cursor-pointer transition-all"
                style={{
                  background: sourceFilter() === src ? 'rgba(0,255,159,0.15)' : 'transparent',
                  border: `1px solid ${sourceFilter() === src ? 'rgba(0,255,159,0.4)' : 'rgba(0,243,255,0.1)'}`,
                  color: sourceFilter() === src ? '#00ff9f' : '#aaffcc',
                }}
                onClick={() => setSourceFilter(src)}
              >
                {src || 'ALL'}
              </button>
            )}
          </For>
        </div>

        {/* Session count */}
        <div class="px-3 py-1.5 text-[10px] opacity-40 flex justify-between">
          <span>{sessions().length} sessions</span>
          <span>{total()} total</span>
        </div>

        {/* Session list */}
        <div class="flex-1 overflow-y-auto" style={{ 'scrollbar-width': 'thin', 'scrollbar-color': 'rgba(0,243,255,0.2) transparent' }}>
          <Show when={!loading()} fallback={
            <div class="p-4 text-center text-xs opacity-30">Loading...</div>
          }>
            <For each={sessions()}>
              {(s) => (
                <button
                  class="w-full text-left px-3 py-2.5 border-b cursor-pointer transition-all hover:bg-white/[0.02]"
                  style={{
                    'border-color': 'rgba(0,243,255,0.05)',
                    background: selectedSession() === s.id ? 'rgba(0,243,255,0.06)' : 'transparent',
                  }}
                  onClick={() => fetchMessages(s.id)}
                >
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <div
                        class="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: s.active ? '#00ff9f' : '#555',
                          'box-shadow': s.active ? '0 0 4px #00ff9f' : 'none',
                        }}
                      />
                      <span
                        class="text-[9px] font-bold tracking-wider px-1 rounded"
                        style={{
                          color: sourceColor(s.source),
                          background: `${sourceColor(s.source)}10`,
                        }}
                      >
                        {s.source}
                      </span>
                    </div>
                    <span class="text-[9px] opacity-30">{s.message_count}m</span>
                  </div>
                  <div class="text-xs truncate" style={{ color: '#e0ffe8' }}>
                    {s.title || s.id.slice(0, 16)}
                  </div>
                  <div class="text-[9px] opacity-30 mt-0.5 flex justify-between">
                    <span>{s.model?.split('/').pop()}</span>
                    <span>{s.tool_call_count} tools</span>
                  </div>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Message viewer */}
      <div class="flex-1 flex flex-col overflow-hidden">
        <Show when={selectedSession()} fallback={
          <div class="flex-1 flex items-center justify-center text-xs opacity-20">
            Select a session to view messages
          </div>
        }>
          <div
            class="px-4 py-2 text-[10px] font-bold tracking-wider flex-shrink-0"
            style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)', color: '#00f3ff' }}
          >
            SESSION: {selectedSession()?.slice(0, 16)}...
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-3" style={{ 'scrollbar-width': 'thin', 'scrollbar-color': 'rgba(0,243,255,0.2) transparent' }}>
            <Show when={!loadingMessages()} fallback={
              <div class="text-center text-xs opacity-30">Loading messages...</div>
            }>
              <For each={messages()}>
                {(msg) => (
                  <div
                    class="px-3 py-2 rounded text-xs leading-relaxed"
                    style={{
                      background: msg.role === 'user'
                        ? 'rgba(0, 243, 255, 0.04)'
                        : msg.role === 'assistant'
                        ? 'rgba(0, 255, 159, 0.03)'
                        : msg.role === 'tool'
                        ? 'rgba(255, 0, 204, 0.03)'
                        : 'rgba(170, 255, 204, 0.02)',
                      border: `1px solid ${
                        msg.role === 'user' ? 'rgba(0,243,255,0.15)'
                        : msg.role === 'assistant' ? 'rgba(0,255,159,0.1)'
                        : msg.role === 'tool' ? 'rgba(255,0,204,0.1)'
                        : 'rgba(0,243,255,0.05)'
                      }`,
                    }}
                  >
                    <div
                      class="text-[9px] font-bold tracking-wider mb-1"
                      style={{
                        color: msg.role === 'user' ? '#00f3ff'
                          : msg.role === 'assistant' ? '#00ff9f'
                          : msg.role === 'tool' ? '#ff00cc'
                          : '#ffd700',
                      }}
                    >
                      {msg.role === 'tool' ? `TOOL: ${msg.tool_name || '?'}` : msg.role.toUpperCase()}
                      <span class="ml-2 opacity-30">{formatTime(msg.created_at)}</span>
                    </div>
                    <div class="whitespace-pre-wrap break-words opacity-80">{msg.content?.slice(0, 500)}{msg.content?.length > 500 ? '...' : ''}</div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
