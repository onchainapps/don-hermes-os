import { createSignal, For, Show, JSX } from 'solid-js';

export type AppId = 'CODE' | 'SYSTEM' | 'SESSIONS' | 'WIKI' | 'PROFILES';

interface SidebarProps {
  activeApp: AppId;
  onAppSelect: (id: AppId) => void;
  gatewayOnline: boolean;
}

interface AppDef {
  id: AppId;
  icon: JSX.Element;
  label: string;
  shortcut: string;
}

// SVG Icons (16x16, stroke 1.5)
const Icons = {
  code: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  system: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  sessions: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  wiki: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  profiles: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
};

const APPS: AppDef[] = [
  { id: 'SYSTEM',    icon: Icons.system,   label: 'System',    shortcut: '1' },
  { id: 'CODE',      icon: Icons.code,     label: 'Code',      shortcut: '2' },
  { id: 'SESSIONS',  icon: Icons.sessions, label: 'Sessions',  shortcut: '3' },
  { id: 'WIKI',      icon: Icons.wiki,     label: 'Wiki 3D',   shortcut: '4' },
  { id: 'PROFILES',  icon: Icons.profiles, label: 'Profiles',  shortcut: '5' },
];

export default function Sidebar(props: SidebarProps) {
  const [hoveredApp, setHoveredApp] = createSignal<AppId | null>(null);

  return (
    <aside
      class="flex flex-col items-center py-3 gap-0.5 flex-shrink-0 border-r border-hermes-border"
      style={{
        width: '52px',
        background: 'linear-gradient(180deg, #0d0d0f 0%, #0a0a0b 100%)',
      }}
    >
      {/* Logo */}
      <div
        class="mb-2 w-8 h-8 flex items-center justify-center rounded-lg"
        style={{
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
        }}
      >
        <span class="text-xs font-bold" style={{ color: '#6366f1' }}>D</span>
      </div>

      {/* App icons */}
      <For each={APPS}>
        {(app) => {
          const isActive = () => props.activeApp === app.id;
          const isHovered = () => hoveredApp() === app.id;

          return (
            <div class="relative group">
              <button
                class="w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 ease-spring cursor-pointer"
                style={{
                  background: isActive()
                    ? 'rgba(99, 102, 241, 0.15)'
                    : isHovered()
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'transparent',
                  color: isActive() ? '#6366f1' : '#71717a',
                }}
                onClick={() => props.onAppSelect(app.id)}
                onMouseEnter={() => setHoveredApp(app.id)}
                onMouseLeave={() => setHoveredApp(null)}
                title={`${app.label} (Ctrl+${app.shortcut})`}
              >
                {app.icon}
              </button>

              {/* Active indicator bar */}
              <Show when={isActive()}>
                <div
                  class="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r"
                  style={{
                    background: '#6366f1',
                  }}
                />
              </Show>

              {/* Tooltip on hover */}
              <Show when={isHovered() && !isActive()}>
                <div
                  class="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap z-50 pointer-events-none border border-hermes-border"
                  style={{
                    background: '#131315',
                    color: '#a1a1aa',
                  }}
                >
                  {app.label}
                  <span class="ml-1.5 text-hermes-text-muted">⌘{app.shortcut}</span>
                </div>
              </Show>
            </div>
          );
        }}
      </For>

      {/* Spacer */}
      <div class="flex-1" />

      {/* Gateway status */}
      <div
        class="w-8 h-8 flex items-center justify-center rounded-lg mb-1"
        style={{
          background: props.gatewayOnline ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${props.gatewayOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
        }}
        title={props.gatewayOnline ? 'Gateway Online' : 'Gateway Offline'}
      >
        <div
          class="w-2 h-2 rounded-full"
          style={{
            background: props.gatewayOnline ? '#22c55e' : '#ef4444',
            'box-shadow': `0 0 0 2px ${props.gatewayOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            animation: props.gatewayOnline ? 'pulse 2s infinite' : 'none',
          }}
        />
      </div>
    </aside>
  );
}
