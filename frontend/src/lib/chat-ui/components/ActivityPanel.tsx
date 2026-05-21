// Activity Panel — shows the live activity feed (thinking, tool calls, run status)
// Mirrors the Hermes TUI's activity display for transparency into what the agent is doing.

import { For, Show } from 'solid-js';
import type { ActivityItem } from '../types';

interface ActivityPanelProps {
  items: ActivityItem[];
  maxItems?: number;
}

export function ActivityPanel(props: ActivityPanelProps) {
  const items = () => {
    const max = props.maxItems || 20;
    return props.items.slice(-max);
  };

  const getEmoji = (item: ActivityItem) => {
    switch (item.type) {
      case 'thinking': return '🧠';
      case 'tool_started': return item.label.includes('approval') ? '⏳' : '🔧';
      case 'tool_completed': return '✅';
      case 'tool_error': return '❌';
      case 'run_start': return '🚀';
      case 'run_complete': return '🏁';
      case 'run_error': return '💥';
      default: return '•';
    }
  };

  const getStatusColor = (item: ActivityItem) => {
    switch (item.type) {
      case 'thinking': return 'text-purple-400';
      case 'tool_started': return 'text-blue-400';
      case 'tool_completed': return 'text-green-400';
      case 'tool_error': return 'text-red-400';
      case 'run_start': return 'text-yellow-400';
      case 'run_complete': return 'text-green-400';
      case 'run_error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div class="activity-panel">
      <div class="activity-header">
        <span class="activity-title">Activity</span>
        <Show when={items().length > 0}>
          <span class="activity-count">{items().length}</span>
        </Show>
      </div>
      <div class="activity-list">
        <For each={items()}>
          {(item) => (
            <div class={`activity-item ${item.type}`}>
              <span class={`activity-emoji ${getStatusColor(item)}`}>
                {getEmoji(item)}
              </span>
              <div class="activity-content">
                <div class="activity-label">{item.label}</div>
                <Show when={item.detail}>
                  <div class="activity-detail">{item.detail}</div>
                </Show>
                <Show when={item.duration !== undefined}>
                  <div class="activity-duration">{item.duration.toFixed(2)}s</div>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
