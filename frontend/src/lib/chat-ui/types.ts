// ─── Chat Component Types ─────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'pending';

export type StreamingState = 'idle' | 'connecting' | 'streaming' | 'reconnecting' | 'complete' | 'error';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  timestamp: Date;
  toolCalls?: ToolCall[];
  /** Collapsed reasoning/thinking text (from LLM reasoning blocks) */
  reasoning?: string;
  /** Attached images (base64 data URLs) */
  images?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime: number;
  duration?: number;
  result?: string;
}

export interface ActivityItem {
  type: 'thinking' | 'tool_started' | 'tool_completed' | 'tool_error' | 'run_start' | 'run_complete' | 'run_error';
  label: string;
  detail?: string;
  duration?: number;
  timestamp: number;
  emoji?: string;
}

export interface ChatProps {
  sessionId?: string | null;
  placeholder?: string;
  introMessage?: string;
  onSessionChange?: (sessionId: string | null) => void;
  onStreamingChange?: (streaming: boolean) => void;
  onActivity?: (item: ActivityItem) => void;
  onActivityClear?: () => void;
}

export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
