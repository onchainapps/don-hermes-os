import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { hermesGet, hermesPut, hermesDelete, hermesPost } from '../../lib/hermesApi';

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

interface EnvVar {
  key: string;
  value: string;
  category?: string;
  redacted?: boolean;
}

export default function ApiKeyManager() {
  const [envVars, setEnvVars] = createSignal<EnvVar[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [status, setStatus] = createSignal<string>('');
  const [revealed, setRevealed] = createSignal<Set<string>>(new Set());
  const [showAdd, setShowAdd] = createSignal(false);
  const [newKey, setNewKey] = createSignal('');
  const [newValue, setNewValue] = createSignal('');
  const [filter, setFilter] = createSignal('');
  const debouncedFilter = useDebounce(() => filter(), 200);

  const fetchEnv = async () => {
    try {
      setLoading(true);
      const data = await hermesGet<any>('/env');
      setEnvVars(data.vars || data.env || data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchEnv);

  const revealValue = async (key: string) => {
    try {
      const res = await hermesPost<{value: string}>('/env/reveal', { key });
      // For demo, update local state (in real, would update list)
      setRevealed(prev => new Set([...prev, key]));
      setStatus(`Revealed ${key}`);
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setStatus('Reveal failed - may require auth');
    }
  };

  const updateEnv = async (key: string, value: string) => {
    try {
      await hermesPut('/env', { key, value });
      setStatus(`Updated ${key}`);
      fetchEnv();
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setStatus('Update failed');
    }
  };

  const deleteEnv = async (key: string) => {
    if (!confirm(`Delete ${key}?`)) return;
    try {
      await hermesDelete(`/env?key=${encodeURIComponent(key)}`);
      setStatus(`Deleted ${key}`);
      fetchEnv();
    } catch (err) {
      setStatus('Delete failed');
    }
  };

  const addEnv = async () => {
    if (!newKey() || !newValue()) return;
    try {
      await hermesPut('/env', { key: newKey(), value: newValue() });
      setStatus(`Added ${newKey()}`);
      setNewKey('');
      setNewValue('');
      setShowAdd(false);
      fetchEnv();
    } catch (err) {
      setStatus('Add failed');
    }
  };

  const filteredVars = () => envVars().filter(v => 
    v.key.toLowerCase().includes(debouncedFilter().toLowerCase())
  );

  const getCategoryColor = (cat?: string) => {
    if (!cat) return 'text-hermes-cyan';
    return cat.includes('provider') ? 'text-hermes-green' : 'text-hermes-magenta';
  };

  return (
    <div class="h-full flex flex-col">
      <div class="panel-header flex justify-between items-center mb-4">
        <div>🔑 API KEY MANAGER</div>
        <div class="flex items-center gap-3">
          <input
            type="text"
            placeholder="FILTER KEYS..."
            value={filter()}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            class="ssh-input text-xs px-3 py-1 w-48"
          />
          <button
            onClick={() => setShowAdd(!showAdd())}
            class="px-4 py-1 text-xs bg-hermes-green/10 border border-hermes-green text-hermes-green rounded hover:bg-hermes-green/20"
          >
            + ADD KEY
          </button>
          <button
            onClick={fetchEnv}
            class="px-4 py-1 text-xs border border-hermes-cyan/50 text-hermes-cyan rounded"
          >
            REFRESH
          </button>
        </div>
      </div>

      <Show when={status()}>
        <div class="mb-4 px-4 py-2 text-xs border border-hermes-green/30 bg-hermes-green/5 text-hermes-green rounded">
          {status()}
        </div>
      </Show>

      <Show when={showAdd()}>
        <div class="panel mb-6 p-4">
          <div class="text-xs uppercase tracking-wider mb-3 text-hermes-cyan">ADD NEW ENV VAR</div>
          <div class="flex gap-3">
            <input
              placeholder="KEY NAME (e.g. OPENAI_API_KEY)"
              value={newKey()}
              onInput={(e) => setNewKey((e.target as HTMLInputElement).value)}
              class="ssh-input flex-1"
            />
            <input
              placeholder="VALUE"
              value={newValue()}
              onInput={(e) => setNewValue((e.target as HTMLInputElement).value)}
              class="ssh-input flex-1"
            />
            <button onClick={addEnv} class="px-6 py-2 bg-hermes-green text-black text-xs font-bold rounded">ADD</button>
            <button onClick={() => {setShowAdd(false); setNewKey(''); setNewValue('');}} class="px-4 py-2 text-xs border border-hermes-text-dim">CANCEL</button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-auto">
        <div class="panel no-resize">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-hermes-cyan/20 text-left text-hermes-text-dim">
                <th class="py-3 px-4 font-mono uppercase">KEY</th>
                <th class="py-3 px-4 font-mono uppercase">VALUE</th>
                <th class="py-3 px-4 font-mono uppercase w-32">ACTIONS</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hermes-cyan/10">
              <For each={filteredVars()}>
                {(item) => {
                  const isRevealed = revealed().has(item.key);
                  const displayValue = isRevealed ? item.value : '••••••••••••••';
                  return (
                    <tr class="hover:bg-hermes-cyan/5 transition-colors group">
                      <td class="py-3 px-4 font-mono text-hermes-cyan">{item.key}</td>
                      <td class="py-3 px-4 font-mono text-hermes-text-dim cursor-pointer" 
                          onClick={() => !isRevealed && revealValue(item.key)}>
                        {displayValue}
                        {!isRevealed && <span class="ml-2 text-[10px] opacity-40 group-hover:opacity-70">(click to reveal)</span>}
                      </td>
                      <td class="py-3 px-4">
                        <div class="flex gap-2">
                          <button
                            onClick={() => {
                              const val = prompt(`Edit value for ${item.key}:`, item.value);
                              if (val !== null) updateEnv(item.key, val);
                            }}
                            class="text-[10px] px-3 py-0.5 border border-hermes-cyan/40 hover:bg-hermes-cyan/10 rounded"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={() => deleteEnv(item.key)}
                            class="text-[10px] px-3 py-0.5 border border-hermes-magenta/40 hover:bg-hermes-magenta/10 text-hermes-magenta rounded"
                          >
                            DELETE
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
          <Show when={filteredVars().length === 0 && !loading()}>
            <div class="p-8 text-center text-hermes-text-dim text-sm">No matching environment variables found.</div>
          </Show>
        </div>
      </div>

      <div class="text-[10px] text-hermes-text-dim mt-4 text-center font-mono">
        Values for secrets are redacted by default. Click to reveal via secure endpoint.
      </div>
    </div>
  );
}
