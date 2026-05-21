import { createSignal, onCleanup } from 'solid-js';
import type { StreamingState, ToolCall } from '../types';

interface StreamingCallbacks {
  onChunk?: (accumulated: string) => void;
  onToolCall?: (name: string, args: string, index: number) => void;
  onToolCallChunk?: (index: number, argChunk: string) => void;
  onReasoning?: (text: string) => void;
  onComplete?: (fullText: string, toolCalls: Map<number, ToolCall>) => void;
  onAbort?: (partialText: string, toolCalls: Map<number, ToolCall>) => void;
  onError?: (error: string) => void;
}

interface SseChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
}

export function createStreaming(callbacks: StreamingCallbacks) {
  const [state, setState] = createSignal<StreamingState>('idle');
  let generation = 0;
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let abortController: AbortController | null = null;

  const processLine = (
    line: string,
    accumulated: { text: string; toolCalls: Map<number, ToolCall> },
    onKeepalive?: () => void
  ) => {
    const trimmed = line.trim().replace(/\r$/, '');

    // SSE comment (keepalive) — reset stall timer, skip processing
    if (trimmed.startsWith(':')) {
      onKeepalive?.();
      return;
    }

    if (!trimmed.startsWith('data: ')) return;

    const data = trimmed.slice(6);
    if (data === '[DONE]') return;

    try {
      const chunk: SseChunk = JSON.parse(data);
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;

      // Reasoning content
      const reasoning = delta.reasoning_content || delta.reasoning;
      if (reasoning) {
        callbacks.onReasoning?.(reasoning);
        return;
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (tc.function?.name) {
            accumulated.toolCalls.set(idx, {
              id: tc.id || `tc_${idx}`,
              name: tc.function.name,
              args: tc.function.arguments || '',
              status: 'running',
              startTime: Date.now(),
            });
            callbacks.onToolCall?.(tc.function.name, tc.function.arguments || '', idx);
          } else if (tc.function?.arguments && accumulated.toolCalls.has(idx)) {
            const existing = accumulated.toolCalls.get(idx)!;
            existing.args += tc.function.arguments;
            callbacks.onToolCallChunk?.(idx, tc.function.arguments);
          }
        }
        return;
      }

      // Text content
      if (delta.content) {
        accumulated.text += delta.content;
        callbacks.onChunk?.(accumulated.text);
      }
    } catch {
      // Skip unparseable lines
    }
  };

  const stream = async (response: Response, retryFactory?: () => Promise<Response>) => {
    // Abort any previous stream
    abort();
    const gen = ++generation;
    abortController = new AbortController();

    const MAX_RETRIES = 3;

    const attemptStream = async (res: Response, acc: { text: string; toolCalls: Map<number, ToolCall> }): Promise<void> => {
      setState('connecting');

      const accumulated = acc;

      const reader = res.body?.getReader();
      if (!reader) {
        setState('error');
        callbacks.onError?.('No response body');
        return;
      }
      currentReader = reader;

      setState('streaming');
      const decoder = new TextDecoder();
      let buffer = '';

      // Stall detection: if no data for 60s, abort
      const STALL_TIMEOUT_MS = 60000;
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let stalled = false;

      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stalled = true;
          reader.cancel();
        }, STALL_TIMEOUT_MS);
      };

      resetStallTimer();

      while (true) {
        // Check for abort
        if (gen !== generation) {
          if (stallTimer) clearTimeout(stallTimer);
          return;
        }

        try {
          const { done, value } = await reader.read();
          if (stallTimer) clearTimeout(stallTimer);

          if (done) break;

          resetStallTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line, accumulated, resetStallTimer);
          }
        } catch (readErr) {
          if (stallTimer) clearTimeout(stallTimer);
          currentReader = null;
          if (gen !== generation) return; // Aborted — don't throw
          if (stalled) {
            throw new Error('Stream stalled — no data for 60s');
          }
          throw readErr;
        }
      }

      if (stallTimer) clearTimeout(stallTimer);
      currentReader = null;

      // Process remaining buffer
      if (buffer.trim()) {
        processLine(buffer, accumulated, resetStallTimer);
      }

      // Finalize tool call durations
      for (const [, tc] of accumulated.toolCalls) {
        tc.duration = (Date.now() - tc.startTime) / 1000;
        tc.status = 'complete';
      }

      setState('complete');
      callbacks.onComplete?.(accumulated.text, accumulated.toolCalls);
    };

    // Run with retry logic
    const accumulated = { text: '', toolCalls: new Map<number, ToolCall>() };
    let currentResponse = response;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (gen !== generation) {
          callbacks.onAbort?.(accumulated.text, accumulated.toolCalls);
          return;
        }
        await attemptStream(currentResponse, accumulated);
        return; // Success
      } catch (error) {
        if (gen !== generation) {
          callbacks.onAbort?.(accumulated.text, accumulated.toolCalls);
          return;
        }

        if (attempt < MAX_RETRIES && retryFactory) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          setState('reconnecting');
          await new Promise(resolve => setTimeout(resolve, delay));
          if (gen !== generation) return; // Aborted during wait
          try {
            currentResponse = await retryFactory();
          } catch (fetchErr) {
            // Retry fetch failed, will fall through to error on next iteration
            continue;
          }
        } else {
          setState('error');
          callbacks.onError?.(error instanceof Error ? error.message : String(error));
          return;
        }
      }
    }
    // Clean up after all retries exhausted or stream completed
    if (gen === generation) {
      abortController = null;
    }
  };

  const abort = () => {
    ++generation;
    currentReader?.cancel().catch((e) => console.warn('Reader cancel:', e));
    currentReader = null;
    abortController?.abort();
    abortController = null;
    if (state() !== 'idle') setState('idle');
  };

  onCleanup(abort);

  return { state, stream, abort };
}
