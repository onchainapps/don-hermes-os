// SessionSidebar — sidebar with session list, clustering, FTS search
// Extracted from the original ChatPanel (index.tsx)

import { createSignal, createEffect, For, Show } from 'solid-js';
import { formatRelativeTime } from '../utils';

export interface SessionSidebarProps {
  sessions?: Array<{ id: string; title: string | null; active: boolean; started_at: string | null }>;
  clusters?: Array<{
    root: { id: string; title: string | null; active: boolean; source: string; started_at: string | null; message_count: number; tool_call_count: number; end_reason: string | null };
    children: Array<{ id: string; title: string | null; active: boolean; source: string; started_at: string | null; message_count: number; end_reason: string | null }>;
  }>;
  selectedSessionId?: string | null;
  onSessionSelect?: (sessionId: string) => void;
  onNewChat?: () => void;
  searchResultCount?: number;
  searching?: boolean;
  searchPlaceholder?: string;
  footerText?: string;
  apiBase?: string;
}

export default function SessionSidebar(props: SessionSidebarProps) {
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [expandedClusters, setExpandedClusters] = createSignal<Set<string>>(new Set());
  const [searchResults, setSearchResults] = createSignal<any[]>([]);
  const [debouncedQuery, setDebouncedQuery] = createSignal('');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const isActive = (id: string) => props.selectedSessionId === id;

  createEffect(() => {
    const q = searchQuery();
    clearTimeout(searchTimer);
    if (!q || q.trim().length < 2) {
      setDebouncedQuery('');
      setSearchResults([]);
      return;
    }
    searchTimer = setTimeout(() => setDebouncedQuery(q.trim()), 300);
  });

  // Debounced FTS search
  createEffect(() => {
    const q = debouncedQuery();
    if (!q) return;
    const base = props.apiBase || '';
    fetch(`${base}/api/sessions/search?q=${encodeURIComponent(q)}&limit=30`)
      .then(r => r.json())
      .then(data => setSearchResults(data.results || []))
      .catch(() => setSearchResults([]));
  });

  const toggleCluster = (rootId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  return (
    <div
      class="flex flex-col flex-shrink-0 border-r"
      style={{ width: '230px', 'border-color': 'rgba(0,243,255,0.12)', background: 'rgba(10,10,15,0.8)' }}
    >
      {/* Header */}
      <div class="p-3 flex items-center justify-between flex-shrink-0" style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)' }}>
        <span class="text-[10px] font-bold tracking-widest" style={{ color: '#00f3ff', 'text-shadow': '0 0 4px rgba(0,243,255,0.3)' }}>
          SESSIONS
        </span>
        <button
          class="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-all"
          style={{ background: 'rgba(0,255,159,0.08)', border: '1px solid rgba(0,255,159,0.2)', color: '#00ff9f' }}
          onClick={props.onNewChat}
        >
          + NEW
        </button>
      </div>

      {/* Search bar */}
      <div class="px-2 py-1.5 flex-shrink-0" style={{ 'border-bottom': '1px solid rgba(0,243,255,0.08)' }}>
        <button
          class="flex items-center gap-1.5 px-2 py-1 rounded w-full cursor-pointer transition-all"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,243,255,0.15)', color: 'rgba(0,243,255,0.5)' }}
          onClick={() => setShowSearch(!showSearch())}
        >
          <span class="text-[10px] flex-shrink-0">🔍</span>
          <span class="text-[10px] truncate flex-1 text-left">{showSearch() ? 'Close search' : (props.searchPlaceholder ?? 'Search messages (FTS)…')}</span>
        </button>
        <Show when={showSearch()}>
          <div class="mt-1 flex items-center gap-1.5 px-2">
            <input
              type="text"
              placeholder="Type to search…"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="flex-1 min-w-0 bg-transparent outline-none text-[10px]"
              style={{ color: '#e0ffe8', 'font-family': '"JetBrains Mono", monospace' }}
            />
            <Show when={searchQuery()}>
              <button
                class="text-[10px] cursor-pointer flex-shrink-0"
                style={{ color: 'rgba(255,0,110,0.5)' }}
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            </Show>
          </div>
        </Show>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto" style={{ 'scrollbar-width': 'thin', 'scrollbar-color': 'rgba(0,243,255,0.15) transparent' }}>
        {/* New chat indicator */}
        <Show when={!props.selectedSessionId}>
          <div class="px-3 py-2.5 border-b" style={{ 'border-color': 'rgba(0,243,255,0.05)', background: 'rgba(0,255,159,0.04)' }}>
            <div class="flex items-center gap-1.5">
              <div class="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff9f', 'box-shadow': '0 0 4px #00ff9f' }} />
              <span class="text-[10px]" style={{ color: '#00ff9f' }}>New conversation</span>
            </div>
          </div>
        </Show>

        {/* Search results */}
        <Show when={searchQuery().trim().length >= 2}>
          <div class="px-3 py-1.5 text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,243,255,0.35)', 'border-top': '1px solid rgba(0,243,255,0.06)' }}>
            {props.searching ? 'SEARCHING…' : `${props.searchResultCount ?? searchResults().length} RESULTS`}
          </div>
          <For each={searchResults()}>{(r) => (
            <button
              class="w-full text-left px-3 py-2 border-b cursor-pointer transition-all"
              style={{
                'border-color': 'rgba(0,243,255,0.04)',
                background: isActive(r.id) ? 'rgba(0,243,255,0.08)' : 'transparent',
                'border-left': isActive(r.id) ? '2px solid #00f3ff' : '2px solid transparent',
              }}
              onClick={() => props.onSessionSelect?.(r.id)}
            >
              <div class="flex items-center gap-1.5 mb-0.5">
                <span class="text-[10px] truncate flex-1" style={{ color: isActive(r.id) ? '#00f3ff' : '#aaffcc' }}>
                  {r.title || r.id.slice(0, 14)}
                </span>
                <span class="text-[8px] px-1 py-0.5 rounded flex-shrink-0" style={{
                  background: r.source === 'telegram' ? 'rgba(0,136,255,0.12)' : r.source === 'cron' ? 'rgba(255,170,0,0.12)' : 'rgba(0,243,255,0.08)',
                  color: r.source === 'telegram' ? '#58a6ff' : r.source === 'cron' ? '#ffaa00' : 'rgba(0,243,255,0.5)',
                  border: `1px solid ${r.source === 'telegram' ? 'rgba(0,136,255,0.25)' : r.source === 'cron' ? 'rgba(255,170,0,0.25)' : 'rgba(0,243,255,0.15)'}`,
                }}>{r.source}</span>
              </div>
              <div class="flex gap-2 items-center text-[9px]" style={{ 'padding-left': '10px', color: 'rgba(170,255,204,0.3)' }}>
                <span>{r.message_count} msgs</span>
                <span>{formatRelativeTime(r.started_at)}</span>
              </div>
            </button>
          )}</For>
          <Show when={!props.searching && searchResults().length === 0}>
            <div class="px-3 py-6 text-center text-[10px]" style={{ color: 'rgba(170,255,204,0.2)' }}>
              No messages match "{searchQuery()}"
            </div>
          </Show>
        </Show>

        {/* Clustered sessions (no search) */}
        <Show when={searchQuery().trim().length < 2}>
          <For each={props.clusters || []}>
            {(item) => {
              const root = item.root;
              const children = item.children;
              const isExpanded = () => expandedClusters().has(root.id) || (isActive(root.id) && children.length > 0);
              const hasChildren = children.length > 0;

              return (
                <div>
                  {/* Root session */}
                  <div class="flex">
                    <button
                      class="flex-1 text-left px-3 py-2 border-b cursor-pointer transition-all"
                      style={{
                        'border-color': 'rgba(0,243,255,0.04)',
                        background: isActive(root.id) ? 'rgba(0,243,255,0.08)' : 'transparent',
                        'border-left': isActive(root.id) ? '2px solid #00f3ff' : '2px solid transparent',
                      }}
                      onClick={() => props.onSessionSelect?.(root.id)}
                    >
                      <div class="flex items-center gap-1.5 mb-0.5">
                        <div class="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: root.active ? '#00ff9f' : '#444', 'box-shadow': root.active ? '0 0 4px #00ff9f' : 'none' }} />
                        <span class="text-[10px] truncate flex-1" style={{ color: isActive(root.id) ? '#00f3ff' : '#aaffcc' }}>
                          {root.title || root.id.slice(0, 14)}
                        </span>
                        <Show when={hasChildren}>
                          <button
                            class="text-[9px] cursor-pointer flex-shrink-0 px-1 rounded"
                            style={{ color: 'rgba(0,243,255,0.5)', background: 'rgba(0,243,255,0.06)' }}
                            onClick={(e) => { e.stopPropagation(); toggleCluster(root.id); }}
                          >
                            {isExpanded() ? '▾' : '▸'} {hasChildren ? children.length : 0}
                          </button>
                        </Show>
                        <span class="text-[8px] px-1 py-0.5 rounded flex-shrink-0" style={{
                          background: root.source === 'telegram' ? 'rgba(0,136,255,0.12)' : root.source === 'cron' ? 'rgba(255,170,0,0.12)' : 'rgba(0,243,255,0.08)',
                          color: root.source === 'telegram' ? '#58a6ff' : root.source === 'cron' ? '#ffaa00' : 'rgba(0,243,255,0.5)',
                          border: `1px solid ${root.source === 'telegram' ? 'rgba(0,136,255,0.25)' : root.source === 'cron' ? 'rgba(255,170,0,0.25)' : 'rgba(0,243,255,0.15)'}`,
                        }}>{root.source}</span>
                      </div>
                      <div class="flex gap-2 items-center text-[9px]" style={{ 'padding-left': '10px', color: 'rgba(170,255,204,0.25)' }}>
                        <span>{root.message_count} msgs</span>
                        <span>{root.tool_call_count} tools</span>
                        <span>{formatRelativeTime(root.started_at)}</span>
                      </div>
                    </button>
                  </div>

                  {/* Child sessions */}
                  <Show when={isExpanded() && hasChildren}>
                    <For each={children}>
                      {(child) => {
                        const isChildActive = () => isActive(child.id);
                        return (
                          <button
                            class="w-full text-left px-3 py-1.5 border-b cursor-pointer transition-all"
                            style={{
                              'border-color': 'rgba(0,243,255,0.03)',
                              background: isChildActive() ? 'rgba(0,243,255,0.06)' : 'rgba(0,0,0,0.15)',
                              'border-left': isChildActive() ? '2px solid #00f3ff' : '2px solid rgba(0,243,255,0.1)',
                              'padding-left': '22px',
                            }}
                            onClick={() => props.onSessionSelect?.(child.id)}
                          >
                            <div class="flex items-center gap-1.5">
                              <span class="text-[8px]" style={{ color: 'rgba(0,243,255,0.2)' }}>↳</span>
                              <div class="w-1 h-1 rounded-full flex-shrink-0" style={{ background: child.active ? '#00ff9f' : '#333' }} />
                              <span class="text-[9px] truncate flex-1" style={{ color: isChildActive() ? '#00f3ff' : 'rgba(170,255,204,0.3)' }}>
                                {child.title || child.id.slice(0, 14)}
                              </span>
                            </div>
                            <div class="flex gap-2 items-center text-[8px]" style={{ 'padding-left': '22px', color: 'rgba(170,255,204,0.18)' }}>
                              <span>{child.message_count} msgs</span>
                              <span>{child.end_reason || 'active'}</span>
                            </div>
                          </button>
                        );
                      }}
                    </For>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Footer */}
      <div class="p-2 text-[9px] text-center flex-shrink-0" style={{ color: 'rgba(170,255,204,0.15)', 'border-top': '1px solid rgba(0,243,255,0.05)' }}>
        {props.footerText || 'state.db'}
      </div>
    </div>
  );
}
