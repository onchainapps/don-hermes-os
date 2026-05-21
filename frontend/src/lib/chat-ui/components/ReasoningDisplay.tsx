// Reasoning Display — shows the agent's thinking/reasoning content
// Collapsible by default, expands to show full reasoning.

import { createSignal, Show } from 'solid-js';

interface ReasoningDisplayProps {
  reasoning: string;
  maxLength?: number;
}

export function ReasoningDisplay(props: ReasoningDisplayProps) {
  const [expanded, setExpanded] = createSignal(false);
  const maxLength = props.maxLength || 200;
  const isLong = () => props.reasoning.length > maxLength;
  const displayText = () => {
    if (!isLong() || expanded()) return props.reasoning;
    return props.reasoning.slice(0, maxLength) + '...';
  };

  if (!props.reasoning) return null;

  return (
    <div class="reasoning-display">
      <div class="reasoning-header" onClick={() => setExpanded(!expanded())}>
        <span class="reasoning-icon">🧠</span>
        <span class="reasoning-title">Reasoning</span>
        <Show when={isLong()}>
          <span class="reasoning-toggle">{expanded() ? '▲' : '▼'}</span>
        </Show>
      </div>
      <div class={`reasoning-content ${expanded() ? 'expanded' : ''}`}>
        {displayText()}
      </div>
    </div>
  );
}
