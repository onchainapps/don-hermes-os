import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';

export interface Command {
  id: string;
  name: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  category?: string;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

// Simple fuzzy match: checks if all chars of query appear in order in target
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette(props: CommandPaletteProps) {
  let inputRef: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const filtered = () => {
    const q = query().trim();
    if (!q) return props.commands;
    return props.commands.filter(cmd => fuzzyMatch(q, cmd.name) || fuzzyMatch(q, cmd.id));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIndex()];
      if (item) {
        item.action();
        props.onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    }
  };

  // Reset selection when query changes
  const handleInput = (e: Event) => {
    setQuery((e.target as HTMLInputElement).value);
    setSelectedIndex(0);
  };

  onMount(() => {
    inputRef?.focus();
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  // Click outside to close
  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).id === 'command-palette-backdrop') {
      props.onClose();
    }
  };

  return (
    <div
      id="command-palette-backdrop"
      class="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={handleBackdropClick}
    >
      <div
        class="w-[500px] max-h-[400px] rounded-lg overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(135deg, #0d0d14 0%, #0a0a10 100%)',
          border: '1px solid rgba(0, 243, 255, 0.3)',
          'box-shadow': '0 0 30px rgba(0, 243, 255, 0.15), 0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* Search input */}
        <div class="flex items-center px-3 py-2 border-b border-hermes-cyan/20">
          <span class="text-hermes-cyan mr-2 text-sm">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query()}
            onInput={handleInput}
            placeholder="Type a command..."
            class="flex-1 bg-transparent text-hermes-text text-sm outline-none placeholder:text-hermes-text-dim/50"
            style={{ 'font-family': 'JetBrains Mono, monospace' }}
          />
          <span class="text-[9px] text-hermes-text-dim/40 ml-2">ESC to close</span>
        </div>

        {/* Command list */}
        <div class="overflow-y-auto flex-1 py-1" style={{ 'scrollbar-width': 'thin', 'scrollbar-color': 'rgba(0,243,255,0.2) transparent' }}>
          <For each={filtered()}>
            {(cmd, idx) => (
              <button
                class={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                  idx() === selectedIndex()
                    ? 'bg-hermes-cyan/15 text-hermes-cyan'
                    : 'text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan'
                }`}
                onClick={() => { cmd.action(); props.onClose(); }}
                onMouseEnter={() => setSelectedIndex(idx())}
              >
                <span class="w-5 text-center flex-shrink-0 text-sm">{cmd.icon || '›'}</span>
                <span class="flex-1">{cmd.name}</span>
                <Show when={cmd.category}>
                  <span class="text-[9px] text-hermes-text-dim/40">{cmd.category}</span>
                </Show>
                <Show when={cmd.shortcut}>
                  <span class="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,243,255,0.08)', color: 'rgba(0,243,255,0.5)' }}>
                    {cmd.shortcut}
                  </span>
                </Show>
              </button>
            )}
          </For>
          <Show when={filtered().length === 0}>
            <div class="px-3 py-4 text-xs text-hermes-text-dim text-center">No matching commands</div>
          </Show>
        </div>
      </div>
    </div>
  );
}
