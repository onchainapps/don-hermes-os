import { apiUrl } from '../lib/api-base';
import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';

interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
}

interface SearchFile {
  file: string;
  matches: SearchResult[];
  expanded: boolean;
}

interface ProjectSearchProps {
  projectRoot: string;
  onOpenFile: (path: string, line: number) => void;
  onClose: () => void;
}

export default function ProjectSearch(props: ProjectSearchProps) {
  let inputRef: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal('');
  const [useRegex, setUseRegex] = createSignal(false);
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [results, setResults] = createSignal<SearchFile[]>([]);
  const [replaceText, setReplaceText] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [searched, setSearched] = createSignal(false);

  const doSearch = async () => {
    const q = query().trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const params = new URLSearchParams({
        query: q,
        regex: String(useRegex()),
        caseSensitive: String(caseSensitive()),
        path: props.projectRoot,
      });
      const res = await fetch(apiUrl(`/api/search?${params}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: SearchResult[] = data.results || [];

      // Group by file
      const fileMap = new Map<string, SearchResult[]>();
      for (const r of raw) {
        if (!fileMap.has(r.file)) fileMap.set(r.file, []);
        fileMap.get(r.file)!.push(r);
      }
      const files: SearchFile[] = [...fileMap.entries()].map(([file, matches]) => ({
        file,
        matches,
        expanded: true,
      }));
      setResults(files);
    } catch (e: any) {
      setError(e.message);
      setResults([]);
    }
    setLoading(false);
  };

  const toggleFile = (file: string) => {
    setResults(prev => prev.map(f => f.file === file ? { ...f, expanded: !f.expanded } : f));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    }
  };

  const handleReplaceAll = async () => {
    const q = query().trim();
    if (!q || !replaceText()) return;
    // For each file, replace all matches
    for (const file of results()) {
      try {
        const res = await fetch(apiUrl('/api/files?path=' + encodeURIComponent(file.file)));
        if (!res.ok) continue;
        const data = await res.json();
        let content = data.content || '';
        if (useRegex()) {
          const flags = caseSensitive() ? 'g' : 'gi';
          content = content.replace(new RegExp(q, flags), replaceText());
        } else {
          const flags = caseSensitive() ? 'g' : 'gi';
          content = content.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags), replaceText());
        }
        await fetch(apiUrl('/api/files'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: file.file, content }),
        });
      } catch {}
    }
    // Re-search after replace
    doSearch();
  };

  // Short relative path
  const relativePath = (fullPath: string) => {
    const root = props.projectRoot;
    if (fullPath.startsWith(root + '/')) return fullPath.slice(root.length + 1);
    return fullPath;
  };

  onMount(() => {
    inputRef?.focus();
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-hermes-cyan/20 flex-shrink-0">
        <span class="text-xs text-hermes-cyan font-bold tracking-wider" style="text-shadow: 0 0 4px #00f3ff;">
          SEARCH
        </span>
        <button
          class="text-[10px] text-hermes-text-dim hover:text-hermes-magenta transition-colors cursor-pointer"
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>

      {/* Search bar */}
      <div class="flex flex-col gap-1 px-3 py-2 border-b border-hermes-cyan/10 flex-shrink-0">
        <div class="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={query()}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across project..."
            class="flex-1 bg-transparent text-hermes-text text-xs outline-none placeholder:text-hermes-text-dim/50 py-1"
            style={{ 'font-family': 'JetBrains Mono, monospace' }}
          />
          <button
            class={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${useRegex() ? 'bg-hermes-cyan/20 text-hermes-cyan' : 'text-hermes-text-dim hover:text-hermes-cyan'}`}
            onClick={() => setUseRegex(!useRegex())}
            title="Use regex"
          >
            .*
          </button>
          <button
            class={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${caseSensitive() ? 'bg-hermes-cyan/20 text-hermes-cyan' : 'text-hermes-text-dim hover:text-hermes-cyan'}`}
            onClick={() => setCaseSensitive(!caseSensitive())}
            title="Match case"
          >
            Aa
          </button>
        </div>
        <div class="flex items-center gap-1">
          <input
            type="text"
            value={replaceText()}
            onInput={(e) => setReplaceText((e.target as HTMLInputElement).value)}
            placeholder="Replace..."
            class="flex-1 bg-transparent text-hermes-text text-xs outline-none placeholder:text-hermes-text-dim/50 py-1"
            style={{ 'font-family': 'JetBrains Mono, monospace' }}
          />
          <button
            class="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors text-hermes-magenta hover:bg-hermes-magenta/10 border border-hermes-magenta/30"
            onClick={handleReplaceAll}
            title="Replace all"
          >
            Replace All
          </button>
        </div>
      </div>

      {/* Results */}
      <div class="flex-1 overflow-y-auto py-1" style={{ 'scrollbar-width': 'thin', 'scrollbar-color': 'rgba(0,243,255,0.2) transparent' }}>
        <Show when={loading()}>
          <div class="px-3 py-2 text-xs text-hermes-text-dim text-center">Searching...</div>
        </Show>
        <Show when={error()}>
          <div class="px-3 py-2 text-xs text-hermes-magenta">{error()}</div>
        </Show>
        <Show when={searched() && !loading() && results().length === 0 && !error()}>
          <div class="px-3 py-4 text-xs text-hermes-text-dim text-center">No results found</div>
        </Show>
        <For each={results()}>
          {(file) => (
            <div>
              <button
                class="w-full text-left px-3 py-1 text-xs flex items-center gap-1.5 hover:bg-hermes-cyan/10 cursor-pointer transition-colors"
                onClick={() => toggleFile(file.file)}
              >
                <span class="text-[10px] w-3 text-center">{file.expanded ? '▼' : '►'}</span>
                <span class="text-hermes-cyan truncate">{relativePath(file.file)}</span>
                <span class="text-[9px] text-hermes-text-dim/50 ml-auto">{file.matches.length}</span>
              </button>
              <Show when={file.expanded}>
                <For each={file.matches}>
                  {(match) => (
                    <button
                      class="w-full text-left pl-8 pr-3 py-0.5 text-[11px] flex items-center gap-1 hover:bg-hermes-cyan/5 cursor-pointer transition-colors group"
                      onClick={() => props.onOpenFile(file.file, match.line)}
                    >
                      <span class="text-hermes-text-dim/50 w-6 text-right flex-shrink-0">{match.line}</span>
                      <span class="text-hermes-text-dim truncate group-hover:text-hermes-text">{match.text.trim()}</span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
