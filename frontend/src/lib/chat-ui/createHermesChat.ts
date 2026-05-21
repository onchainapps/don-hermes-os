import { createSignal, onCleanup } from 'solid-js';
import type { Message } from './types';
import { profileChatStore } from '../profileChatStore';
import { getSharedGatewayClient } from '../gatewayClient';

export interface HermesChatConfig {
  conversationId?: string;
  label?: string;
  profile?: string;
  context?: string;
  persist?: boolean;
  persistKey?: string;
  initialRunId?: string;
}

export type ReconnectionStatus = 'idle' | 'reconnecting' | 'reconnected' | 'failed';

export interface HermesChatSession {
  messages: () => Message[];
  streaming: () => boolean;
  error: () => string | null;
  sessionId: () => string | null;
  activeRunId: () => string | null;
  reconnectionStatus: () => ReconnectionStatus;
  label?: string;
  conversationId?: string;

  send: (text: string, images?: string[]) => Promise<void>;
  stop: () => void;
  clear: () => void;
  newSession: () => void;
  slash: (command: string, args?: string) => Promise<void>;
  loadMessages: (msgs: Message[]) => void;
  connect?: () => Promise<void>;
}

export function createHermesChat(config: HermesChatConfig = {}): HermesChatSession {
  const { label, profile, conversationId } = config;

  // === PREFERRED PATH: Profile-based chats use the central store ===
  // Listener management is now the responsibility of the consumer
  // for clean separation and to avoid duplicate listeners.
  if (profile) {
    const client = profileChatStore.getOrCreateClient(profile);
    client.connect().catch(() => {});

    return {
      messages: () => profileChatStore.getMessages(profile) as unknown as Message[],
      streaming: () => profileChatStore.getIsStreaming(profile),
      error: () => null,
      sessionId: () => null,
      activeRunId: () => null,
      reconnectionStatus: () => 'idle' as ReconnectionStatus,
      label,
      conversationId,

      send: async (text: string) => {
        profileChatStore.addUserMessage(profile, text);
        profileChatStore.setStreaming(profile, true);
        await client.sendChat(
          text,
          profileChatStore.getMessages(profile).map(m => ({ role: m.role, content: m.content })),
          label,
          profile
        );
      },

      stop: () => {
        profileChatStore.setStreaming(profile, false);
        profileChatStore.clearListener(profile);
      },

      clear: () => profileChatStore.resetProfile(profile),
      newSession: () => profileChatStore.resetProfile(profile),
      slash: async () => {},
      loadMessages: (msgs) => profileChatStore.replaceMessages(profile, msgs as any),
      connect: () => client.connect(),
    };
  }

  // === LEGACY NON-PROFILE PATH ===
  console.warn('[createHermesChat] No profile provided — using legacy path');

  const gw = getSharedGatewayClient();
  gw.connect().catch(() => {});

  const [messages, setMessages] = createSignal<Message[]>([]);
  const [streaming, setStreaming] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [activeRunId, setActiveRunId] = createSignal<string | null>(null);

  const unsub = gw.on('*', (ev: any) => {
    const data = ev.data || ev;

    if (data.type === 'run_id') {
      setActiveRunId(data.run_id);
      setStreaming(true);
    }

    if (data.type === 'event' && data.data?.type === 'message.delta') {
      const delta = data.data.content || data.data.delta || '';
      if (delta) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + delta } as Message];
          }
          return [...prev, { role: 'assistant', content: delta, timestamp: Date.now() } as Message];
        });
      }
    }

    if (data.type === 'event' && (data.data?.type === 'message.complete' || data.data?.type === 'run.completed')) {
      setStreaming(false);
    }

    if (data.type === 'error') {
      setError(data.message || 'Error');
      setStreaming(false);
    }
  });

  onCleanup(() => unsub());

  const session: any = {
    messages: () => messages(),
    streaming: () => streaming(),
    error: () => error(),
    sessionId: () => null,
    activeRunId: () => activeRunId(),
    reconnectionStatus: () => 'idle' as ReconnectionStatus,
    label,
    conversationId,

    send: async (text: string) => {
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() } as Message]);
      setStreaming(true);
      setError(null);

      await gw.sendChat(
        text,
        messages().map(m => ({ role: m.role, content: m.content })),
        label
      );
    },

    stop: () => {
      setStreaming(false);
      gw.cancel(activeRunId() || undefined);
    },

    clear: () => setMessages([]),
    newSession: () => {
      setMessages([]);
      setActiveRunId(null);
    },
    slash: async () => {},
    loadMessages: (msgs) => setMessages(msgs),
    connect: () => gw.connect(),
  };

  // Expose the underlying GatewayClient for advanced consumers
  session.gw = gw;
  session._gw = gw;

  return session;
}
