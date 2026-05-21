// Tool Call View — shows individual tool call details with status, duration, and arguments
// Can be expanded to show full JSON arguments.

import { createSignal, Show } from 'solid-js';
import type { ToolCall } from '../types';

interface ToolCallViewProps {
  toolCall: ToolCall;
}

export function ToolCallView(props: ToolCallViewProps) {
  const [expanded, setExpanded] = createSignal(false);
  const toolCall = props.toolCall;

  const getStatusBadge = () => {
    switch (toolCall.status) {
      case 'running': return { text: 'Running', class: 'badge-running' };
      case 'complete': return { text: 'Complete', class: 'badge-complete' };
      case 'error': return { text: 'Error', class: 'badge-error' };
      default: return { text: 'Pending', class: 'badge-pending' };
    }
  };

  const badge = getStatusBadge();
  const argsObject = () => {
    try {
      return JSON.parse(toolCall.args || '{}');
    } catch {
      return null;
    }
  };

  return (
    <div class={`tool-call ${toolCall.status}`}>
      <div class="tool-call-header" onClick={() => setExpanded(!expanded())}>
        <span class="tool-call-name">{toolCall.name}</span>
        <span class={`status-badge ${badge.class}`}>{badge.text}</span>
        <Show when={toolCall.duration !== undefined}>
          <span class="tool-call-duration">{toolCall.duration?.toFixed(2)}s</span>
        </Show>
        <span class="tool-call-toggle">{expanded() ? '▲' : '▼'}</span>
      </div>
      <Show when={expanded()}>
        <div class="tool-call-body">
          <div class="tool-call-args">
            <Show when={argsObject()}>
              <pre>{JSON.stringify(argsObject(), null, 2)}</pre>
            </Show>
            <Show when={!argsObject()}>
              <code>{toolCall.args || '(no arguments)'}</code>
            </Show>
          </div>
          <Show when={toolCall.result}>
            <div class="tool-call-result">
              <strong>Result:</strong>
              <pre>{toolCall.result}</pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
