import { Component, createSignal, createEffect, onCleanup, Show } from 'solid-js';

interface ThinkingBubbleProps {
  visible?: boolean;
  phrases?: string[];
  intervalMs?: number;
  class?: string;
}

export const ThinkingBubble: Component<ThinkingBubbleProps> = (props) => {
  const defaultPhrases = [
    'Thinking',
    'Ruminating',
    'Puzzling over this',
    'Considering options',
    'Weighing possibilities',
    'Reflecting',
    'Analyzing',
    'Contemplating',
    'Processing',
    'Formulating response',
    'Digging into this',
    'One moment…',
  ];

  const phrases = () => props.phrases ?? defaultPhrases;
  const intervalMs = () => props.intervalMs ?? 1100;

  const [index, setIndex] = createSignal(0);

  createEffect(() => {
    if (!props.visible) return;

    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % phrases().length);
    }, intervalMs());

    onCleanup(() => clearInterval(timer));
  });

  return (
    <Show when={props.visible}>
      <div class={`mc-thinking ${props.class ?? ''}`}>
        <span class="mc-thinking-icon">🤖</span>
        <span class="mc-thinking-text">{phrases()[index()]}</span>
        <span class="mc-thinking-dots">
          <span class="dot dot-1">.</span>
          <span class="dot dot-2">.</span>
          <span class="dot dot-3">.</span>
        </span>
        <span class="mc-thinking-cursor">▋</span>
      </div>
    </Show>
  );
};
