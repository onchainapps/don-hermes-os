import { createSignal, onMount, For, Show, createEffect } from 'solid-js';
import { hermesGet, hermesPut } from '../../lib/hermesApi';

interface ConfigData {
  [key: string]: any;
}

export default function ConfigEditor() {
  const [config, setConfig] = createSignal<ConfigData>({});
  const [loading, setLoading] = createSignal(true);
  const [status, setStatus] = createSignal<{type: 'success' | 'error' | 'pending'; message: string} | null>(null);
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set(['providers', 'agent']));

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const data = await hermesGet<ConfigData>('/config');
      setConfig(data);
      setStatus({ type: 'success', message: 'Config loaded' });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load config' });
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (key: string, value: any) => {
    try {
      setStatus({ type: 'pending', message: `Updating ${key}...` });
      await hermesPut('/config', { key, value });
      // Refresh config
      const updated = await hermesGet<ConfigData>('/config');
      setConfig(updated);
      setStatus({ type: 'success', message: `${key} updated` });
      setTimeout(() => setStatus(null), 1500);
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' });
    }
  };

  const toggleSection = (section: string) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) newSet.delete(section);
      else newSet.add(section);
      return newSet;
    });
  };

  const exportConfig = () => {
    const dataStr = JSON.stringify(config(), null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const exportFileDefaultName = `hermes-config-${new Date().toISOString().slice(0,10)}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const resetConfig = () => {
    if (confirm('Reset config view? This reloads from server.')) {
      fetchConfig();
    }
  };

  onMount(fetchConfig);

  const renderValue = (key: string, value: any, path: string = '') => {
    const fullPath = path ? `${path}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return (
          <div class="pl-4 border-l border-hermes-cyan/20 mt-2">
            <div class="text-[10px] text-hermes-text-dim mb-1">[{value.length} items]</div>
            <pre class="text-xs bg-black/50 p-2 rounded text-hermes-text-dim overflow-auto max-h-40">{JSON.stringify(value, null, 2)}</pre>
          </div>
        );
      }
      return (
        <div class="pl-4 border-l border-hermes-cyan/20 mt-2">
          <For each={Object.keys(value)}>
            {(subKey) => (
              <div class="mb-3">
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-hermes-cyan font-medium">{subKey}</span>
                  <span class="text-hermes-text-dim">:</span>
                </div>
                {renderValue(subKey, value[subKey], fullPath)}
              </div>
            )}
          </For>
        </div>
      );
    }
    // Primitive value - editable
    const isBool = typeof value === 'boolean';
    const isNum = typeof value === 'number';
    return (
      <div class="flex items-center gap-3 mt-1">
        <input
          type={isBool ? "checkbox" : isNum ? "number" : "text"}
          checked={isBool ? value : undefined}
          value={isBool ? undefined : String(value)}
          onChange={(e) => {
            let newVal: any = (e.target as HTMLInputElement).value;
            if (isBool) newVal = (e.target as HTMLInputElement).checked;
            if (isNum) newVal = parseFloat(newVal) || 0;
            updateConfig(fullPath, newVal);
          }}
          class="ssh-input text-xs px-3 py-1 bg-hermes-panel border border-hermes-cyan/40 rounded w-64 font-mono"
        />
        <span class="text-[10px] text-hermes-text-dim font-mono opacity-60">{typeof value}</span>
      </div>
    );
  };

  return (
    <div class="h-full flex flex-col">
      <div class="panel-header flex justify-between items-center border-b border-hermes-cyan/20 pb-3 mb-4">
        <div class="flex items-center gap-3">
          <span>⚙️</span>
          <span>HERMES CONFIG</span>
        </div>
        <div class="flex gap-2">
          <button
            onClick={exportConfig}
            class="px-4 py-1 text-xs border border-hermes-cyan/50 hover:border-hermes-cyan text-hermes-cyan rounded transition-colors"
          >
            EXPORT JSON
          </button>
          <button
            onClick={resetConfig}
            class="px-4 py-1 text-xs border border-hermes-magenta/50 hover:border-hermes-magenta text-hermes-magenta rounded transition-colors"
          >
            RESET
          </button>
        </div>
      </div>

      <Show when={status()}>
        <div class={`px-4 py-2 mb-4 rounded text-xs font-mono border ${
          status()!.type === 'success' ? 'border-hermes-green text-hermes-green bg-hermes-green/10' :
          status()!.type === 'error' ? 'border-hermes-magenta text-hermes-magenta bg-hermes-magenta/10' :
          'border-hermes-cyan text-hermes-cyan bg-hermes-cyan/10'
        }`}>
          {status()!.message}
        </div>
      </Show>

      <Show when={loading()} fallback={
        <div class="flex-1 overflow-auto space-y-6 pr-4">
          <For each={Object.keys(config())}>
            {(key) => {
              const value = config()[key];
              const isExpanded = expanded().has(key);
              const isObject = typeof value === 'object' && value !== null;
              return (
                <div class="panel no-resize">
                  <div 
                    class="panel-header flex items-center justify-between cursor-pointer hover:text-hermes-green transition-colors"
                    onClick={() => isObject && toggleSection(key)}
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-xl">{isObject ? (isExpanded ? '▼' : '►') : '•'}</span>
                      <span class="uppercase tracking-widest text-sm">{key}</span>
                      <span class="text-[10px] text-hermes-text-dim font-mono">({typeof value})</span>
                    </div>
                    {!isObject && <span class="text-xs opacity-40">editable</span>}
                  </div>
                  <Show when={!isObject || isExpanded}>
                    <div class="pt-4">
                      {renderValue(key, value)}
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      }>
        <div class="flex-1 flex items-center justify-center text-hermes-text-dim">Loading config from Hermes...</div>
      </Show>
    </div>
  );
}
