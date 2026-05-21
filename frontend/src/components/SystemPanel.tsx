import { createSignal, onMount, onCleanup, Show, For, JSX } from 'solid-js';

interface Stats {
  cpu: { model: string; cores: number; load1: number; load5: number; load15: number };
  memory: { total: number; free: number; used: number; percent: number };
  system: { uptime: string; uptimeSeconds: number; platform: string; arch: string; hostname: string };
}

interface SystemPanelProps {
  stats: Stats | null;
  gatewayOnline: boolean;
}

function formatGB(bytes: number): string {
  return (bytes / 1073741824).toFixed(1);
}

export default function SystemPanel(props: SystemPanelProps) {
  const [loadHistory, setLoadHistory] = createSignal<number[]>([]);
  const [memHistory, setMemHistory] = createSignal<number[]>([]);

  let sparkInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    sparkInterval = setInterval(() => {
      if (props.stats) {
        setLoadHistory(prev => [...prev.slice(-59), props.stats!.cpu.load1]);
        setMemHistory(prev => [...prev.slice(-59), props.stats!.memory.percent]);
      }
    }, 1000);
  });

  onCleanup(() => clearInterval(sparkInterval));

  const Sparkline = (sp: { data: number[]; color: string; max?: number }) => {
    const w = 200;
    const h = 30;
    const maxVal = sp.max || Math.max(...sp.data, 1);

    const points = sp.data.map((v, i) => {
      const x = (i / Math.max(sp.data.length - 1, 1)) * w;
      const y = h - (v / maxVal) * h;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={w} height={h} class="opacity-60">
        <polyline
          points={points}
          fill="none"
          stroke={sp.color}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    );
  };

  const memIndicator = () => {
    const p = props.stats?.memory.percent || 0;
    if (p > 85) return '#ef4444';
    if (p > 65) return '#f59e0b';
    return '#22c55e';
  };

  const cpuLoadPct = () => {
    if (!props.stats) return 0;
    return (props.stats.cpu.load1 / props.stats.cpu.cores) * 100;
  };

  const cpuIndicator = () => {
    const p = cpuLoadPct();
    if (p > 80) return '#ef4444';
    if (p > 50) return '#f59e0b';
    return '#6366f1';
  };

  // SVG Icons
  const CpuIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  );

  const MemIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 19v-3"/><path d="M10 19v-3"/><path d="M14 19v-3"/><path d="M18 19v-3"/><rect x="2" y="10" width="20" height="8" rx="2"/><path d="M2 10l2-7h16l2 7"/><path d="M12 3v2"/>
    </svg>
  );

  const SystemIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );

  const GatewayIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  );

  const MetricCard = ({ title, icon, children }: { title: string; icon: JSX.Element; children: JSX.Element }) => (
    <div class="panel p-5">
      <div class="panel-header">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div class="p-6 overflow-y-auto h-full bg-hermes-bg">
      <Show when={props.stats} fallback={
        <div class="text-center text-xs text-hermes-text-muted mt-20">Connecting to system stats...</div>
      }>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
          {/* CPU */}
          <MetricCard title="CPU" icon={CpuIcon}>
            <div class="text-xs text-hermes-text-muted mb-3 truncate">{props.stats!.cpu.model}</div>
            <div class="text-3xl font-semibold text-hermes-text mb-2 font-mono">
              {props.stats!.cpu.load1.toFixed(2)}
              <span class="text-sm text-hermes-text-muted ml-1">load</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-[10px] mb-3">
              <div>
                <div class="text-hermes-text-muted">1m</div>
                <div class="text-hermes-text-dim font-mono">{props.stats!.cpu.load1.toFixed(2)}</div>
              </div>
              <div>
                <div class="text-hermes-text-muted">5m</div>
                <div class="text-hermes-text-dim font-mono">{props.stats!.cpu.load5.toFixed(2)}</div>
              </div>
              <div>
                <div class="text-hermes-text-muted">15m</div>
                <div class="text-hermes-text-dim font-mono">{props.stats!.cpu.load15.toFixed(2)}</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <Sparkline data={loadHistory()} color={cpuIndicator()} max={props.stats!.cpu.cores} />
              <span class="text-[10px] text-hermes-text-muted">{props.stats!.cpu.cores} cores</span>
            </div>
          </MetricCard>

          {/* Memory */}
          <MetricCard title="MEMORY" icon={MemIcon}>
            <div class="text-3xl font-semibold text-hermes-text mb-2 font-mono">
              {props.stats!.memory.percent}%
              <span class="text-sm text-hermes-text-muted ml-1">used</span>
            </div>
            <div class="w-full rounded-full h-1.5 mb-3 bg-hermes-elevated">
              <div
                class="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${props.stats!.memory.percent}%`,
                  background: memIndicator(),
                }}
              />
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-[10px] mb-3">
              <div>
                <div class="text-hermes-text-muted">Used</div>
                <div class="text-hermes-text-dim font-mono">{formatGB(props.stats!.memory.used)} GB</div>
              </div>
              <div>
                <div class="text-hermes-text-muted">Free</div>
                <div class="text-hermes-text-dim font-mono">{formatGB(props.stats!.memory.free)} GB</div>
              </div>
              <div>
                <div class="text-hermes-text-muted">Total</div>
                <div class="text-hermes-text-muted font-mono">{formatGB(props.stats!.memory.total)} GB</div>
              </div>
            </div>
            <Sparkline data={memHistory()} color={memIndicator()} max={100} />
          </MetricCard>

          {/* System */}
          <MetricCard title="SYSTEM" icon={SystemIcon}>
            <div class="space-y-2">
              {['Hostname', 'Uptime', 'Platform', 'Cores'].map(key => (
                <div class="flex justify-between text-sm">
                  <span class="text-hermes-text-muted">{key}</span>
                  <span class="text-hermes-text-dim font-mono text-xs">
                    {key === 'Hostname' && props.stats!.system.hostname}
                    {key === 'Uptime' && props.stats!.system.uptime}
                    {key === 'Platform' && `${props.stats!.system.platform}/${props.stats!.system.arch}`}
                    {key === 'Cores' && props.stats!.cpu.cores}
                  </span>
                </div>
              ))}
            </div>
          </MetricCard>

          {/* Gateway */}
          <MetricCard title="GATEWAY" icon={GatewayIcon}>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-hermes-text-muted">Status</span>
                <span class="flex items-center gap-2">
                  <div
                    class="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: props.gatewayOnline ? '#22c55e' : '#ef4444',
                      'box-shadow': `0 0 0 2px ${props.gatewayOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    }}
                  />
                  <span class={`font-mono text-xs ${props.gatewayOnline ? 'text-hermes-success' : 'text-hermes-error'}`}>
                    {props.gatewayOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </span>
              </div>
              {['Port', 'Chat API', 'Cron API'].map(key => (
                <div class="flex justify-between text-sm">
                  <span class="text-hermes-text-muted">{key}</span>
                  <span class="text-hermes-text-dim font-mono text-xs">
                    {key === 'Port' && '8642'}
                    {key === 'Chat API' && '/v1/chat/completions'}
                    {key === 'Cron API' && '/api/jobs'}
                  </span>
                </div>
              ))}
            </div>
          </MetricCard>
        </div>
      </Show>
    </div>
  );
}
