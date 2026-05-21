# Custom Chat Panel — Implementation Plan

**Goal:** Replace deep-chat with a custom, purpose-built LLM chat panel for Don Dashboard.

**Why:** deep-chat fights SolidJS reactivity, forces Shadow DOM, can't do real-time streaming, requires hacky timestamp injection via MutationObserver. Rolling our own gives us full control.

## Architecture

```
src/components/Chat/
├── ChatPanel.tsx           — Session sidebar + chat container (REUSE existing)
├── MessageList.tsx         — Scrollable message area with auto-scroll
├── MessageItem.tsx         — Single message bubble (user/assistant/tool)
├── MessageContent.tsx      — Markdown + code highlighting (shiki)
├── ChatComposer.tsx        — Auto-resize textarea + send button
├── ScrollAnchor.tsx        — "↓ New messages" floating button
├── hooks/
│   ├── createAutoScroll.ts — ResizeObserver + user-scroll detection
│   ├── createStreaming.ts  — SSE ReadableStream consumer
│   └── createAutoResize.ts — Auto-expanding textarea
├── types.ts                — Message, Role, Status types
└── utils.ts                — Markdown parsing, time formatting
```

## Component Breakdown

### 1. types.ts (~60 lines)
- `Message { id, role: 'user'|'assistant'|'system'|'tool', content, status, timestamp, toolCalls? }`
- `StreamingState = 'idle'|'connecting'|'streaming'|'complete'|'error'`
- `ActivityItem { type, label, detail?, duration?, timestamp }`

### 2. createAutoScroll.ts (~80 lines) — Loquix-inspired
- ResizeObserver on last message element
- Track `isUserScrolled` via scroll event with threshold (50px)
- `scrollToBottom()` method with smooth/instant modes
- Guards against programmatic scroll triggering user detection

### 3. createStreaming.ts (~100 lines) — Loquix-inspired
- SSE parser: reads ReadableStream, splits `data:` lines, parses JSON chunks
- Generation counter to prevent stale stream races
- Callbacks: `onChunk(accumulated)`, `onToolCall(name, args)`, `onComplete(text)`, `onError`
- State machine: idle → connecting → streaming → complete/error

### 4. createAutoResize.ts (~40 lines)
- Input event listener on textarea
- Reset to `auto`, clamp between min/max rows
- Set `overflow-y: auto` when max exceeded

### 5. ChatComposer.tsx (~100 lines)
- Auto-resize textarea (1-6 rows)
- Enter to submit, Shift+Enter for newline
- Send button with stop mode during streaming
- Slash command autocomplete dropdown (/, typing)
- Disabled state during streaming

### 6. MessageContent.tsx (~150 lines)
- `marked` for markdown → HTML
- `shiki` for code block syntax highlighting (lazy-loaded languages)
- Copy button on code blocks
- Streaming cursor indicator (blinking caret)
- CSS matches existing cyberpunk theme

### 7. MessageItem.tsx (~120 lines)
- Role-based styling (user=cyan, assistant=green, tool=magenta, system=gray)
- Avatar (emoji: 🧑 for user, 🤖 for assistant)
- Timestamp display
- Tool call display with name, duration, status
- Copy/regenerate actions

### 8. MessageList.tsx (~80 lines)
- `<For>` loop over messages signal
- Empty state with intro message
- Auto-scroll integration
- Scroll anchor button when user scrolls up

### 9. ChatPanel.tsx (~150 lines) — Refactored existing
- Keep session sidebar (already works, no deep-chat dependency)
- Replace `<HermesChat>` with `<ChatPanel>` component
- SSE streaming via `/api/chat` endpoint
- Session management (load, new, switch)
- Activity log
- Slash command handling

## Dependencies

```bash
bun add marked shiki
```

- `marked` — Fast markdown parser (zero deps, ~40KB)
- `shiki` — VS Code syntax highlighting (lazy-loaded, ~200KB for core + lazy languages)

## Implementation Order

1. **Phase 1: Foundation** — types.ts, hooks/, utils.ts
2. **Phase 2: Core UI** — MessageContent, MessageItem, MessageList
3. **Phase 3: Input** — ChatComposer with auto-resize + slash commands
4. **Phase 4: Integration** — ChatPanel wires SSE streaming to new components
5. **Phase 5: Polish** — Tool call rendering, activity log, copy buttons, theming

## Testing Strategy

- Build after each phase (`bun run build`)
- Visual check in Chrome via CDP after Phase 4
- Compare with existing deep-chat output side-by-side
- Verify SSE streaming end-to-end

## Hermes TUI Patterns to Mirror

Status indicators from the native CLI that should be visible in the web UI:

1. **Thinking state**: spinner + verb ("pondering", "contemplating") — show as animated dots in status bar
2. **Reasoning display**: streamed reasoning tokens in a dim collapsible block above response (when model provides them)
3. **Tool call start**: `┊ 🔧 preparing read_file…` — in activity feed
4. **Tool call completion**: `┊ 💻 $ cat README.md  0.3s` — in activity feed (persists)
5. **Tool error**: red highlight in activity feed
6. **Response streaming**: line-by-line rendering with markdown/code highlighting
7. **Live elapsed timer**: show duration while tool is running

These are already partially implemented in ChatPanel.tsx (activity log) — the new components should maintain and enhance this.

## Files to Remove After Migration

- `src/components/HermesChat.tsx` — the 840-line deep-chat wrapper
- `src/components/EditorChat.tsx` — will use new Chat component
- `src/deep-chat.d.ts` — type declarations for deep-chat
- `src/types/deep-chat.d.ts` — duplicate type declarations
- `package.json` → remove `deep-chat` dependency
