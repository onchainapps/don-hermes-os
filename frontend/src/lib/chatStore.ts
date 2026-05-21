import { createSignal } from 'solid-js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const [showChat, setShowChat] = createSignal(false);
const [messages, setMessages] = createSignal<ChatMessage[]>([]);

function sendMessage(role: 'user' | 'assistant', content: string) {
  setMessages(prev => [...prev, { role, content, timestamp: Date.now() }]);
}

export const chatStore = {
  showChat,
  messages,
  sendMessage,
};
