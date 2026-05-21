import { Component, For, Show } from 'solid-js';

interface PagePanelProps {
  page: {
    title?: string;
    name: string;
    type?: string;
    category?: string;
    tags?: string;
    links?: string[];
    wordCount?: number;
    created?: string;
    updated?: string;
  } | null;
  onClose: () => void;
  onLinkClick: (link: string) => void;
}

const categoryColors: Record<string, string> = {
  entities: '#00f3ff',
  concepts: '#00ff9f',
  lessons: '#ff00cc',
  decisions: '#ffcc00',
  milestones: '#ff6600',
};

const categoryLabels: Record<string, string> = {
  entities: 'ENTITY',
  concepts: 'CONCEPT',
  lessons: 'LESSON',
  decisions: 'DECISION',
  milestones: 'MILESTONE',
};

const PagePanel: Component<PagePanelProps> = (props) => {
  const getCategoryColor = (cat: string) => categoryColors[cat] || '#ffffff';
  const getCategoryLabel = (cat: string) => categoryLabels[cat] || cat.toUpperCase();

  const parseTags = (tagsStr: string): string[] => {
    if (!tagsStr) return [];
    return tagsStr
      .slice(1, -1)
      .split(',')
      .map(t => t.trim())
      .filter(t => t);
  };

  return (
    <Show when={props.page}>
      <div class="absolute right-0 top-0 h-full w-96 bg-hermes-panel/95 border-l border-hermes-cyan/50 flex flex-col overflow-hidden"
        style={{ "box-shadow": "-4px 0 20px rgba(0, 243, 255, 0.3)" }}>
        
        <div class="p-4 border-b border-hermes-cyan/30 flex items-center justify-between">
          <span class="text-hermes-cyan text-sm font-bold">PAGE DETAILS</span>
          <button
            onClick={props.onClose}
            class="text-hermes-text-dim hover:text-hermes-magenta transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h2 class="text-2xl font-bold text-hermes-cyan mb-2"
              style={{ "text-shadow": "0 0 8px #00f3ff, 0 0 16px #00f3ff" }}>
              {props.page!.title}
            </h2>
            <span
              class="inline-block px-2 py-1 text-xs font-bold rounded"
              style={{
                background: `${getCategoryColor(props.page!.category)}20`,
                color: getCategoryColor(props.page!.category),
                border: `1px solid ${getCategoryColor(props.page!.category)}`,
                "text-shadow": `0 0 4px ${getCategoryColor(props.page!.category)}`,
              }}
            >
              {getCategoryLabel(props.page!.category)}
            </span>
          </div>

          <div class="p-3 bg-hermes-bg/50 rounded border border-hermes-cyan/20">
            <div class="text-hermes-text-dim text-xs uppercase mb-2">METADATA</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="text-hermes-text-dim">Type:</span>
                <span class="text-hermes-text ml-1">{props.page!.type}</span>
              </div>
              <div>
                <span class="text-hermes-text-dim">Words:</span>
                <span class="text-hermes-cyan ml-1">{props.page!.wordCount}</span>
              </div>
              <div>
                <span class="text-hermes-text-dim">Created:</span>
                <span class="text-hermes-text ml-1">{props.page!.created}</span>
              </div>
              <div>
                <span class="text-hermes-text-dim">Updated:</span>
                <span class="text-hermes-text ml-1">{props.page!.updated}</span>
              </div>
            </div>
          </div>

          <div>
            <div class="text-hermes-text-dim text-xs uppercase mb-2">TAGS</div>
            <div class="flex flex-wrap gap-2">
              <For each={parseTags(props.page!.tags)}>
                {(tag) => (
                  <span class="px-2 py-1 text-xs rounded bg-hermes-cyan/10 text-hermes-text-dim border border-hermes-cyan/20">
                    {tag}
                  </span>
                )}
              </For>
            </div>
          </div>

          <div>
            <div class="text-hermes-text-dim text-xs uppercase mb-2">
              CONNECTIONS ({props.page!.links.length})
            </div>
            <div class="flex flex-wrap gap-2">
              <For each={[...new Set((props.page!.links || []) as string[])]}>
                {(link: string) => (
                  <button
                    onClick={() => props.onLinkClick(link as string)}
                    class="px-2 py-1 text-sm rounded transition-all hover:scale-105"
                    style={{
                      background: "rgba(0, 243, 255, 0.1)",
                      color: "#00f3ff",
                      border: "1px solid rgba(0, 243, 255, 0.3)",
                      "box-shadow": "0 0 4px rgba(0, 243, 255, 0.3)",
                    }}
                  >
                    {link}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="p-3 border-t border-hermes-cyan/30 text-xs text-hermes-text-dim">
          <span class="text-hermes-cyan">ID:</span> {props.page!.name}
        </div>
      </div>
    </Show>
  );
};

export default PagePanel;