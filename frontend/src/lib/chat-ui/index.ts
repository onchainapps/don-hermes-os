// don-chat-ui — reusable chat UI components
// ModalChat is the canonical implementation.
// createHermesChat + shared GatewayClient provide core logic.

// --- Individual UI components ---
export { default as ChatComposer } from './components/ChatComposer';
export { default as MessageList } from './components/MessageList';
export { default as MessageItem } from './components/MessageItem';
export { default as MessageContent } from './components/MessageContent';
export { ActivityPanel } from './components/ActivityPanel';
export { ReasoningDisplay } from './components/ReasoningDisplay';
export { ToolCallView } from './components/ToolCallView';
export { default as ScrollAnchor } from './components/ScrollAnchor';
export { default as SessionSidebar } from './components/SessionSidebar';
export { default as DiffPreview } from './components/DiffPreview';

// --- Hooks (headless) ---
export { createChat } from './hooks/createChat';
export type { CreateChatOptions, CreateChatReturn } from './hooks/createChat';
export { createStreaming } from './hooks/createStreaming';
export { createAutoScroll } from './hooks/createAutoScroll';
export { createAutoResize } from './hooks/createAutoResize';

// --- Utilities ---
export { generateId } from './types';

// --- Types ---
export type {
  Message,
  MessageRole,
  MessageStatus,
  ToolCall,
  ActivityItem,
} from './types';
