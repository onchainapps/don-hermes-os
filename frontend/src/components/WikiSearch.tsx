import { Component, For, createSignal } from 'solid-js';
import { getAllCategories, getCategoryColor } from '../lib/graph-layout';

interface WikiSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  visibleCategories: Set<string>;
  onCategoryToggle: (category: string) => void;
}

const categoryLabels: Record<string, string> = {
  entities: 'Entities',
  concepts: 'Concepts',
  lessons: 'Lessons',
  decisions: 'Decisions',
  milestones: 'Milestones',
};

const WikiSearch: Component<WikiSearchProps> = (props) => {
  const categories = getAllCategories();

  return (
    <div class="flex flex-wrap items-center gap-4 mb-4">
      <div class="flex-1 min-w-64">
        <div class="relative">
          <input
            type="text"
            placeholder="Search pages..."
            value={props.searchQuery}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            class="w-full px-4 py-2 bg-hermes-bg border border-hermes-cyan/30 rounded text-hermes-text placeholder-hermes-text-dim/50 focus:outline-none focus:border-hermes-cyan focus:shadow-neon-cyan transition-all"
            style={{ "font-family": "inherit" }}
          />
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-hermes-text-dim/50">🔍</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-hermes-text-dim text-sm">FILTER:</span>
        <For each={categories}>
          {(category) => (
            <button
              onClick={() => props.onCategoryToggle(category)}
              class={`px-3 py-1 text-xs font-bold rounded border transition-all ${
                props.visibleCategories.has(category)
                  ? 'border-current'
                  : 'border-transparent opacity-40'
              }`}
              style={{
                background: props.visibleCategories.has(category) 
                  ? `${getCategoryColor(category)}20` 
                  : 'rgba(255,255,255,0.05)',
                color: getCategoryColor(category),
                "box-shadow": props.visibleCategories.has(category)
                  ? `0 0 8px ${getCategoryColor(category)}`
                  : 'none',
                "text-shadow": props.visibleCategories.has(category)
                  ? `0 0 4px ${getCategoryColor(category)}`
                  : 'none',
              }}
            >
              {categoryLabels[category] || category}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

export default WikiSearch;