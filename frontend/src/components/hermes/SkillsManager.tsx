import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { hermesGet, hermesPut } from '../../lib/hermesApi';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  platforms?: string[];
}

interface Toolset {
  name: string;
  description: string;
  count: number;
}

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

export default function SkillsManager() {
  const [skills, setSkills] = createSignal<Skill[]>([]);
  const [toolsets, setToolsets] = createSignal<Toolset[]>([]);
  const [searchTerm, setSearchTerm] = createSignal('');
  const debouncedSearch = useDebounce(() => searchTerm(), 200);
  const [activeCategory, setActiveCategory] = createSignal('all');
  const [loading, setLoading] = createSignal(true);
  const [status, setStatus] = createSignal('');

  const categories = () => {
    const cats = new Set(skills().map(s => s.category));
    return ['all', ...Array.from(cats)];
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [skillsData, toolsetsData] = await Promise.all([
        hermesGet<Skill[] | {skills: Skill[]}>('/skills'),
        hermesGet<Toolset[] | {toolsets: Toolset[]}>('/tools/toolsets')
      ]);
      setSkills(Array.isArray(skillsData) ? skillsData : skillsData.skills || []);
      setToolsets(Array.isArray(toolsetsData) ? toolsetsData : toolsetsData.toolsets || []);
    } catch (err) {
      console.error(err);
      setStatus('Failed to load skills data');
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchData);

  const toggleSkill = async (skillId: string, enabled: boolean) => {
    try {
      await hermesPut('/skills/toggle', { id: skillId, enabled });
      setStatus(`Toggled ${skillId}`);
      setTimeout(() => setStatus(''), 1200);
      // Refresh
      const updated = await hermesGet<Skill[] | {skills: Skill[]}>('/skills');
      setSkills(Array.isArray(updated) ? updated : updated.skills || []);
    } catch (err) {
      setStatus('Toggle failed');
    }
  };

  const filteredSkills = () => {
    let result = skills();
    const term = debouncedSearch().toLowerCase();
    if (term) {
      result = result.filter(s => 
        s.name.toLowerCase().includes(term) || 
        s.description.toLowerCase().includes(term)
      );
    }
    if (activeCategory() !== 'all') {
      result = result.filter(s => s.category === activeCategory());
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="panel-header mb-4 flex justify-between">
        <div>🧩 SKILLS MANAGER — {skills().length} LOADED</div>
        <button onClick={fetchData} class="text-xs px-4 py-1 border border-hermes-cyan/40 rounded hover:bg-hermes-cyan/10">REFRESH ALL</button>
      </div>

      <Show when={status()}>
        <div class="mb-4 p-3 text-xs bg-hermes-green/10 border border-hermes-green text-hermes-green rounded">{status()}</div>
      </Show>

      {/* Search and Category Filters */}
      <div class="flex gap-4 mb-6 flex-shrink-0">
        <input
          type="text"
          placeholder="SEARCH SKILLS (300+ available)..."
          value={searchTerm()}
          onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          class="flex-1 ssh-input"
        />
        <div class="flex border border-hermes-cyan/30 rounded overflow-hidden text-xs flex-shrink-0">
          <For each={categories()}>
            {(cat) => (
              <button
                onClick={() => setActiveCategory(cat)}
                class={`px-5 py-2 transition-colors whitespace-nowrap ${
                  activeCategory() === cat 
                    ? 'bg-hermes-green text-black' 
                    : 'bg-transparent hover:bg-white/5 text-hermes-text-dim'
                }`}
              >
                {cat === 'all' ? 'ALL' : cat.toUpperCase()}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Skills Grid */}
      <div class="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-2 gap-4 pr-2" style="max-height: calc(100vh - 280px);">
        <For each={filteredSkills()}>
          {(skill) => (
            <div class="panel p-5 flex flex-col">
              <div class="flex justify-between items-start mb-3">
                <div>
                  <div class="font-bold text-hermes-cyan text-sm">{skill.name}</div>
                  <div class="text-[10px] uppercase tracking-widest text-hermes-text-dim mt-0.5">{skill.category}</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    onChange={(e) => toggleSkill(skill.id || skill.name, (e.target as HTMLInputElement).checked)}
                    class="sr-only peer"
                  />
                  <div class="w-11 h-6 bg-hermes-text-dim/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-hermes-cyan rounded-full peer peer-checked:bg-hermes-green"></div>
                  <div class="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-all peer-checked:translate-x-5"></div>
                </label>
              </div>
              <div class="text-xs text-hermes-text-dim flex-1 leading-snug mb-4 line-clamp-3">
                {skill.description}
              </div>
              <div class="flex gap-2 text-[10px]">
                <Show when={skill.platforms}>
                  <For each={skill.platforms}>
                    {(plat) => <span class="px-2 py-0.5 bg-hermes-cyan/10 text-hermes-cyan rounded"> {plat} </span>}
                  </For>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* Toolsets Section */}
      <div class="mt-8">
        <div class="panel-header text-sm mb-4">AVAILABLE TOOLSETS</div>
        <div class="grid grid-cols-2 gap-4">
          <For each={toolsets()}>
            {(ts) => (
              <div class="panel p-4 text-xs">
                <div class="font-mono text-hermes-green mb-1">{ts.name}</div>
                <div class="text-hermes-text-dim mb-3 line-clamp-2">{ts.description}</div>
                <div class="text-[10px] bg-hermes-cyan/10 inline-block px-3 py-1 rounded-full text-hermes-cyan">
                  {ts.count} tools
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={loading()}>
        <div class="absolute inset-0 bg-black/80 flex items-center justify-center text-hermes-cyan">LOADING 300+ SKILLS...</div>
      </Show>
    </div>
  );
}
