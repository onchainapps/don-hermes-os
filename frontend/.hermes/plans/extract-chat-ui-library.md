# Plan: Extract don-chat-ui Library

Goal: Extract the chat UI from don-os-frontend into a reusable local Bun package (libs/don-chat-ui) so every future app in the Dons OS ecosystem gets the same chat implementation with consistent features.

## Current State

don-os-frontend/src/components/Chat/ is a monolith (~821 lines for index.tsx alone) mixing session management, API wiring, streaming logic, and UI rendering all together.

Components:
- index.tsx (821 lines) — ChatPanel: session sidebar + message list + composer + streaming + slash commands + FTS search + activity panel. Everything in one file.
- ChatComposer.tsx — auto-resize textarea, slash command dropdown, send/stop buttons
- MessageList.tsx — scrollable list, auto-scroll toggle, scroll-to-bottom FAB
- MessageItem.tsx — role-based cards with emoji avatars, copy button, streaming dots animation
- MessageContent.tsx — markdown + Shiki syntax highlighting, code blocks (copy/run), diff blocks, streaming cursor
- ActivityPanel.tsx — thinking/tool/run status feed
- ReasoningDisplay.tsx — collapsible reasoning trace
- ToolCallView.tsx — expandable tool call details
- ScrollAnchor.tsx — scroll-to-bottom FAB
- hooks/createStreaming.ts — SSE streaming with retry (3 attempts, exponential backoff), stall detection (60s), reconnect on tab visibility change
- hooks/createAutoScroll.ts — auto-scroll with ResizeObserver, scroll state tracking
- hooks/createAutoResize.ts — textarea auto-resize (1-6 rows)
- types.ts — Message, ToolCall, ActivityItem interfaces
- utils.ts — markdown parsing (marked), time formatting, ID generation
- DiffPreview.tsx (SHARED in main project — NOT chat-specific)

Features to carry over to the library:
- Shiki syntax highlighting for code blocks
- Diff block rendering with accept/reject
- Markdown with sanitization (DOMPurify)
- Auto-resizing textarea
- Slash command dropdown with keyboard navigation
- SSE streaming with retry + stall detection
- Streaming cursor blink animation
- Auto-scroll + manual override toggle
- Scroll-to-bottom anchor FAB
- Role-based message styling (user/assistant/tool/system)
- Copy message + copy code buttons
- Tool call display with status badges
- Activity feed (thinking, tool, run events)
- Collapsible reasoning display
- Timestamp display with CDT timezone
- Empty state / intro message
- Streaming stop button

## Architecture

Two-layer design:
1. Headless layer — hooks that own chat state and streaming
2. UI layer — composable SolidJS components that use the hooks

This lets consumers build custom UIs using the same streaming/retry/stall-detection logic.

### ChatWindow API (main consumer-facing component)

```tsx
<ChatWindow
  // Required
  send={async (message, sessionId?) => { /* call gateway API, return Response */ }}
  // Optional
  sessionId={currentSessionId}          // for session management
  initialMessages={[]}                  // load from localStorage or API
  onSessionChange={(id) => {}}         // when user switches sessions
  streamingSource={streamReader}       // if they want to stream externally
  showSessionSidebar={true}            // include the session list sidebar
  showActivity={true}                  // include activity/status bar
  showReasoning={true}                 // include reasoning display
  onStreamingUpdate={(fullText, toolCalls)} => { /* custom streaming handler */ }
  onSendMessage={(msg) => {}}          // called after each message sent
  placeholder="Ask something..."       // composer placeholder
  introMessage="Hey Bakon..."          // empty state message
  onSendClick={onSend}                 // send button click
  onStopClick={onStop}                 // stop button click
/>
```

### Package Structure

libs/don-chat-ui/
  package.json          # "don-chat-ui", peer: solid-js, deps: marked, shiki, dompurify
  tsconfig.json         # SolidJS config, no emit, types: solid-js
  src/
    index.ts            # barrel exports
    hooks/
      index.ts          # { useChat, createStreaming, createAutoScroll, createAutoResize }
      useChat.ts         # new: headless chat hook (session state, message management)
      createStreaming.ts # existing (adapted — remove don-os-frontend imports)
      createAutoScroll.ts # existing (adapted)
      createAutoResize.ts # existing (adapted)
    components/
      ChatWindow.tsx     # new: composite component (combines everything)
      ChatComposer.tsx   # existing
      MessageList.tsx    # existing
      MessageItem.tsx    # existing
      MessageContent.tsx # existing (remove '../DiffPreview' import — use prop)
      ActivityPanel.tsx  # existing
      ReasoningDisplay.tsx # existing
      ToolCallView.tsx   # existing
      ScrollAnchor.tsx   # existing
      SessionSidebar.tsx # extracted from index.tsx: sidebar + FTS search + clustering
    types.ts             # existing
    utils.ts             # existing
    README.md

### Implementation Steps

1. **Create package structure** — libs/don-chat-ui/{package.json, tsconfig.json, src/}
2. **Extract hooks** — move createStreaming, createAutoScroll, createAutoResize to libs/don-chat-ui/hooks/
3. **Create useChat hook** — new headless hook that wraps the API/session/message logic from index.tsx (remove the API call code, make send() a prop instead)
4. **Move UI components** — move all 9 components to libs/don-chat-ui/components/
5. **Extract SessionSidebar** — split out the session management/FTS/search sidebar from index.tsx
6. **Create ChatWindow** — composite component that wires everything together
7. **Adapt MessageContent** — remove DiffPreview import, accept diffComponent as prop
8. **Adapt ToolCallView** — remove import from '../../lib/chatClient', use local types
9. **Adapt utils** — check for any don-os-frontend-specific imports
10. **Create barrel exports** — index.ts with clean public API
11. **Update don-os-frontend** — replace Chat import with library import
12. **Verify build** — vite build passes
13. **Write README** — usage example + API docs

### Key Decisions

- **Peer dependency on SolidJS**: consumers use their own version
- **monaco-editor not in library**: DiffPreview uses it but is a shared project component
- **No API calls in library**: send() is a prop — library is transport-agnostic
- **Tailwind v4 assumed**: library assumes consumer has Tailwind already
- **DiffPreview stays in main project**: passed as a render prop
- **Streaming library is standalone**: can be imported separately for custom streaming UIs

## Tasks

- [ ] Create libs/don-chat-ui/ package.json + tsconfig.json
- [ ] Move hooks (createStreaming, createAutoScroll, createAutoResize)
- [ ] Create useChat headless hook
- [ ] Move UI components (8 files)
- [ ] Create SessionSidebar component
- [ ] Create ChatWindow composite
- [ ] Adapt MessageContent, ToolCallView for library usage
- [ ] Create barrel index.ts exports
- [ ] Update don-os-frontend to import from library
- [ ] Verify build
- [ ] Write README
