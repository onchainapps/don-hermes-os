# Floating Chat (Don Chat) - Architecture & How It Works

## Overview

The floating chat in Don OS Frontend is a modern, reactive chat interface built with SolidJS. It communicates with the Hermes Agent using the **Runs API** (the streaming-friendly alternative) instead of the legacy WebSocket `/ws/chat` endpoint.

## Key Technologies

- **SolidJS** for fine-grained reactivity
- **Hermes Runs API** (`/v1/runs` + `/v1/runs/{id}/events`)
- **Vite Proxy** (`/gateway`) during development to avoid CORS
- **Server-Sent Events (SSE)** for real-time token streaming

## How It Works

### 1. Run Creation

When the user sends a message:

```ts
const createRes = await fetch(`${API_BASE}/v1/runs`, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({
    input: prompt,
    stream: true,
    conversation_history: [...]
  })
});
```

The gateway returns a `run_id`.

### 2. Event Streaming

The client then connects to the events stream:

```ts
const streamRes = await fetch(`${API_BASE}/v1/runs/${runId}/events`, {
  headers: { Accept: 'text/event-stream' }
});
```

It listens for these events:

- `message.delta` — incremental token content
- `reasoning.available` — final reasoning / output
- `run.completed` — includes token usage
- `run.failed` — error handling

### 3. Reactivity & Rendering

Deltas are accumulated and applied using immutable updates:

```ts
setMessages(prev => {
  const newMessages = [...prev];
  newMessages[lastIndex] = {
    ...newMessages[lastIndex],
    content: fullContent
  };
  return newMessages;
});
```

Token usage is captured on `run.completed` and rendered as a small footnote:

```tsx
{msg.usage && (
  <div class="text-[10px] text-zinc-500 mt-1.5">
    {msg.usage.input_tokens} in • {msg.usage.output_tokens} out • {msg.usage.total_tokens} total
  </div>
)}
```

## Current Features

- Real-time streaming
- Token usage display
- Persistent position/size
- Multi-tab friendly (via Vite proxy)
- Clean separation between run lifecycle and UI updates

## Future Improvements

- Markdown + code block rendering (with syntax highlighting)
- Image support
- Better error recovery and session resume
- Per-profile chat isolation

## Related Files

- `src/components/ModalChat.tsx` — Main chat component
- `src/lib/chatStorage.ts` — Persistence layer
- `vite.config.ts` — Gateway proxy configuration

This architecture provides a robust, debuggable, and extensible foundation for agent chat interfaces.