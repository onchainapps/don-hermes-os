import { createSignal, onMount, onCleanup, For, Show, createEffect } from 'solid-js';
import type { Message } from '../types';
import { createAutoScroll } from '../hooks/createAutoScroll';
import MessageItem from './MessageItem';
import ScrollAnchor from './ScrollAnchor';

interface MessageListProps {
  messages: Message[];
  introMessage?: string;
}

export default function MessageList(props: MessageListProps) {
  let scrollContainer: HTMLDivElement | undefined;
  const [autoScrollEnabled, setAutoScrollEnabled] = createSignal(true);

  const autoScroll = createAutoScroll(
    () => scrollContainer,
    { threshold: 50 }
  );

  // Scroll to bottom when new messages arrive or content grows
  createEffect(() => {
    const msgs = props.messages;
    if (autoScrollEnabled() && autoScroll.isAtBottom()) {
      autoScroll.scrollToBottom('smooth');
    }
  });

  // Observe message items for ResizeObserver (debounced)
  let observeTimer: ReturnType<typeof setTimeout> | null = null;
  const observeLastMessage = () => {
    if (!scrollContainer || observeTimer) return;
    observeTimer = setTimeout(() => {
      const items = scrollContainer.querySelectorAll('[data-message-item]');
      autoScroll.observeElements(Array.from(items));
      observeTimer = null;
    }, 200);
  };

  onMount(() => {
    // Initial scroll to bottom
    autoScroll.scrollToBottom('instant');
  });

  return (
    <div class="relative flex-1 min-h-0 overflow-hidden">
      <div
        ref={scrollContainer}
        class="h-full overflow-y-auto"
        style={{
          'scrollbar-width': 'thin',
          'scrollbar-color': 'rgba(0,243,255,0.15) transparent',
          padding: '8px 8px',
        }}
        onScroll={observeLastMessage}
      >
        {/* Empty state / intro */}
        <Show when={props.messages.length === 0 && props.introMessage}>
          <div
            class="flex items-center justify-center h-full"
            style={{ color: 'rgba(170,255,204,0.25)', 'font-family': '"JetBrains Mono", monospace', 'font-size': '13px' }}
          >
            <div class="text-center max-w-md">
              <div style={{ 'font-size': '28px', 'margin-bottom': '12px' }}>🤖</div>
              <div style={{ 'white-space': 'pre-wrap' }}>{props.introMessage}</div>
            </div>
          </div>
        </Show>

        {/* Message list */}
        <For each={props.messages}>
          {(message, idx) => {
            /* Find the index of the last streaming message. Only it gets the cursor. */
            const lastStreamingIdx = () => {
              for (let i = props.messages.length - 1; i >= 0; i--) {
                if (props.messages[i].status === 'streaming') return i;
              }
              return -1;
            };
            return (
              <div data-message-item>
                <MessageItem
                  message={message}
                  isLastStreaming={idx() === lastStreamingIdx() && idx() >= 0}
                />
              </div>
            );
          }}
        </For>
      </div>

      <ScrollAnchor
        visible={!autoScroll.isAtBottom()}
        onClick={() => {
          autoScroll.scrollToBottom('smooth');
          setAutoScrollEnabled(true);
        }}
      />
    </div>
  );
}
