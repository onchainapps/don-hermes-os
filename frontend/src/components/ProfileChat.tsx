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
import { saveSession, loadSession } from '../lib/chat-persist';

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

let _sending = false;

const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/new', desc: 'Start a new conversation' },
  { cmd: '/clear', desc: 'Clear chat history' },
  { cmd: '/stop', desc: 'Stop streaming response' },
  { cmd: '/retry', desc: 'Retry last user message' },
  { cmd: '/status', desc: 'Show gateway status' },
  { cmd: '/model', desc: 'Interactive model picker (opens selector dialog)' },
  { cmd: '/steer <mode>', desc: 'Busy mode (queue|steer|interrupt|status)' },
  { cmd: '/bg <prompt>', desc: 'Run prompt in background' },
  { cmd: '/queue <prompt>', desc: 'Queue message for later' },
  { cmd: '/compact', desc: 'Compress current session' },
  { cmd: '/session list', desc: 'List session clusters' },
  { cmd: '/profile [name]', desc: 'Switch or show profile' },
];

interface ModelEntry {
  id: string;
  label: string;
  provider: string;
  context: number;
}

const AVAILABLE_MODELS: ModelEntry[] = [
  { id: 'nous/hermes-3', label: 'Hermes 3', provider: 'Nous', context: 128000 },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'DeepSeek', context: 10000000 },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI', context: 128000 },
  { id: 'openai/o3-mini', label: 'o3-mini', provider: 'OpenAI', context: 200000 },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', provider: 'Anthropic', context: 200000 },
  { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4', provider: 'Anthropic', context: 200000 },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', context: 1000000 },
  { id: 'Qwen3.6-27B-FP8', label: 'Qwen 3.6 27B FP8 (Local)', provider: 'Local (SGLang)', context: 262111 },
  { id: 'meta/llama-4', label: 'Llama 4', provider: 'Meta', context: 128000 },
  { id: 'mistral/mistral-large', label: 'Mistral Large', provider: 'Mistral', context: 128000 },
  { id: 'xai/grok-4', label: 'Grok 4', provider: 'xAI', context: 10000000 },
  { id: 'cohere/command-r7', label: 'Command R7', provider: 'Cohere', context: 128000 },
];

export default function ProfileChat(props: ProfileChatProps) {
  // Route through the backend gateway proxy — auth handled server-side
  const apiBase = apiUrl('/gp');

  const [isOpen, setIsOpen] = createSignal(true);
  const [messages, setMessages] = createSignal<Message[]>([
    { role: 'assistant', content: `Hello! Profile chat ready for ${props.profileName}.` },
  ]);
  const [input, setInput] = createSignal('');
  // ── State signals ──
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [isThinking, setIsThinking] = createSignal(false);
  const [isReconnecting, setIsReconnecting] = createSignal(false);
  const [runId, setRunId] = createSignal<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = createSignal(0);
  const MAX_RECONNECT = 5;
  const RECONNECT_BASE_MS = 500;
  const pendingTool: { id: string; name: string; startTime: number }[] = [];
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
  const [showModelPicker, setShowModelPicker] = createSignal(false);
  const [modelSearch, setModelSearch] = createSignal('');
  const [savingModel, setSavingModel] = createSignal(false);
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
    setIsThinking(true);
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
    setIsThinking(false);
  }
  // ── State persistence ── ──

  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      const scope = `profile-chat-${props.profileId}`;
      saveSession(scope, {
        sessionId: sessionId(),
        messages: messages(),
        streaming: isStreaming(),
        position: position(),
        size: size(),
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
    if (cmd === '/model' || cmd.startsWith('/model ')) {
      setShowModelPicker(true);
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

  async function loadConfig() {
    try {
      const res = await fetch(apiUrl(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(props.profileName)}`));
      if (res.ok) {
        const data = await res.json();
        const yaml = data.yaml;
        const modelMatch = yaml.match(/^model:\s*\n\s+default:\s+(.+)/m);
        if (modelMatch) {
          setModelInfo(prev => ({ ...prev, name: modelMatch[1].trim() }));
        }
        const ctxMatch = yaml.match(/context_length:\s*(\d+)/);
        if (ctxMatch) {
          setModelInfo(prev => ({ ...prev, context: parseInt(ctxMatch[1]) }));
        }
      }
    } catch (e) {
      console.warn(`[ProfileChat] Failed to load config`, e);
    }
  }

  async function saveModel(modelId: string) {
    setSavingModel(true);
    try {
      const getRes = await fetch(apiUrl(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(props.profileName)}`));
      let yaml = '';
      if (getRes.ok) {
        const data = await getRes.json();
        yaml = data.yaml;
      }
      if (yaml.includes('model:')) {
        if (yaml.includes('default:')) {
          yaml = yaml.replace(/^(\s+)default:\s.*$/m, `$1default: ${modelId}`);
        } else {
          yaml = yaml.replace(/^model:\s*$/m, `model:\n  default: ${modelId}`);
        }
      } else {
        yaml = `model:\n  default: ${modelId}\n` + yaml;
      }
      const putRes = await fetch(apiUrl(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(props.profileName)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml_text: yaml }),
      });
      if (putRes.ok) {
        setModelInfo(prev => ({ ...prev, name: modelId }));
      }
    } catch (e) {
      console.warn(`[ProfileChat] Failed to save model`, e);
    }
    setSavingModel(false);
    setShowModelPicker(false);
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

    if (_sending) return;
    _sending = true;

    // Handle slash commands (non-stop)
    if (text.startsWith('/')) {
      setInput('');
      const handled = await handleSlashCommand(text);
      if (handled) { _sending = false; return; }
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
      const rId = runData.run_id;
      if (!rId) throw new Error('No run_id returned');
      setRunId(rId);
      if (runData.session_id) {
        setSessionId(runData.session_id);
      }

      // Stream events
      const streamHeaders: Record<string, string> = { 'Accept': 'text/event-stream' };
      if (props.profileName) streamHeaders['X-Hermes-Profile'] = props.profileName;

      const streamRes = await fetch(`${apiBase}/v1/runs/${rId}/events`, { headers: streamHeaders, signal });
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
      let userStopped = false;

      async function consumeEvents(
        eventReader: ReadableStreamDefaultReader<Uint8Array>,
        eventDecoder: TextDecoder
      ): Promise<boolean> {
        let innerBuffer = '';
        while (true) {
          const { done, value } = await eventReader.read();
          if (done) { log('Event stream ended'); return true; }
          innerBuffer += eventDecoder.decode(value, { stream: true });
          const evtLines = innerBuffer.split('\n');
          innerBuffer = evtLines.pop() || '';
          for (const line of evtLines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            if (data.includes('"requestCancelled"') || data.includes('"cancelled"')) {
              userStopped = true;
              fullContent += '\n\n*Generation cancelled.*';
              setMessages(prev => {
                const newMsgs = [...prev];
                const lastIdx = newMsgs.length - 1;
                if (newMsgs[lastIdx]?.role === 'assistant') {
                  newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent };
                }
                return newMsgs;
              });
              return true;
            }
            try {
              const event = JSON.parse(data);
              if (event.event === 'message.delta' && event.delta) {
                fullContent += event.delta;
                setIsThinking(false);
                setMessages(prev => {
                  const newMsgs = [...prev];
                  const lastIdx = newMsgs.length - 1;
                  if (newMsgs[lastIdx]?.role === 'assistant') {
                    newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: newMsgs[lastIdx].content + event.delta };
                  }
                  return newMsgs;
                });
              }
              if (event.event === 'reasoning.available' && event.text) {
                setIsThinking(true);
              }
              if (event.event === 'tool.started' && (event as any).tool) {
                log(`Tool started: ${(event as any).tool.name}`);
              }
              if (event.event === 'tool.completed' && (event as any).tool) {
                log(`Tool completed: ${(event as any).tool.name}`);
              }
              if (event.event === 'run.completed') {
                if (event.output) fullContent = event.output;
                if (event.usage) {
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastIdx = newMsgs.length - 1;
                    if (newMsgs[lastIdx]?.role === 'assistant') {
                      newMsgs[lastIdx] = { ...newMsgs[lastIdx], usage: event.usage };
                    }
                    return newMsgs;
                  });
                }
                return true;
              }
            } catch (e) {
              console.warn(`[ProfileChat:${props.profileName}] SSE parse error:`, e);
            }
          }
        }
      }

      // ── Reconnect on stream drop ──
      try {
        const ok = await consumeEvents(reader!, decoder);
        reader = null;
        if (!ok) log('Stream ended without run.completed');
      } catch (err2: any) {
        if (userStopped) {
          log('Stopped by user');
        } else if (err2?.name === 'AbortError') {
          log('Stream aborted — attempting reconnect');
          reader = null;
          if (rId && !userStopped) {
            setIsReconnecting(true);
            let recovered = false;
            for (let attempt = 0; attempt < MAX_RECONNECT; attempt++) {
              setReconnectAttempts(attempt);
              await new Promise(r => setTimeout(r, RECONNECT_BASE_MS * Math.pow(2, attempt)));
              if (userStopped) break;
              try {
                const statusRes = await fetch(`${apiBase}/v1/runs/${rId}`, {
                  headers: props.profileName ? { 'X-Hermes-Profile': props.profileName } : {},
                  signal: AbortSignal.timeout(8000),
                });
                if (!statusRes.ok) { log('Status poll failed:', statusRes.status); continue; }
                const statusData = await statusRes.json();
                if (statusData.status === 'completed') {
                  log('Run completed during disconnect, using output');
                  if (statusData.output) {
                    fullContent += statusData.output;
                    setMessages(prev => {
                      const newMsgs = [...prev];
                      const lastIdx = newMsgs.length - 1;
                      if (newMsgs[lastIdx]?.role === 'assistant') {
                        newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent };
                      }
                      return newMsgs;
                    });
                  }
                  if (statusData.usage) {
                    setMessages(prev => {
                      const newMsgs = [...prev];
                      const lastIdx = newMsgs.length - 1;
                      if (newMsgs[lastIdx]?.role === 'assistant') {
                        newMsgs[lastIdx] = { ...newMsgs[lastIdx], usage: statusData.usage };
                      }
                      return newMsgs;
                    });
                  }
                  recovered = true;
                  break;
                }
                if (statusData.status === 'running') {
                  const streamRes2 = await fetch(`${apiBase}/v1/runs/${rId}/events`, {
                    headers: streamHeaders,
                    signal: AbortSignal.timeout(120000),
                  });
                  if (streamRes2.ok && streamRes2.body) {
                    const ok2 = await consumeEvents(streamRes2.body.getReader(), decoder);
                    if (ok2) { recovered = true; break; }
                  }
                }
              } catch (pollErr: any) {
                log('Reconnect error:', pollErr.message || pollErr);
              }
            }
            setIsReconnecting(false);
            setReconnectAttempts(0);
            if (!recovered) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') last.content = fullContent || '*Connection lost. Try resending.*';
                return updated;
              });
            }
          }
        } else {
          log('Stream consumer error', err2);
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') last.content = fullContent || '*Stream error.*';
            return updated;
          });
        }
      }

      log('Received response');
    } catch (err: unknown) {
      if (err instanceof DOMException && (err as DOMException).name === 'AbortError') {
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
      _sending = false;
      setIsStreaming(false);
      stopThinkingAnimation();
      setReconnectAttempts(0);
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
    const saved = await loadSession(`profile-chat-${props.profileId}`);
    if (saved) {
      if (saved.position) setPosition(saved.position);
      if (saved.size) setSize(saved.size);
      if (saved.messages && saved.messages.length > 0) setMessages(saved.messages);
      if (saved.sessionId) setSessionId(saved.sessionId);
    }

    fetchModelInfo();
    loadConfig();
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

  function groupedModels() {
    const search = modelSearch().toLowerCase();
    const filtered = search
      ? AVAILABLE_MODELS.filter(m => m.label.toLowerCase().includes(search) || m.id.toLowerCase().includes(search))
      : AVAILABLE_MODELS;
    const groups: { provider: string; models: ModelEntry[] }[] = [];
    const seen = new Set<string>();
    for (const m of filtered) {
      if (!seen.has(m.provider)) {
        seen.add(m.provider);
        groups.push({ provider: m.provider, models: filtered.filter(x => x.provider === m.provider) });
      }
    }
    return groups;
  }

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
              <Show when={isThinking() || isReconnecting()}>
                <div class="flex items-center gap-2 px-1 text-xs text-zinc-400">
                  <div class="flex gap-1">
                    <Show when={isStreaming()}>
                      <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                      <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
                      <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
                    </Show>
                    <Show when={isReconnecting()}>
                      <div class="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                    </Show>
                  </div>
                  <span>
                    <Show when={isReconnecting()} fallback={<span>{thinkingText()}</span>}>
                      Reconnecting… {reconnectAttempts() > 0 && `(attempt ${reconnectAttempts() + 1}/${MAX_RECONNECT})`}
                    </Show>
                  </span>
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

        <Show when={showModelPicker()}>
          <div
            class="fixed inset-0 z-[1000001] bg-black/60 flex items-center justify-center"
            onClick={() => setShowModelPicker(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowModelPicker(false); }}
            tabIndex={-1}
          >
            <div
              class="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-[520px] max-h-[640px] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <h2 class="text-lg font-semibold">Select Model</h2>
                <button
                  onClick={() => setShowModelPicker(false)}
                  class="text-zinc-400 hover:text-zinc-200 text-xl leading-none"
                >✕</button>
              </div>

              <div class="px-5 py-3">
                <input
                  class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 placeholder-zinc-500"
                  placeholder="Search models..."
                  value={modelSearch()}
                  onInput={(e) => setModelSearch((e.target as HTMLInputElement).value)}
                />
              </div>

              <div class="flex-1 overflow-y-auto px-5 pb-4">
                <Show when={!savingModel()} fallback={
                  <div class="flex items-center justify-center py-12 text-zinc-400 text-sm">
                    <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving model...
                  </div>
                }>
                  <For each={groupedModels()}>
                    {(group) => (
                      <div>
                        <div class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-4 mb-2">{group.provider}</div>
                        <For each={group.models}>
                          {(model) => {
                            const isCurrent = model.id === modelInfo().name;
                            return (
                              <div
                                class={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm ${
                                  isCurrent
                                    ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50'
                                    : 'text-zinc-300 hover:bg-zinc-800'
                                }`}
                                onClick={() => saveModel(model.id)}
                              >
                                <div class="flex flex-col">
                                  <span>{model.label}</span>
                                  <span class="text-[11px] text-zinc-500 font-mono">{model.id}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                  <span class="text-[11px] text-zinc-500">{Math.floor(model.context / 1000)}k</span>
                                  <Show when={isCurrent}>
                                    <svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </Show>
                                </div>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </Portal>
    </Show>
  );
}
