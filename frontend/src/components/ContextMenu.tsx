import { createSignal, onCleanup, onMount, For, Show } from 'solid-js';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  divider?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu(props: ContextMenuProps) {
  let menuRef: HTMLDivElement | undefined;
  const [activeSubmenu, setActiveSubmenu] = createSignal<number | null>(null);

  // Clamp position to viewport
  const adjustedX = () => {
    if (!menuRef) return props.x;
    const rect = menuRef.getBoundingClientRect();
    return props.x + rect.width > window.innerWidth ? props.x - rect.width : props.x;
  };

  const adjustedY = () => {
    if (!menuRef) return props.y;
    const rect = menuRef.getBoundingClientRect();
    return props.y + rect.height > window.innerHeight ? props.y - rect.height : props.y;
  };

  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    // Delay to avoid the click that opened the menu
    setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 0);
    onCleanup(() => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    });
  });

  return (
    <div
      ref={menuRef}
      class="fixed z-[9999] min-w-[200px] py-1 rounded-lg overflow-hidden"
      style={{
        left: `${adjustedX()}px`,
        top: `${adjustedY()}px`,
        background: 'linear-gradient(135deg, #0d0d14 0%, #0a0a10 100%)',
        border: '1px solid rgba(0, 243, 255, 0.2)',
        'box-shadow': '0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(0,243,255,0.3)',
        'backdrop-filter': 'blur(12px)',
      }}
    >
      <For each={props.items}>
        {(item, index) => (
          <>
            <Show when={item.divider && index() > 0}>
              <div class="mx-2 my-1 border-t border-hermes-cyan/10" />
            </Show>
            <div
              class="relative"
              onMouseEnter={() => item.children && setActiveSubmenu(index())}
              onMouseLeave={() => activeSubmenu() === index() && setActiveSubmenu(null)}
            >
              <button
                class={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                  item.disabled
                    ? 'opacity-30 cursor-default'
                    : item.danger
                    ? 'text-hermes-magenta hover:bg-hermes-magenta/10'
                    : 'text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan'
                }`}
                onClick={() => {
                  if (item.disabled) return;
                  item.action();
                  props.onClose();
                }}
              >
                <span class="w-5 text-center flex-shrink-0 text-[11px]">
                  {item.icon || ''}
                </span>
                <span class="flex-1">{item.label}</span>
                <Show when={item.shortcut}>
                  <span class="text-[9px] opacity-30 ml-auto">{item.shortcut}</span>
                </Show>
                <Show when={item.children}>
                  <span class="text-[9px] opacity-40">▸</span>
                </Show>
              </button>
              {/* Submenu */}
              <Show when={item.children && activeSubmenu() === index()}>
                <div
                  class="absolute left-full top-0 ml-0.5 min-w-[180px] py-1 rounded-lg z-[10000]"
                  style={{
                    background: 'linear-gradient(135deg, #0d0d14 0%, #0a0a10 100%)',
                    border: '1px solid rgba(0, 243, 255, 0.2)',
                    'box-shadow': '0 8px 32px rgba(0,0,0,0.6)',
                  }}
                >
                  <For each={item.children!}>
                    {(child) => (
                      <button
                        class={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                          child.danger
                            ? 'text-hermes-magenta hover:bg-hermes-magenta/10'
                            : 'text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan'
                        }`}
                        onClick={() => {
                          child.action();
                          props.onClose();
                        }}
                      >
                        <span class="w-5 text-center flex-shrink-0 text-[11px]">
                          {child.icon || ''}
                        </span>
                        <span class="flex-1">{child.label}</span>
                        <Show when={child.shortcut}>
                          <span class="text-[9px] opacity-30">{child.shortcut}</span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </>
        )}
      </For>
    </div>
  );
}
