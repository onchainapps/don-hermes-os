import { createSignal, createResource, For, Show, createMemo } from 'solid-js';
import WikiGraph3D from './WikiGraph3D';
import { getAllCategories, getCategoryColor } from '../lib/graph-layout';

interface WikiPage {
  name: string;
  category: string;
  title: string;
  type: string;
  tags: string;
  created: string;
  updated: string;
  wordCount: number;
  links: string[];
}

interface WikiData {
  generated: string;
  stats: {
    totalPages: number;
    transcriptCount: number;
    transcriptSizeMB: number;
    totalWords: number;
    orphanCount: number;
    categories: Record<string, number>;
  };
  pages: WikiPage[];
  linkGraph: Record<string, string[]>;
  orphans: string[];
  recentActivity: string[];
}

async function fetchWikiData(): Promise<WikiData> {
  const res = await fetch('/wiki-data.json');
  if (!res.ok) throw new Error('Failed to load wiki data');
  return res.json();
}

export default function WikiPanel() {
  const [wikiData] = createResource(fetchWikiData);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedNode, setSelectedNode] = createSignal<WikiPage | null>(null);
  const [visibleCategories, setVisibleCategories] = createSignal(new Set(getAllCategories()));
  const [detailOpen, setDetailOpen] = createSignal(false);

  const toggleCategory = (cat: string) => {
    const next = new Set(visibleCategories());
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setVisibleCategories(next);
  };

  const handleNodeClick = (page: WikiPage) => {
    setSelectedNode(page);
    setDetailOpen(true);
  };

  const filteredPages = createMemo(() => {
    const data = wikiData();
    if (!data) return [];
    const q = searchQuery().toLowerCase();
    const cats = visibleCategories();
    return data.pages.filter(p => {
      if (!cats.has(p.category)) return false;
      if (q && !p.title.toLowerCase().includes(q) && !p.name.includes(q) && !p.tags.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  const inboundLinks = createMemo(() => {
    const data = wikiData();
    const node = selectedNode();
    if (!data || !node) return [];
    return Object.entries(data.linkGraph)
      .filter(([_, links]) => links.includes(node.name))
      .map(([source]) => source);
  });

  return (
    <div class="flex h-full overflow-hidden">
      {/* Left sidebar: search + filters + stats */}
      <div
        class="flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: '260px',
          background: '#08080c',
          'border-right': '1px solid rgba(0, 243, 255, 0.1)',
        }}
      >
        {/* Search */}
        <div class="p-3 flex-shrink-0">
          <div
            class="flex items-center gap-2 px-3 py-2 rounded"
            style={{
              background: 'rgba(0, 243, 255, 0.05)',
              border: '1px solid rgba(0, 243, 255, 0.15)',
            }}
          >
            <span class="text-xs opacity-50">🔍</span>
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="bg-transparent text-xs text-hermes-cyan outline-none flex-1 placeholder-hermes-cyan/30"
            />
            <Show when={searchQuery()}>
              <button
                class="text-[10px] opacity-40 hover:opacity-80 cursor-pointer"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            </Show>
          </div>
        </div>

        {/* Category filters */}
        <div class="px-3 pb-3 flex-shrink-0">
          <div class="text-[9px] tracking-widest uppercase opacity-30 mb-2" style={{ color: '#00f3ff' }}>
            Categories
          </div>
          <div class="flex flex-wrap gap-1.5">
            <For each={getAllCategories()}>
              {(cat) => {
                const active = () => visibleCategories().has(cat);
                const color = getCategoryColor(cat);
                const count = wikiData()?.stats.categories[cat] || 0;
                return (
                  <button
                    class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-all"
                    style={{
                      background: active() ? `${color}15` : 'transparent',
                      border: `1px solid ${active() ? color + '50' : 'rgba(255,255,255,0.08)'}`,
                      color: active() ? color : 'rgba(255,255,255,0.25)',
                      opacity: active() ? 1 : 0.5,
                    }}
                    onClick={() => toggleCategory(cat)}
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ background: active() ? color : 'rgba(255,255,255,0.15)' }}
                    />
                    {cat}
                    <span class="opacity-40">{count}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        {/* Divider */}
        <div class="mx-3" style={{ 'border-top': '1px solid rgba(0, 243, 255, 0.08)' }} />

        {/* Stats */}
        <Show when={wikiData()}>
          {(data) => (
            <div class="p-3 flex-shrink-0">
              <div class="text-[9px] tracking-widest uppercase opacity-30 mb-2" style={{ color: '#00f3ff' }}>
                Wiki Stats
              </div>
              <div class="grid grid-cols-2 gap-2">
                <StatCard label="Pages" value={data().stats.totalPages.toString()} color="#00f3ff" />
                <StatCard label="Words" value={data().stats.totalWords.toLocaleString()} color="#00ff9f" />
                <StatCard label="Transcripts" value={data().stats.transcriptCount.toString()} color="#ff00cc" />
                <StatCard label="Orphans" value={data().stats.orphanCount.toString()} color="#ff6600" />
              </div>
              <div class="mt-2 text-[9px] opacity-20 font-mono">
                Generated: {new Date(data().generated).toLocaleString()}
              </div>
            </div>
          )}
        </Show>

        {/* Filtered page list */}
        <div class="flex-1 overflow-y-auto px-3 pb-3">
          <div class="text-[9px] tracking-widest uppercase opacity-30 mb-2" style={{ color: '#00f3ff' }}>
            Nodes ({filteredPages().length})
          </div>
          <div class="flex flex-col gap-0.5">
            <For each={filteredPages()}>
              {(page) => {
                const color = getCategoryColor(page.category);
                return (
                  <button
                    class="flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer transition-colors text-[10px] font-mono"
                    classList={{
                      'bg-hermes-cyan/10': selectedNode()?.name === page.name,
                    }}
                    style={{
                      color: selectedNode()?.name === page.name ? color : 'rgba(255,255,255,0.45)',
                    }}
                    onClick={() => handleNodeClick(page)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = color;
                    }}
                    onMouseLeave={(e) => {
                      if (selectedNode()?.name !== page.name) {
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)';
                      }
                    }}
                  >
                    <span
                      class="w-1 h-1 rounded-full flex-shrink-0"
                      style={{ background: color }}
                    />
                    <span class="truncate">{page.title}</span>
                    <span class="ml-auto opacity-20 text-[9px]">{page.links.length}→</span>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </div>

      {/* 3D Graph */}
      <div class="flex-1 relative overflow-hidden">
        <Show when={wikiData()} fallback={
          <div class="flex items-center justify-center h-full">
            <div class="text-hermes-cyan/30 text-sm font-mono animate-pulse">Loading wiki graph...</div>
          </div>
        }>
          {(data) => (
            <WikiGraph3D
              wikiData={data()}
              onNodeClick={handleNodeClick}
              searchQuery={searchQuery()}
              visibleCategories={visibleCategories()}
            />
          )}
        </Show>

        {/* Detail drawer — slides in from right */}
        <Show when={detailOpen() && selectedNode()}>
          <div
            class="absolute top-0 right-0 bottom-0 w-[320px] flex flex-col overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(8,8,12,0.97) 0%, rgba(5,5,7,0.98) 100%)',
              'border-left': '1px solid rgba(0, 243, 255, 0.15)',
              'box-shadow': '-4px 0 20px rgba(0,0,0,0.5)',
              animation: 'slideIn 0.2s ease-out',
            }}
          >
            {/* Header */}
            <div
              class="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ 'border-bottom': '1px solid rgba(0, 243, 255, 0.1)' }}
            >
              <div class="flex items-center gap-2">
                <span
                  class="w-2 h-2 rounded-full"
                  style={{ background: getCategoryColor(selectedNode()!.category) }}
                />
                <span class="text-xs font-bold" style={{ color: getCategoryColor(selectedNode()!.category) }}>
                  {selectedNode()!.title}
                </span>
              </div>
              <button
                class="text-[10px] opacity-30 hover:opacity-80 cursor-pointer"
                onClick={() => setDetailOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div class="flex-1 overflow-y-auto p-4">
              {/* Meta */}
              <div class="grid grid-cols-2 gap-2 mb-4">
                <MetaField label="Category" value={selectedNode()!.category} />
                <MetaField label="Type" value={selectedNode()!.type} />
                <MetaField label="Words" value={selectedNode()!.wordCount.toString()} />
                <MetaField label="Links" value={`${selectedNode()!.links.length} out / ${inboundLinks().length} in`} />
                <MetaField label="Created" value={selectedNode()!.created || '—'} />
                <MetaField label="Updated" value={selectedNode()!.updated || '—'} />
              </div>

              {/* Tags */}
              <Show when={selectedNode()!.tags !== '[]'}>
                <div class="mb-4">
                  <div class="text-[9px] tracking-widest uppercase opacity-30 mb-1.5" style={{ color: '#00f3ff' }}>
                    Tags
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <For each={selectedNode()!.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean)}>
                      {(tag) => (
                        <span
                          class="px-1.5 py-0.5 rounded text-[9px] font-mono"
                          style={{
                            background: 'rgba(0, 243, 255, 0.08)',
                            border: '1px solid rgba(0, 243, 255, 0.15)',
                            color: 'rgba(0, 243, 255, 0.6)',
                          }}
                        >
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Outbound links */}
              <Show when={selectedNode()!.links.length > 0}>
                <div class="mb-4">
                  <div class="text-[9px] tracking-widest uppercase opacity-30 mb-1.5" style={{ color: '#00ff9f' }}>
                    Outbound Links ({selectedNode()!.links.length})
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <For each={[...new Set(selectedNode()!.links)]}>
                      {(link) => (
                        <button
                          class="text-[10px] font-mono text-left px-2 py-1 rounded cursor-pointer transition-colors hover:bg-hermes-cyan/10"
                          style={{ color: 'rgba(0, 255, 159, 0.6)' }}
                          onClick={() => {
                            const page = wikiData()?.pages.find(p => p.name === link);
                            if (page) handleNodeClick(page);
                          }}
                        >
                          → {link}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Inbound links */}
              <Show when={inboundLinks().length > 0}>
                <div class="mb-4">
                  <div class="text-[9px] tracking-widest uppercase opacity-30 mb-1.5" style={{ color: '#ff00cc' }}>
                    Inbound Links ({inboundLinks().length})
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <For each={inboundLinks()}>
                      {(link) => (
                        <button
                          class="text-[10px] font-mono text-left px-2 py-1 rounded cursor-pointer transition-colors hover:bg-hermes-cyan/10"
                          style={{ color: 'rgba(255, 0, 204, 0.6)' }}
                          onClick={() => {
                            const page = wikiData()?.pages.find(p => p.name === link);
                            if (page) handleNodeClick(page);
                          }}
                        >
                          ← {link}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function StatCard(props: { label: string; value: string; color: string }) {
  return (
    <div
      class="px-2 py-1.5 rounded"
      style={{
        background: `${props.color}08`,
        border: `1px solid ${props.color}15`,
      }}
    >
      <div class="text-[16px] font-bold font-mono" style={{ color: props.color }}>
        {props.value}
      </div>
      <div class="text-[8px] uppercase tracking-wider opacity-30">{props.label}</div>
    </div>
  );
}

function MetaField(props: { label: string; value: string }) {
  return (
    <div>
      <div class="text-[8px] uppercase tracking-wider opacity-25">{props.label}</div>
      <div class="text-[10px] font-mono opacity-70">{props.value}</div>
    </div>
  );
}
