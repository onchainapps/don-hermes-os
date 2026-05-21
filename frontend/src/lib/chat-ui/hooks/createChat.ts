// createChat — headless chat hook (SolidJS)
// Manages session state, message history, streaming integration.
// Transport-agnostic: the consumer provides a `send` function.

import { createSignal, createMemo, onMount, onCleanup, createEffect } from 'solid-js';
import type { Message, ToolCall, ActivityItem, MessageRole } from '../types';
import type { StreamingState } from '../types';
import { generateId as generateMsgId } from '../types';
import { createStreaming } from './createStreaming';

export interface CreateChatOptions {
  // Called when a message needs to be sent. Returns a Promise<Response> for SSE streaming.
  // If null, the hook waits for an external call to sendMessage().
  send?: (
    text: string,
    sessionId: string | null,
    messageHistory: Message[]
  ) => Promise<Response>;

  // Optional: called after send completes, for logging/tracking
  onSendComplete?: (message: Message, sessionId: string | null) => void;

  // Optional: initial messages (e.g., loaded from storage)
  initialMessages?: Message[];

  // Optional: initial session ID
  sessionId?: string | null;

  // Optional: callback when session changes
  onSessionChange?: (sessionId: string | null) => void;
}

export interface CreateChatReturn {
  // State (accessors / signal values)
  messages: () => Message[];
  sessionId: () => string | null;
  streaming: () => boolean;
  statusText: () => string;
  activityLog: () => ActivityItem[];
  streamingToolCalls: () => ToolCall[];
  streamingFullText: () => string;

  // Actions
  sendMessage: (text: string, images?: string[]) => void;
  stopStreaming: () => void;
  clearMessages: () => void;
  newSession: () => void;
  loadSession: (messages: Message[]) => void;
  addActivity: (item: ActivityItem) => void;
  clearActivity: () => void;

  // Status
  isStreaming: () => boolean;
  streamingHook: ReturnType<typeof createStreaming>;
}

const ROLE_LABELS: Record<MessageRole, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
};

function defaultSend(
  text: string,
  sessionId: string | null,
  messageHistory: Message[]
): Promise<Response> {
  const allMsgs = [...messageHistory, { role: 'user' as const, content: text }];
  const apiMessages = allMsgs.map(m => ({
    role: m.role === 'tool' ? 'assistant' : m.role,
    content: m.content,
  }));
  const body = JSON.stringify({
    model: 'hermes-agent',
    messages: apiMessages,
    stream: true,
  });

  return fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Hermes-Session-Id': sessionId } : {}),
    },
    body,
  });
}

export function createChat(options: CreateChatOptions = {}): CreateChatReturn {
  const {
    send = defaultSend,
    onSendComplete,
    initialMessages = [],
    sessionId: initialSessionId = null,
    onSessionChange,
  } = options;

  const [messages, setMessages] = createSignal<Message[]>(initialMessages);
  const [sessionId, setSessionId] = createSignal<string | null>(initialSessionId);
  const [streaming, setStreaming] = createSignal(false);
  const [statusText, setStatusText] = createSignal('');
  const [activityLog, setActivityLog] = createSignal<ActivityItem[]>([]);

  // Streaming state
  const [streamingToolCalls, setStreamingToolCalls] = createSignal<ToolCall[]>([]);
  const [streamingFullText, setStreamingFullText] = createSignal('');

  let lastRequestHeaders: Record<string, string> | null = null;
  let lastRequestBody: string | null = null;

  // Streaming hook
  const streamingHook = createStreaming({
    onChunk: (accumulated) => {
      setStreamingFullText(accumulated);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'streaming') {
          return [...prev.slice(0, -1), { ...last, content: accumulated }];
        }
        return prev;
      });
    },
    onReasoning: (reasoningChunk) => {
      setStatusText('Thinking...');
      // Accumulate reasoning into streaming message
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'streaming') {
          return [...prev.slice(0, -1), {
            ...last,
            reasoning: (last.reasoning || '') + reasoningChunk,
          }];
        }
        return prev;
      });
    },
    onToolCall: (name, _args, _index) => {
      setStatusText(`Using ${name}...`);
      setActivityLog(prev => [...prev.slice(-20), {
        type: 'tool_started',
        label: name,
        emoji: '🔧',
        timestamp: Date.now(),
      }]);
    },
    onComplete: (fullText, toolCalls) => {
      const tcArray = Array.from(toolCalls.values());
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'streaming') {
          return [...prev.slice(0, -1), {
            ...last,
            content: fullText,
            status: 'complete',
            toolCalls: tcArray.length > 0 ? tcArray : undefined,
          }];
        }
        return prev;
      });

      for (const [, tc] of toolCalls) {
        setActivityLog(prev => [...prev, {
          type: 'tool_completed',
          label: tc.name,
          duration: tc.duration,
          emoji: '⚡',
          timestamp: Date.now(),
        }]);
      }

      setStreamingToolCalls(tcArray);
      setStreamingFullText(fullText);
      setStreaming(false);
      setStatusText('');

      onSendComplete?.(
        {
          id: generateMsgId(),
          role: 'assistant',
          content: fullText,
          status: 'complete',
          timestamp: new Date(),
          toolCalls: tcArray,
        },
        sessionId()
      );
    },
    onError: (error) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'streaming') {
          return [...prev.slice(0, -1), {
            ...last,
            content: `Error: ${error}`,
            status: 'error',
          }];
        }
        return prev;
      });
      setStreaming(false);
      setStatusText('');
    },
    onAbort: (partialText, toolCalls) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'streaming') {
          return [...prev.slice(0, -1), {
            ...last,
            content: partialText || '(stopped)',
            status: 'complete',
          }];
        }
        return prev;
      });
      setStreamingToolCalls(Array.from(toolCalls.values()));
      setStreamingFullText(partialText);
      setStreaming(false);
      setStatusText('');
    },
  });

  const sendMessage = async (text: string, images?: string[]) => {
    if (streaming()) return;

    setActivityLog([]);

    // Embed images as markdown in the message content
    let content = text;
    if (images && images.length > 0) {
      content = images.map(img => `![image](${img})`).join('\n') + (text ? '\n\n' + text : '');
    }

    const userMsg: Message = {
      id: generateMsgId(),
      role: 'user',
      content,
      images: images || undefined,
      status: 'complete',
      timestamp: new Date(),
    };

    const assistantMsg: Message = {
      id: generateMsgId(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setStatusText('thinking…');

    try {
      const sid = sessionId();
      const allMsgs = [...messages(), userMsg];

      const res = await send(text, sid, allMsgs);

      // Track session ID from response
      const returnedSid = res.headers.get('X-Hermes-Session-Id');
      if (returnedSid) {
        setSessionId(returnedSid);
        onSessionChange?.(returnedSid);
      }

      // Retry factory
      const retryFactory = async () => {
        const allM = [...messages(), userMsg];
        const apiMsgs = allM.map(m => ({
          role: m.role === 'tool' ? 'assistant' : m.role,
          content: m.content,
        }));
        const body = JSON.stringify({
          model: 'hermes-agent',
          messages: apiMsgs,
          stream: true,
        });

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sid) headers['X-Hermes-Session-Id'] = sid;

        lastRequestHeaders = headers;
        lastRequestBody = body;

        return fetch('/api/chat', { method: 'POST', headers, body });
      };

      await streamingHook.stream(res, retryFactory);
    } catch (err: any) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.status === 'streaming') {
          return [...prev.slice(0, -1), {
            ...last,
            content: `Error: ${err.message}`,
            status: 'error',
          }];
        }
        return prev;
      });
      setStreaming(false);
      setStatusText('');
    }
  };

  const stopStreaming = () => {
    streamingHook.abort();
  };

  const clearMessages = () => {
    setMessages([]);
    setActivityLog([]);
  };

  const newSession = () => {
    setSessionId(null);
    onSessionChange?.(null);
    setMessages([]);
    setActivityLog([]);
    streamingHook.abort();
  };

  const loadSession = (msgList: Message[]) => {
    setMessages(msgList);
  };

  const addActivity = (item: ActivityItem) => {
    setActivityLog(prev => [...prev.slice(-20), item]);
  };

  const clearActivity = () => setActivityLog([]);

  const isStreaming = () => streaming();

  // Cleanup on unmount
  onCleanup(() => {
    streamingHook.abort();
  });

  return {
    messages,
    sessionId,
    streaming,
    statusText,
    activityLog,
    streamingToolCalls,
    streamingFullText,
    sendMessage,
    stopStreaming,
    clearMessages,
    newSession,
    loadSession,
    addActivity,
    clearActivity,
    isStreaming,
    streamingHook,
  };
}
