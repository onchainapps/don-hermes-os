# Chat Slash Commands — TUI-style Integration

> **Goal:** Make the chat work like Hermes TUI — `/steer`, `/queue`, `/bg`, `/model`, `/retry`, `/stop`, `/new`, `/clear`, `/status`, `/help` etc.

**Current state:**
- `ChatComposer.tsx` already has slash dropdown UI + `onSlashCommand` prop — but nobody passes it
- `ChatWindow.tsx` (library) has `handleSlashCommand` defined but `onSlashCommand` is NOT wired to `ChatComposer`
- `FloatingChat.tsx` has basic `/new`, `/clear`, `/help` only
- `EditorChat.tsx` — NO slash commands at all (the main editor panel)
- Backend `server.ts` already proxies RPC via WebSocket (`type: 'rpc'` → gateway `/v1/rpc`)
- `ChatClient.rpc()` already works for FloatingChat/ChatWindow

**Gap:** EditorChat uses SSE streaming, not WebSocket RPC. Needs an RPC helper.

---

## What I'm doing

### Step 1: Create `src/lib/slashRpc.ts` — lightweight RPC helper for non-WebSocket contexts

A small fetch-based RPC that talks to the gateway through the backend proxy. This lets EditorChat (which uses SSE, not WebSocket) still call slash commands.

```ts
// POST /api/gateway/v1/rpc  →  gateway handles it
export async function slashRpc(method: string, params: Record<string, unknown>): Promise<unknown>
```

### Step 2: Update `ChatWindow.tsx` — wire `onSlashCommand` to `ChatComposer`

The handler already exists in ChatWindow (lines 120-191). Just need to pass it through.

### Step 3: Update `EditorChat.tsx` — add full slash command handler

Add `handleSlashCommand` function using the `slashRpc` helper for gateway commands, and local handling for `/new`, `/clear`. Wire `onSlashCommand` to `ChatComposer`.

### Step 4: Update `FloatingChat.tsx` — expand slash commands

Add `/steer`, `/bg`, `/model`, `/retry`, `/status` to match TUI. Already has ChatClient for RPC.

### Step 5: Update `ChatComposer.tsx` SLASH_COMMANDS list

Sync with actual TUI commands: `/help`, `/new`, `/clear`, `/status`, `/model`, `/steer`, `/bg`, `/queue`, `/retry`, `/stop`, `/session`, `/profile`, `/compact`.

---

## Commands to implement

| Command | Args | Action | Transport |
|---------|------|--------|-----------|
| `/help` | — | Show available commands | Local |
| `/new` | — | New session | Local |
| `/clear` | — | Clear messages | Local |
| `/stop` | — | Stop streaming | Local (already works via stop button) |
| `/retry` | — | Retry last user message | Local |
| `/status` | — | Show gateway status | Fetch `/api/gateway/status` |
| `/model` | `<model>` | Change model | RPC `config.set` |
| `/steer` | `queue\|steer\|interrupt\|status` | Set busy mode | RPC `busy.set` |
| `/bg` | `<prompt>` | Run prompt in background | RPC `runs.create_background` |
| `/queue` | `<prompt>` | Queue message for later | RPC `session.queue` |
| `/session` | `list\|new\|compress` | Session ops | RPC `session.*` |
| `/profile` | `[name]` | Switch profile | RPC `profile.switch` |
| `/compact` | — | Compress session | RPC `session.compress` |

---

## Files to modify

1. `src/lib/slashRpc.ts` — NEW
2. `src/lib/chat-ui/components/ChatComposer.tsx` — update SLASH_COMMANDS list
3. `src/lib/chat-ui/components/ChatWindow.tsx` — wire onSlashCommand
4. `src/components/EditorChat.tsx` — add full handler
5. `src/components/FloatingChat.tsx` — expand handler
