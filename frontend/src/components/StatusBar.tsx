import { Show } from 'solid-js';

interface StatusBarProps {
  stats: {
    cpu: { load1: number; cores: number };
    memory: { percent: number; used: number; total: number };
    system: { uptime: string; hostname: string };
  } | null;
  gatewayOnline: boolean;
  sessionId: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)}G`;
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)}M`;
  return `${(bytes / 1024).toFixed(0)}K`;
}

export default function StatusBar(props: StatusBarProps) {
  const memIndicator = () => {
    const p = props.stats?.memory.percent || 0;
    if (p > 85) return { color: '#ef4444', label: 'HIGH' };
    if (p > 65) return { color: '#f59e0b', label: '' };
    return { color: '#22c55e', label: '' };
  };

  const cpuIndicator = () => {
    const l = props.stats?.cpu.load1 || 0;
    const cores = props.stats?.cpu.cores || 1;
    const pct = (l / cores) * 100;
    if (pct > 80) return { color: '#ef4444', label: 'HIGH' };
    if (pct > 50) return { color: '#f59e0b', label: '' };
    return { color: '#71717a', label: '' };
  };

  return (
    <footer
      class="flex items-center justify-between px-3 py-1 text-[10px] flex-shrink-0 border-t border-hermes-border"
      style={{
        background: '#0d0d0f',
        color: '#71717a',
        'font-family': '"JetBrains Mono", monospace',
      }}
    >
      {/* Left: CPU + MEM */}
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="w-1 h-1 rounded-full" style={{ background: cpuIndicator().color }} />
          <span class="text-hermes-text-dim">{props.stats?.cpu.load1.toFixed(2) || '—'}</span>
          <span class="opacity-40">load</span>
          <Show when={cpuIndicator().label}>
            <span class="text-hermes-warning font-medium">{cpuIndicator().label}</span>
          </Show>
        </span>

        <span class="flex items-center gap-1.5">
          <span class="w-1 h-1 rounded-full" style={{ background: memIndicator().color }} />
          <span class="text-hermes-text-dim">{props.stats?.memory.percent || '—'}%</span>
          <span class="opacity-40">mem</span>
          <Show when={props.stats}>
            <span class="opacity-30">
              {formatBytes(props.stats!.memory.used)}/{formatBytes(props.stats!.memory.total)}
            </span>
          </Show>
          <Show when={memIndicator().label}>
            <span class="text-hermes-warning font-medium">{memIndicator().label}</span>
          </Show>
        </span>
      </div>

      {/* Center: Hostname + Uptime */}
      <div class="flex items-center gap-2 opacity-40">
        <span>{props.stats?.system.hostname || '—'}</span>
        <span>|</span>
        <span>{props.stats?.system.uptime || '—:—:—'}</span>
      </div>

      {/* Right: Gateway + Session */}
      <div class="flex items-center gap-3">
        <Show when={props.sessionId}>
          <span class="opacity-30">
            sid:{props.sessionId?.slice(0, 8)}
          </span>
        </Show>
        <span class="flex items-center gap-1.5">
          <div
            class="w-1.5 h-1.5 rounded-full"
            style={{
              background: props.gatewayOnline ? '#22c55e' : '#ef4444',
              'box-shadow': `0 0 0 2px ${props.gatewayOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            }}
          />
          <span class="text-hermes-text-dim">
            GW:{props.gatewayOnline ? '8642' : 'OFF'}
          </span>
        </span>
      </div>
    </footer>
  );
}
