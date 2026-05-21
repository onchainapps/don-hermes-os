import { createStore } from 'solid-js/store';
import { GatewayClient } from './gatewayClient';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ProfileChatSession {
  messages: ChatMessage[];
  isStreaming: boolean;
  client: GatewayClient | null;
  currentRunId: string | null;
  unsubscribe: (() => void) | null;
}

const [sessions, setSessions] = createStore<Record<string, ProfileChatSession>>({});

function ensureSession(profile: string): ProfileChatSession {
  if (!sessions[profile]) {
    setSessions(profile, {
      messages: [],
      isStreaming: false,
      client: null,
      currentRunId: null,
      unsubscribe: null,
    });
  }
  return sessions[profile];
}

// Safe getters that do not mutate state on read (better encapsulation)
const getSession = (profile: string): ProfileChatSession | undefined => sessions[profile];

export const profileChatStore = {
  // Reactive getters (no side effects, better encapsulation)
  getMessages: (profile: string): ChatMessage[] => {
    const session = getSession(profile);
    return session ? session.messages : [];
  },

  getIsStreaming: (profile: string): boolean => {
    const session = getSession(profile);
    return session ? session.isStreaming : false;
  },

  // Core mutators
  addUserMessage(profile: string, content: string) {
    const session = ensureSession(profile);
    const msg: ChatMessage = { role: 'user', content, timestamp: Date.now() };
    setSessions(profile, 'messages', [...session.messages, msg]);
  },

  appendAssistantDelta(profile: string, delta: string) {
    const session = ensureSession(profile);
    const messages = session.messages;
    const last = messages[messages.length - 1];

    if (last && last.role === 'assistant') {
      const updated = [...messages.slice(0, -1), {
        ...last,
        content: (last.content || '') + delta,
      }];
      setSessions(profile, 'messages', updated);
    } else {
      const newMsg: ChatMessage = { role: 'assistant', content: delta, timestamp: Date.now() };
      setSessions(profile, 'messages', [...messages, newMsg]);
    }
  },

  replaceMessages(profile: string, newMessages: ChatMessage[]) {
    ensureSession(profile);
    setSessions(profile, 'messages', newMessages);
  },

  setStreaming(profile: string, streaming: boolean) {
    ensureSession(profile);
    setSessions(profile, 'isStreaming', streaming);
  },

  setError(profile: string, message: string) {
    ensureSession(profile);
    console.error(`[${profile}] Error:`, message);
    setSessions(profile, 'isStreaming', false);
  },

  setCurrentRunId(profile: string, runId: string | null) {
    ensureSession(profile);
    setSessions(profile, 'currentRunId', runId);
  },

  setComplete(profile: string, complete: boolean) {
    ensureSession(profile);
    // can be extended later
  },

  // Client management — single source of truth
  getOrCreateClient(profile: string): GatewayClient {
    const session = ensureSession(profile);
    if (session.client) {
      return session.client;
    }
    const client = new GatewayClient();
    setSessions(profile, 'client', client);
    return client;
  },

  registerListener(profile: string, unsubscribeFn: () => void) {
    ensureSession(profile);
    setSessions(profile, 'unsubscribe', unsubscribeFn);
  },

  clearListener(profile: string) {
    const session = sessions[profile];
    if (session?.unsubscribe) {
      session.unsubscribe();
      setSessions(profile, 'unsubscribe', null);
    }
  },

  resetProfile(profile: string) {
    const session = sessions[profile];
    if (session?.unsubscribe) session.unsubscribe();

    setSessions(profile, {
      messages: [],
      isStreaming: false,
      client: null,
      currentRunId: null,
      unsubscribe: null,
    });
  },
};
