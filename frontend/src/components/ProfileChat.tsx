/**
 * ProfileChat — Per-profile floating chat modal
 * Routes through the backend gateway proxy (/gp) which handles
 * profile port + auth key resolution from the profile's .env.
 * Falls back to global gateway auth when no profile name is given.
 * Full feature parity with the old ModalChat: IndexedDB persistence,
 * slash commands, voice input, file attachment, token usage.
 */

import { createSignal, createEffect, onMount, onCleanup, For, Show, Index } from 'solid-js';
import { Portal } from 'solid-js/web';
import MessageContent from '../components/MessageContent';
import { apiUrl } from '../lib/api-base';

interface ProfileChatProps {
  profileId: string;
  profileName: string;
  gatewayPort?: number;
  apiKey?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

const DB_NAME = 'don-profile-chat-db';
const STORE_NAME = 'chat-state';

function getStateKey(profileId: string) {
  return `profile-chat-${profileId}`;
}

// Lightweight IndexedDB helpers
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveState(profileId: string, data: any) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ key: getStateKey(profileId), ...data, updatedAt: Date.now() });
    tx.oncomplete = () => db.close();
  } catch (e) {
    console.warn(`[ProfileChat:${profileId}] IndexedDB save failed:`, e);
  }
}

async function loadState(profileId: string): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(getStateKey(profileId));
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/new', desc: 'Start a new conversation' },
  { cmd: '/clear', desc: 'Clear chat history' },
  { cmd: '/stop', desc: 'Stop streaming response' },
  { cmd: '/retry', desc: 'Retry last user message' },
  { cmd: '/status', desc: 'Show gateway status' },
  { cmd: '/model <name>', desc: 'Change model (e.g. /model qwen3.6)' },
  { cmd: '/steer <mode>', desc: 'Busy mode (queue|steer|interrupt|status)' },
  { cmd: '/bg <prompt>', desc: 'Run prompt in background' },
  { cmd: '/queue <prompt>', desc: 'Queue message for later' },
  { cmd: '/compact', desc: 'Compress current session' },
  { cmd: '/session list', desc: 'List session clusters' },
  { cmd: '/profile [name]', desc: 'Switch or show profile' },
];

export default function ProfileChat(props: ProfileChatProps) {
  // Route through the backend gateway proxy — auth handled server-side
  const apiBase = apiUrl('/gp');

  const [isOpen, setIsOpen] = createSignal(true);
  const [messages, setMessages] = createSignal<Message[]>([
    { role: 'assistant', content: `Hello! Profile chat ready for ${props.profileName}.` },
  ]);
  const [input, setInput] = createSignal('');
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [isMinimized, setIsMinimized] = createSignal(false);
  const [position, setPosition] = createSignal({
    x: Math.max(60, window.innerWidth - 520),
    y: 80,
  });
  const [isDragging, setIsDragging] = createSignal(false);
  const [isResizing, setIsResizing] = createSignal(false);
  const [size, setSize] = createSignal({ width: 720, height: 620 });
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  const [modelInfo, setModelInfo] = createSignal({ name: 'Qwen3.6-27B-FP8', context: 262111 });
  const [showSlash, setShowSlash] = createSignal(false);
  const [slashFilter, setSlashFilter] = createSignal('');

  // Rotating thinking phrases
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
  let dragStart = { x: 0, y: 0 };
  let dragPosStart = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0 };
  let resizeSizeStart = { width: 0, height: 0 };
  let saveTimeout: number | null = null;
  let fileInputRef: HTMLInputElement | undefined;
  let messagesEndRef: HTMLDivElement | undefined;
  let abortController: AbortController | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  // Auto-scroll on new messages
  let prevMsgCount = 0;
  const scrollToBottom = () => {
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const log = (msg: string, data?: unknown) => {
    console.log(`[ProfileChat:${props.profileName}] ${msg}`, data ?? '');
  };

  // ── Thinking animation ──

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

  // ── State persistence ──

  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      saveState(props.profileId, {
        position: position(),
        size: size(),
        messages: messages(),
        sessionId: sessionId(),
      });
    }, 400);
  }

  // ── Slash commands ──

  const filteredCommands = () => {
    const f = slashFilter().toLowerCase();
    return SLASH_COMMANDS.filter(c =>
      c.cmd.toLowerCase().includes(f) || c.desc.toLowerCase().includes(f)
    );
  };

  async function handleSlashCommand(cmd: string): Promise<boolean> {
    if (cmd === '/help') {
      const list = SLASH_COMMANDS.map(c => `${c.cmd} — ${c.desc}`).join('\n');
      setMessages(prev => [...prev, { role: 'assistant', content: `**Available commands:**\n${list}` }]);
      return true;
    }
    if (cmd === '/new' || cmd === '/clear') {
      setMessages([{ role: 'assistant', content: `Chat cleared. Ready for ${props.profileName}.` }]);
      setSessionId(null);
      return true;
    }
    if (cmd === '/stop') {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      if (reader) {
        reader.cancel().catch(() => {});
        reader = null;
      }
      setIsStreaming(false);
      stopThinkingAnimation();
      return true;
    }
    if (cmd === '/retry') {
      const msgs = messages();
      const lastUser = [...msgs].reverse().find(m => m.role === 'user');
      if (lastUser) {
        setInput(lastUser.content);
        const lastMsg = msgs[msgs.length - 1];
        const popCount = lastMsg.role === 'user' ? 1 : 2;
        setMessages(prev => prev.slice(0, -popCount));
      }
      return true;
    }
    if (cmd.startsWith('/model ')) {
      const model = cmd.slice(7).trim();
      if (model) {
        setModelInfo(prev => ({ ...prev, name: model }));
        setMessages(prev => [...prev, { role: 'assistant', content: `Model set to **${model}**.` }]);
      }
      return true;
    }
    if (cmd === '/status') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Profile:** ${props.profileName}\n**Gateway:** /gp proxy\n**Model:** ${modelInfo().name}\n**Port:** ${props.gatewayPort ?? 'default'}\n**Session:** ${sessionId() ?? 'none'}`,
      }]);
      return true;
    }
    return false;
  }

  // ── Voice input ──

  async function startVoiceInput() {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert('Voice input not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setTimeout(() => sendMessage(), 50);
    };
    recognition.onerror = (e: any) => console.error(`[ProfileChat:${props.profileName}] Voice error:`, e);
    recognition.start();
  }

  function handleGlobalKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      startVoiceInput();
    }
  }

  // ── File attachment ──

  function triggerFilePicker() {
    fileInputRef?.click();
  }

  async function handleFileAttach(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const fileMsg: Message = {
        role: 'user',
        content: `[Attached: ${file.name}]\n${base64.substring(0, 200)}...`,
      };
      setMessages(prev => [...prev, fileMsg]);
      scheduleSave();
    };
    reader.readAsDataURL(file);
    target.value = '';
  }

  // ── Model info ──

  async function fetchModelInfo() {
    try {
      const headers: Record<string, string> = {};
      if (props.profileName) headers['X-Hermes-Profile'] = props.profileName;
      const res = await fetch(`${apiBase}/v1/models`, { headers });
      if (res.ok) {
        const data = await res.json();
        const model = data.data?.[0];
        if (model) {
          setModelInfo({
            name: model.id || 'grok-4.3',
            context: model.context_length || 10000000,
          });
        }
      }
    } catch {
      console.warn(`[ProfileChat:${props.profileName}] fetchModelInfo failed`);
    }
  }

  // ── Drag ──

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
    // Boundary clamping
    const s = size();
    nx = Math.max(0, Math.min(nx, window.innerWidth - s.width));
    ny = Math.max(0, Math.min(ny, window.innerHeight - s.height));
    setPosition({ x: nx, y: ny });
  };

  const endDrag = () => {
    setIsDragging(false);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', endDrag);
    scheduleSave();
  };

  // ── Resize ──

  const startResize = (e: MouseEvent) => {
    if (isMinimized()) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart = { x: e.clientX, y: e.clientY };
    resizeSizeStart = { ...size() };
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', endResize);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing()) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    let nw = resizeSizeStart.width + dx;
    let nh = resizeSizeStart.height + dy;
    nw = Math.max(400, Math.min(nw, window.innerWidth - 80));
    nh = Math.max(300, Math.min(nh, window.innerHeight - 80));
    setSize({ width: nw, height: nh });
  };

  const endResize = () => {
    setIsResizing(false);
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', endResize);
    scheduleSave();
  };

  // ── Close ──

  const closeModal = () => {
    log('Closing profile chat');
    setIsOpen(false);
    setIsMinimized(false);
    window.dispatchEvent(new CustomEvent('profile-chat-close', { detail: { id: props.profileId } }));
  };

  // ── Send message (streaming via Runs API) ──

  const stopStreaming = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (reader) {
      reader.cancel().catch(() => {});
      reader = null;
    }
    setIsStreaming(false);
    stopThinkingAnimation();
  };

  const sendMessage = async () => {
    const text = input().trim();
    if (!text) return;

    // Handle /stop while streaming — bypass isStreaming guard
    if (text.startsWith('/')) {
      if (text === '/stop') {
        setInput('');
        stopStreaming();
        return;
      }
      // Other slash commands are handled after the isStreaming check
    }

    if (isStreaming()) return;
    if (abortController) {
      log('Previous stream still active, preventing concurrent send');
      return;
    }

    // Handle slash commands (non-stop)
    if (text.startsWith('/')) {
      setInput('');
      const handled = await handleSlashCommand(text);
      if (handled) return;
    }

    log('Sending message', { text });

    const userMsg: Message = { role: 'user', content: text };
    const currentMessages = messages();
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    startThinkingAnimation();

    const assistantPlaceholder: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);

    let fullContent = '';
    abortController = new AbortController();
    const signal = abortController.signal;
    reader = null;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (props.profileName) headers['X-Hermes-Profile'] = props.profileName;

      const body: any = {
        input: text,
        stream: true,
        conversation_history: currentMessages.map(m => ({ role: m.role, content: m.content })),
      };
      if (sessionId()) body.session_id = sessionId();

      const createTimeout = setTimeout(() => abortController?.abort(), 60000);
      const createRes = await fetch(`${apiBase}/v1/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      clearTimeout(createTimeout);

      log('Response status', createRes.status);

      if (!createRes.ok) {
        throw new Error(`Gateway error: ${createRes.status}`);
      }

      const runData = await createRes.json();
      const runId = runData.run_id;
      if (!runId) throw new Error('No run_id returned');

      if (runData.session_id) {
        setSessionId(runData.session_id);
      }

      // Stream events
      const streamHeaders: Record<string, string> = { 'Accept': 'text/event-stream' };
      if (props.profileName) streamHeaders['X-Hermes-Profile'] = props.profileName;

      const streamRes = await fetch(`${apiBase}/v1/runs/${runId}/events`, { headers: streamHeaders, signal });
      if (!streamRes.ok || !streamRes.body) {
        const errorMsg = `Stream failed: ${streamRes.status}`;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') last.content = errorMsg;
          return updated;
        });
        throw new Error(errorMsg);
      }

      reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      streamLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            // Check for requestCancelled cancellation event
            if (data.includes('"requestCancelled"') || data.includes('"cancelled"')) {
              fullContent += '\n\n*Generation cancelled.*';
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (newMessages[lastIndex]?.role === 'assistant') {
                  newMessages[lastIndex] = { ...newMessages[lastIndex], content: fullContent };
                }
                return newMessages;
              });
              // Break out of SSE loop — don't wait for more events
              reader?.cancel().catch(() => {});
              reader = null;
              break streamLoop;
            }
            try {
              const event = JSON.parse(data);
              if (event.event === "message.delta" && event.delta) {
                fullContent += event.delta;
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex]?.role === 'assistant') {
                    newMessages[lastIndex] = { ...newMessages[lastIndex], content: newMessages[lastIndex].content + event.delta };
                  }
                  return newMessages;
                });
              }
              if (event.event === "run.completed" && event.usage) {
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex]?.role === 'assistant') {
                    newMessages[lastIndex] = { ...newMessages[lastIndex], usage: event.usage };
                  }
                  return newMessages;
                });
              }
            } catch (parseErr) {
              console.warn(`[ProfileChat:${props.profileName}] SSE parse error:`, parseErr);
            }
          }
        }
      }

      log('Received response');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        log('Request aborted');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        log('Error sending message', msg);
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') last.content = fullContent || `Error: ${msg}`;
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      stopThinkingAnimation();
      if (reader) {
        reader.cancel().catch(() => {});
        reader = null;
      }
      abortController = null;
      scheduleSave();
    }
  };

  // ── Key handlers ──

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  const handleInput = (e: Event) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    setInput(val);
    if (val.startsWith('/')) {
      setShowSlash(true);
      setSlashFilter(val.slice(1));
    } else {
      setShowSlash(false);
    }
  };

  // ── Lifecycle ──

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    const count = messages().length;
    if (count > prevMsgCount) {
      prevMsgCount = count;
      // Defer to next frame so DOM has rendered
      requestAnimationFrame(() => scrollToBottom());
    }
  });

  onMount(async () => {
    document.addEventListener('keydown', handleGlobalKey);
    log('Mounted', { gatewayPort: props.gatewayPort, profileId: props.profileId });

    // Restore persisted state
    const saved = await loadState(props.profileId);
    if (saved) {
      if (saved.position) setPosition(saved.position);
      if (saved.size) setSize(saved.size);
      if (saved.messages && saved.messages.length > 0) setMessages(saved.messages);
      if (saved.sessionId) setSessionId(saved.sessionId);
    }

    fetchModelInfo();
  });

  onCleanup(() => {
    log('Cleanup');
    document.removeEventListener('keydown', handleGlobalKey);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', endResize);
    if (saveTimeout) clearTimeout(saveTimeout);
    stopStreaming();
  });

  // ── Render ──

  return (
    <Show when={isOpen()}>
      <Portal>
        <div
          class="fixed z-[999999] bg-zinc-950 text-zinc-100 shadow-2xl border border-zinc-800 flex flex-col overflow-hidden rounded-2xl relative"
        style={{
          position: 'fixed',
          left: `${position().x}px`,
          top: `${position().y}px`,
          width: isMinimized() ? 'auto' : `${size().width}px`,
          height: isMinimized() ? 'auto' : `${size().height}px`,
        }}
      >
          {/* Header */}
          <div
            class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/90 cursor-move select-none"
            onMouseDown={startDrag}
          >
            <div class="flex items-center gap-3">
              <div class="font-semibold">{props.profileName} Chat</div>
              {props.gatewayPort && (
                <div class="px-1.5 py-0.5 text-[10px] rounded bg-emerald-900/30 text-emerald-400 border border-emerald-700 font-mono">
                  :{props.gatewayPort}
                </div>
              )}
              <div class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                {modelInfo().name} · {Math.floor(modelInfo().context / 1000)}k
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

          {/* Body */}
          <Show when={!isMinimized()}>
            {/* Messages */}
            <div class="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <Index each={messages()}>
                {(msg, index) => (
                  <div class={`flex ${msg().role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      class={`max-w-[80%] px-4 py-2 rounded-2xl ${
                        msg().role === 'user'
                          ? 'bg-blue-600'
                          : 'bg-zinc-900 border border-zinc-800'
                      }`}
                    >
                      <MessageContent
                        content={msg().content}
                        streaming={isStreaming() && index === messages().length - 1 && msg().role === 'assistant'}
                      />
                      {msg().usage && (
                        <div class="text-[10px] text-zinc-500 mt-1.5 px-1 opacity-70">
                          {msg().usage.input_tokens} in • {msg().usage.output_tokens} out • {msg().usage.total_tokens} total
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Index>
              <Show when={isStreaming()}>
                <div class="text-xs text-zinc-400 flex items-center gap-2 px-1">
                  <div class="flex gap-1">
                    <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                    <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
                    <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
                  </div>
                  <span>{thinkingText()}</span>
                </div>
              </Show>
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div class="border-t border-zinc-800 p-4">
              <div class="flex gap-2 items-center">
                <input type="file" ref={fileInputRef} class="hidden" onChange={handleFileAttach} />
                <button
                  onClick={triggerFilePicker}
                  class="px-2 py-1 text-xs border border-zinc-700 rounded hover:bg-zinc-800"
                  title="Attach file"
                >
                  📎
                </button>
                <button
                  onClick={startVoiceInput}
                  class="px-2 py-1 text-xs border border-zinc-700 rounded hover:bg-zinc-800"
                  title="Voice input (Ctrl/Cmd+B)"
                >
                  🎤
                </button>
                <div class="relative flex-1">
                  <input
                    class="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm outline-none"
                    placeholder="Message... (type / for commands)"
                    value={input()}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={isStreaming() && input().trim() !== '/stop'}
                  />
                  <Show when={showSlash()}>
                    <div class="absolute bottom-full mb-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-48 overflow-auto z-50 text-sm">
                      <For each={filteredCommands()}>
                        {(cmd) => (
                          <div
                            class="px-4 py-1.5 hover:bg-zinc-800 cursor-pointer flex justify-between"
                            onClick={() => {
                              setInput(cmd.cmd + ' ');
                              setShowSlash(false);
                              setSlashFilter('');
                            }}
                          >
                            <span class="font-mono text-emerald-400">{cmd.cmd}</span>
                            <span class="text-zinc-400 text-xs">{cmd.desc}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
                <button
                  onClick={sendMessage}
                  class={`px-6 py-2 rounded-xl text-sm font-medium ${isStreaming() ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600'}`}
                >
                  {isStreaming() ? 'Stop' : 'Send'}
                </button>
              </div>
            </div>
          </Show>

          {/* Resize handle */}
          <Show when={!isMinimized()}>
            <div
              class="absolute bottom-1 right-1 w-5 h-5 cursor-se-resize z-[1000000] flex items-center justify-center text-zinc-400 hover:text-zinc-200 select-none rounded"
              style={{ 'user-select': 'none', 'font-size': '14px' }}
              onMouseDown={startResize}
              title="Resize"
            >
              ⤡
            </div>
          </Show>
        </div>
      </Portal>
    </Show>
  );
}
