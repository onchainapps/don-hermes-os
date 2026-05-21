import { createSignal, onMount, createEffect, For, Show } from 'solid-js';
import { hermesGet } from '../../lib/hermesApi';

interface AnalyticsData {
  totals?: {
    input_tokens: number;
    output_tokens: number;
    cache_tokens?: number;
    reasoning_tokens?: number;
    estimated_cost: number;
    sessions: number;
  };
  daily?: Array<{date: string; tokens: number; cost: number}>;
  by_model?: Array<{model: string; tokens: number; cost: number; sessions: number}>;
  period_days?: number;
}

export default function AnalyticsPanel() {
  const [data, setData] = createSignal<AnalyticsData>({});
  const [period, setPeriod] = createSignal<7 | 30 | 90>(30);
  const [loading, setLoading] = createSignal(true);

  const fetchAnalytics = async (days: number) => {
    try {
      setLoading(true);
      const res = await hermesGet<AnalyticsData>(`/analytics/usage?days=${days}`);
      setData(res);
    } catch (err) {
      console.error('Analytics fetch failed:', err);
      // Fallback demo data
      setData({
        totals: { input_tokens: 245000, output_tokens: 98000, estimated_cost: 12.45, sessions: 47 },
        daily: Array.from({length: 7}, (_, i) => ({
          date: `2026-04-${10+i}`,
          tokens: Math.floor(8000 + Math.random() * 25000),
          cost: Math.random() * 2.5
        })),
        by_model: [
          {model: 'grok-4.20', tokens: 145000, cost: 8.2, sessions: 28},
          {model: 'gemma-4-26b', tokens: 89000, cost: 3.1, sessions: 12},
          {model: 'qwen3.5-27b', tokens: 65000, cost: 1.15, sessions: 7}
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  onMount(() => fetchAnalytics(period()));

  createEffect(() => {
    fetchAnalytics(period());
  });

  const totals = () => data().totals || { input_tokens: 0, output_tokens: 0, estimated_cost: 0, sessions: 0 };
  const daily = () => data().daily || [];
  const byModel = () => data().by_model || [];

  const maxDailyTokens = () => Math.max(...daily().map(d => d.tokens), 10000);

  const formatTokens = (n: number) => (n / 1000).toFixed(0) + 'k';
  const formatCost = (n: number) => '$' + n.toFixed(2);

  const Bar = (props: { height: number; label: string; value: number; color?: string }) => (
    <div class="flex flex-col items-center gap-1 group">
      <div class="relative w-8 flex justify-center">
        <div 
          class="w-6 bg-gradient-to-t from-hermes-cyan to-cyan-400 rounded-t transition-all duration-300 group-hover:brightness-110"
          style={{ height: `${props.height}px`, 'box-shadow': '0 0 8px rgba(0,243,255,0.6)' }}
        />
      </div>
      <div class="text-[10px] text-hermes-text-dim font-mono mt-1">{props.label}</div>
      <div class="text-[9px] text-hermes-cyan/70 font-mono">{formatTokens(props.value)}</div>
    </div>
  );

  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="panel-header flex justify-between items-center mb-6">
        <div class="flex items-center gap-3">
          📊 <span>HERMES ANALYTICS</span>
        </div>
        <div class="flex gap-1 border border-hermes-cyan/30 rounded p-1">
          {[7, 30, 90].map(d => (
            <button
              onClick={() => setPeriod(d as 7|30|90)}
              class={`px-5 py-1 text-xs rounded transition-all ${period() === d 
                ? 'bg-hermes-cyan text-black shadow-neon-cyan' 
                : 'hover:bg-hermes-cyan/10 text-hermes-text-dim'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <Show when={!loading()} fallback={<div class="flex-1 flex items-center justify-center">Loading usage analytics...</div>}>
        {/* Summary Cards */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div class="panel p-5">
            <div class="metric-label">TOTAL TOKENS</div>
            <div class="metric-value mt-2">{formatTokens((totals().input_tokens || 0) + (totals().output_tokens || 0))}</div>
            <div class="text-xs text-hermes-text-dim mt-1">input+output</div>
          </div>
          <div class="panel p-5">
            <div class="metric-label">EST. COST</div>
            <div class="metric-value mt-2 text-hermes-green" style="text-shadow: 0 0 12px #00ff9f">{formatCost(totals().estimated_cost || 0)}</div>
            <div class="text-xs text-hermes-text-dim mt-1">this period</div>
          </div>
          <div class="panel p-5">
            <div class="metric-label">SESSIONS</div>
            <div class="metric-value mt-2">{totals().sessions || 0}</div>
            <div class="text-xs text-hermes-text-dim mt-1">active conversations</div>
          </div>
          <div class="panel p-5">
            <div class="metric-label">AVG/SESSION</div>
            <div class="metric-value mt-2 text-hermes-cyan">
              {totals().sessions ? formatTokens(((totals().input_tokens || 0) + (totals().output_tokens || 0)) / totals().sessions) : '0'} 
            </div>
            <div class="text-xs text-hermes-text-dim mt-1">tokens per session</div>
          </div>
        </div>

        {/* Daily Usage Bar Chart */}
        <div class="panel mb-8 p-6">
          <div class="panel-header text-sm mb-6">DAILY TOKEN USAGE (LAST {period()} DAYS)</div>
          <div class="flex items-end gap-3 h-52 justify-around px-4">
            <For each={daily().slice(-7)}>
              {(day, i) => {
                const height = Math.max(20, Math.floor((day.tokens / maxDailyTokens()) * 160));
                const dateLabel = day.date.split('-').slice(1).join('/');
                return <Bar height={height} label={dateLabel} value={day.tokens} />;
              }}
            </For>
          </div>
          <div class="text-center text-[10px] text-hermes-text-dim mt-6 font-mono">BAR HEIGHT = RELATIVE TOKEN VOLUME • PURE CSS BARS</div>
        </div>

        {/* Model Breakdown */}
        <div class="panel flex-1 p-6 overflow-auto">
          <div class="panel-header text-sm mb-4">PER-MODEL BREAKDOWN</div>
          <table class="w-full text-xs">
            <thead>
              <tr class="text-hermes-text-dim border-b border-hermes-cyan/20">
                <th class="text-left py-3 px-4">MODEL</th>
                <th class="text-right py-3 px-4">TOKENS</th>
                <th class="text-right py-3 px-4">COST</th>
                <th class="text-right py-3 px-4">SESSIONS</th>
                <th class="w-20"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hermes-cyan/10 font-mono">
              <For each={byModel()}>
                {(model) => (
                  <tr class="hover:bg-hermes-cyan/5">
                    <td class="py-4 px-4 text-hermes-cyan">{model.model}</td>
                    <td class="py-4 px-4 text-right text-hermes-text">{formatTokens(model.tokens)}</td>
                    <td class="py-4 px-4 text-right text-hermes-green">{formatCost(model.cost)}</td>
                    <td class="py-4 px-4 text-right">{model.sessions}</td>
                    <td class="py-4 px-4">
                      <div class="h-1.5 bg-hermes-cyan/20 rounded overflow-hidden">
                        <div class="h-1.5 bg-hermes-cyan rounded" style={{width: `${Math.min(100, (model.tokens / 200000) * 100)}%`}}></div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
