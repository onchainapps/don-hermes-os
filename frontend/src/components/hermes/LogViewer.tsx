import { createSignal, onMount, onCleanup, For, Show, createEffect } from 'solid-js';
import { hermesGet } from '../../lib/hermesApi';

const LOG_FILES = ['agent', 'gateway', 'error'] as const;
type LogFile = typeof LOG_FILES[number];

function useDebounce<T>(value: () => T, delay: number): () => T {
  const [debounced, setDebounced] = createSignal(value());
  let timer: ReturnType<typeof setTimeout>;
  createEffect(() => {
    value(); // track
    clearTimeout(timer);
    timer = setTimeout(() => setDebounced(() => value()), delay);
  });
  onCleanup(() => clearTimeout(timer));
  return debounced as () => T;
}

export default function LogViewer() {
  const [activeLog, setActiveLog] = createSignal<LogFile>('agent');
  const [logs, setLogs] = createSignal<string[]>([]);
  const [filter, setFilter] = createSignal('');
  const debouncedFilter = useDebounce(() => filter(), 200);
  const [autoRefresh, setAutoRefresh] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  let logContainer: HTMLDivElement | undefined;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await hermesGet<{lines: string[]; file: string}>(`/logs?file=${activeLog()}&lines=200`);
      setLogs(data.lines || []);
    } catch (err) {
      setLogs(['Error fetching logs: ' + (err instanceof Error ? err.message : String(err))]);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = () => {
    const f = debouncedFilter().toLowerCase();
    if (!f) return logs();
    return logs().filter(line => line.toLowerCase().includes(f));
  };

  const getLogColor = (line: string) => {
    if (line.includes('ERROR') || line.includes('ERROR:')) return 'text-hermes-magenta';
    if (line.includes('WARN') || line.includes('WARNING')) return 'text-yellow-400';
    if (line.includes('INFO')) return 'text-hermes-green';
    return 'text-hermes-text-dim';
  };

  onMount(() => {
    fetchLogs();
  });

  // Manage refresh interval with proper cleanup
  createEffect(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    if (autoRefresh()) {
      refreshInterval = setInterval(fetchLogs, 5000);
    }
  });

  onCleanup(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh());
  };

  const clearView = () => {
    setLogs([]);
    setFilter('');
  };

  const scrollToBottom = () => {
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  };

  // Auto scroll effect
  createEffect(() => {
    if (logs().length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  });

  return (
    <div class="h-full flex flex-col">
      <div class="panel-header flex items-center justify-between border-b border-hermes-cyan/20 pb-4 mb-4">
        <div class="flex items-center gap-4">
          <span>📋 LOG VIEWER</span>
          <div class="flex border border-hermes-cyan/30 rounded overflow-hidden text-xs">
            <For each={LOG_FILES}>
              {(file) => (
                <button
                  class={`px-4 py-1 transition-colors ${activeLog() === file 
                    ? 'bg-hermes-cyan text-black' 
                    : 'hover:bg-hermes-cyan/10 text-hermes-text-dim'}`}
                  onClick={() => {
                    setActiveLog(file);
                    fetchLogs();
                  }}
                >
                  {file.toUpperCase()}
                </button>
              )}
            </For>
          </div>
        </div>
        
        <div class="flex items-center gap-3 text-xs">
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh()}
              onChange={toggleAutoRefresh}
              class="accent-hermes-green"
            />
            <span class="text-hermes-text-dim">AUTO (5s)</span>
          </div>
          <input
            type="text"
            placeholder="FILTER LOGS..."
            value={filter()}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            class="ssh-input w-52 text-xs"
          />
          <button onClick={fetchLogs} class="px-4 py-1 border border-hermes-cyan/50 hover:bg-hermes-cyan/10 rounded">REFRESH</button>
          <button onClick={clearView} class="px-4 py-1 border border-hermes-magenta/50 hover:bg-hermes-magenta/10 text-hermes-magenta rounded">CLEAR</button>
        </div>
      </div>

      <div 
        ref={logContainer}
        class="panel no-resize flex-1 font-mono text-xs overflow-auto p-4 bg-black/70 leading-relaxed whitespace-pre-wrap break-words"
        style="font-size: 11px; line-height: 1.4;"
      >
        <Show when={loading() && logs().length === 0}>
          <div class="text-hermes-text-dim animate-pulse">Loading logs from Hermes gateway...</div>
        </Show>
        
        <For each={filteredLogs()}>
          {(line, index) => (
            <div class={`log-entry py-0.5 ${getLogColor(line)}`}>
              <span class="text-hermes-text-dim/40 select-none mr-2">[{String(index()+1).padStart(4, '0')}]</span>
              {line}
            </div>
          )}
        </For>
        
        <Show when={filteredLogs().length === 0 && logs().length > 0}>
          <div class="text-center py-12 text-hermes-text-dim">No logs match the current filter.</div>
        </Show>
      </div>

      <div class="text-[10px] mt-3 text-center text-hermes-text-dim font-mono">
        Tailing {activeLog()} logs • {logs().length} lines • Filter: {filter() || 'none'}
      </div>
    </div>
  );
}
