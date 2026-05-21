/**
 * ProfileChat — Per-profile floating chat modal
 * Routes through the backend gateway proxy (/gp) which handles
 * profile port + auth key resolution from the profile's .env.
 */

import { createSignal, onMount, onCleanup, Show, Index } from 'solid-js';
import { Portal } from 'solid-js/web';
import MessageContent from '../lib/chat-ui/components/MessageContent';

interface ProfileChatProps {
  profileId: string;
  profileName: string;
  gatewayPort?: number;
  apiKey?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ProfileChat(props: ProfileChatProps) {
  // Routes through the backend gateway proxy (/gp → Vite proxy → backend → profile's own gateway).
  // Backend reads the profile's .env for port + API key, so no auth header needed from the browser.
  const apiBase = '/gp';

  const [isOpen, setIsOpen] = createSignal(true);
  const [messages, setMessages] = createSignal<Message[]>([
    { role: 'assistant', content: `Hello! Profile chat ready for ${props.profileName}.` },
  ]);
  const [input, setInput] = createSignal('');
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [isMinimized, setIsMinimized] = createSignal(false);
  const [position, setPosition] = createSignal({ x: 180 + Math.random() * 100, y: 100 + Math.random() * 80 });
  const [isDragging, setIsDragging] = createSignal(false);

  const THINKING_PHRASES = [
    "Thinking...",
    "Working on it...",
    "Let me check that...",
    "Analyzing...",
    "One moment...",
    "Looking into it...",
    "Processing...",
    "Just a sec...",
  ];

  const [thinkingText, setThinkingText] = createSignal(THINKING_PHRASES[0]);
  let thinkingInterval: number | null = null;

  function startThinkingAnimation() {
    let index = 0;
    setThinkingText(THINKING_PHRASES[index]);
    if (thinkingInterval) clearInterval(thinkingInterval);
    thinkingInterval = window.setInterval(() => {
      index = (index + 1) % THINKING_PHRASES.length;
      setThinkingText(THINKING_PHRASES[index]);
    }, 1800);
  }

  function stopThinkingAnimation() {
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
    }
  }

  let dragStart = { x: 0, y: 0 };
  let dragPosStart = { x: 0, y: 0 };

  const startDrag = (e: MouseEvent) => {
    if (isMinimized()) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart = { x: e.clientX, y: e.clientY };
    dragPosStart = { ...position() };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', endDrag);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging()) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    let nx = dragPosStart.x + dx;
    let ny = dragPosStart.y + dy;
    nx = Math.max(0, Math.min(nx, window.innerWidth - 520));
    ny = Math.max(0, Math.min(ny, window.innerHeight - 620));
    setPosition({ x: nx, y: ny });
  };

  const endDrag = () => {
    setIsDragging(false);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', endDrag);
  };

  const log = (msg: string, data?: unknown) => {
    console.log(`[ProfileChat:${props.profileName}] ${msg}`, data ?? '');
  };

  const closeModal = () => {
    log('Closing profile chat');
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent('profile-chat-close', { detail: { id: props.profileId } }));
  };

  const sendMessage = async () => {
    const text = input().trim();
    if (!text || isStreaming()) return;

    log('Sending message', { text, gatewayPort: props.gatewayPort });

    const userMsg: Message = { role: 'user', content: text };
    const currentMessages = messages();
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    startThinkingAnimation();

    const assistantPlaceholder: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);

    let fullContent = '';

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (props.profileName) headers['X-Hermes-Profile'] = props.profileName;

      const createRes = await fetch(`${apiBase}/v1/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: text,
          stream: true,
          conversation_history: currentMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      log('Response status', createRes.status);

      if (!createRes.ok) {
        throw new Error(`Gateway error: ${createRes.status}`);
      }

      const runData = await createRes.json();
      const runId = runData.run_id;
      if (!runId) throw new Error('No run_id returned');

      // Stream events — backend proxy handles auth, just send profile header for routing
      const streamHeaders: Record<string, string> = { 'Accept': 'text/event-stream' };
      if (props.profileName) streamHeaders['X-Hermes-Profile'] = props.profileName;

      const streamRes = await fetch(`${apiBase}/v1/runs/${runId}/events`, { headers: streamHeaders });
      if (!streamRes.ok || !streamRes.body) throw new Error(`Stream failed: ${streamRes.status}`);

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const event = JSON.parse(data);
              if (event.event === "message.delta" && event.delta) {
                fullContent += event.delta;
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex]?.role === 'assistant') {
                    newMessages[lastIndex] = { ...newMessages[lastIndex], content: fullContent };
                  }
                  return newMessages;
                });
              }
            } catch {}
          }
        }
      }

      log('Received response');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log('Error sending message', msg);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant') last.content = fullContent || `Error: ${msg}`;
        return updated;
      });
    } finally {
      setIsStreaming(false);
      stopThinkingAnimation();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  onMount(() => {
    log('Mounted', { gatewayPort: props.gatewayPort, profileId: props.profileId });
    log('Initialized', {
      profileId: props.profileId,
      apiBase: apiBase,
      gatewayPort: props.gatewayPort,
    });
  });

  onCleanup(() => {
    log('Cleanup');
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', endDrag);
    stopThinkingAnimation();
  });

  return (
    <Show when={isOpen()}>
      <Portal>
        <div
          class="fixed z-[999] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            left: `${position().x}px`,
            top: `${position().y}px`,
            width: isMinimized() ? '320px' : '520px',
            height: isMinimized() ? '48px' : '620px',
          }}
        >
          {/* Header with gateway port display */}
          <div
            class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/90 cursor-move select-none"
            onMouseDown={startDrag}
          >
            <div class="flex items-center gap-3">
              <div class="font-semibold">{props.profileName} Chat</div>

              {/* Routing indicator */}
              <div class="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                /gp proxy
              </div>

              {/* Port indicator */}
              {props.gatewayPort && (
                <div class="px-1.5 py-0.5 text-[10px] rounded bg-emerald-900/30 text-emerald-400 border border-emerald-700 font-mono">
                  :{props.gatewayPort}
                </div>
              )}

              {/* Model info */}
              <div class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                grok-4.3
              </div>
            </div>

            <div class="flex gap-2">
              <button
                onClick={() => setIsMinimized(!isMinimized())}
                class="px-2 py-1 text-xs border border-zinc-700 rounded hover:bg-zinc-800"
              >
                {isMinimized() ? '□' : '−'}
              </button>
              <button
                onClick={closeModal}
                class="px-2 py-1 text-xs border border-zinc-700 rounded hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>
          </div>

          <Show when={!isMinimized()}>
            {/* Messages */}
            <div class="flex-1 overflow-y-auto p-4 space-y-3 text-sm bg-zinc-950">
              <Index each={messages()}>
                {(msg, index) => (
                  <div class={msg().role === 'user' ? 'text-right' : ''}>
                    <div
                      class={`inline-block max-w-[85%] px-3 py-2 rounded-xl ${
                        msg().role === 'user'
                          ? 'bg-hermes-cyan text-black'
                          : 'bg-zinc-900 border border-zinc-800'
                      }`}
                    >
                      <MessageContent
                        content={msg().content}
                        streaming={isStreaming() && index === messages().length - 1 && msg().role === 'assistant'}
                      />
                    </div>
                  </div>
                )}
              </Index>
              <Show when={isStreaming()}>
                <div class="text-zinc-500 text-xs flex items-center gap-2 px-1">
                  <div class="flex gap-1">
                    <div class="w-1 h-1 bg-hermes-cyan rounded-full animate-bounce" style="animation-delay: 0ms" />
                    <div class="w-1 h-1 bg-hermes-cyan rounded-full animate-bounce" style="animation-delay: 150ms" />
                    <div class="w-1 h-1 bg-hermes-cyan rounded-full animate-bounce" style="animation-delay: 300ms" />
                  </div>
                  <span>{thinkingText()}</span>
                </div>
              </Show>
            </div>

            {/* Input */}
            <div class="border-t border-zinc-800 p-3 bg-zinc-900/80">
              <div class="flex gap-2">
                <input
                  class="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-hermes-cyan"
                  placeholder="Message this profile..."
                  value={input()}
                  onInput={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  onClick={sendMessage}
                  disabled={isStreaming()}
                  class="px-4 py-2 bg-hermes-cyan text-black rounded text-sm font-medium disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <div class="text-[10px] text-zinc-500 mt-1 px-1">
                Debug: port={props.gatewayPort ?? 'default'} | profile={props.profileName}
              </div>
            </div>
          </Show>
        </div>
      </Portal>
    </Show>
  );
}
