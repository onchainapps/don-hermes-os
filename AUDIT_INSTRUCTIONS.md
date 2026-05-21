# Codebase Audit Instructions

## Project: Don Hermes OS

**What it is:** Don Hermes OS is a local-first AI operating system built on SolidJS + Vite + Bun.
The frontend is a cyberpunk-style dashboard at `frontend/` with integrated Monaco IDE,
sidebar panels (System, Code, Sessions, Wiki, Profiles), and a multi-profile chat system.
The backend is at `backend/server.ts` — a Bun Elysia server that proxies gateway requests,
serves the production static build from `dist/`, and exposes the profile-management API.

**Why it matters:** Each Hermes Agent "profile" gets its own gateway port, API key, and persisted
chat state. The gateway proxy (`/gp` and `/api/gateway`) is the hot path for every LLM call.
A bug here breaks all profiles simultaneously.

---

## Architecture Layers You Must Understand Before Auditing

### 1. Gateway Routing (Two Paths)

There are TWO routing layers for gateway calls. You use one or the other, never both.

| Path | Proxy | Auth handled | When used |
|------|-------|--------------|-----------|
| `/gp/*` | `backend/server.ts` Elysia route | Server-side (profile `.env` file) | **Production** — static build from `dist/` |
| `/api/gateway/*` | `backend/server.ts` Elysia route | Server-side (same) | **Alternate production path** |
| `/gateway/*` | Vite dev server proxy (`vite.config.ts`) | Client-side env var `VITE_GATEWAY_AUTH` | **Dev only** — `bun run dev`, port 5173 |

**Critical rule:** In production, the frontend is a static build served from `dist/`. The Vite
proxy does NOT exist. All gateway calls MUST go through `/gp` or `/api/gateway` which the Bun
backend handles. Any component still using `/gateway` as `API_BASE` will 404 in production.

### 2. Per-Profile Isolation

- Each profile has: `profileId` (string), `gatewayPort` (number, optional), `apiKey` (string, optional),
  and a `.env` file on disk at the profile directory.
- The backend `/gp` proxy resolves the profile's `.env` to extract `HERMES_GATEWAY_PORT` and
  `HERMES_API_KEY`, then forwards the request to the right gateway instance.
- The `X-Hermes-Profile` header is what tells the proxy which profile's `.env` to load.
- Props `gatewayPort` is display-only (shows port badge in the chat header). `apiKey` is
  also display-only / informational. Do NOT construct URLs from these props.

### 3. Streaming Pattern (Runs API)

Every chat component does the same two-step dance:
1. `POST /v1/runs` — create a run, get `run_id`
2. `GET /v1/runs/{run_id}/events` — SSE stream, parse `data:` lines, look for
   `event: "message.delta"` → append `delta` to assistant message
   `event: "run.completed"` → attach `usage` token counts

The `AbortController` created for step 1 is shared to step 2 via the same `signal`. Both
requests are cancelled together. The SSE reader is `streamRes.body.getReader()`.

### 4. IndexedDB Persistence

- Key is per-profile: `profile-chat-{profileId}` (or `modal-chat-v1` for legacy ModalChat)
- Saves: `position`, `size`, `messages[]`, `sessionId`, `updatedAt`
- Debounced with 400ms `setTimeout` via `scheduleSave()`
- DB name is `don-profile-chat-db` (ProfileChat) vs `don-chat-db` (ModalChat legacy)

### 5. ModalChat vs ProfileChat — What Changed

| | ModalChat (legacy) | ProfileChat (current) |
|--|--------------------|-----------------------|
| Auth | `VITE_GATEWAY_AUTH` env var | None — proxy handles it server-side |
| Route | `/api/gateway` (patched) | `/gp` |
| Scope | Single global chat | Per-profile chat |
| DB key | `modal-chat-v1` (global) | `profile-chat-{id}` (per-profile) |
| Slash commands | 11 commands | Same 11 commands, added `/status` with profile info |
| Header | `Authorization: Bearer` | `X-Hermes-Profile: {name}` |
| Mount | Custom toggle event | `isOpen=true` by default |
| State | `{ position, size, messages, sessionId }` | `{ position, size, messages, sessionId }` |
| Known issues | No AbortController on stream (mid-stream abort vulnerability) | Same AbortController issue, plus no timezone in session timestamps |

---

## What to Audit

Audit the entire frontend codebase (`frontend/src/`) and the backend (`backend/server.ts`).

Report findings by priority:
- **CRITICAL** — crashes, data loss, security issues, broken production paths
- **HIGH** — bugs that degrade user experience or break features
- **MEDIUM** — code quality, maintainability, drift from ModalChat reference
- **LOW** — polish, style inconsistencies

### Specific Checks for ALL Chat Components (ModalChat, ProfileChat, any others)

1. **Auth path consistency:** Every `fetch()` call to gateway must include the right auth.
   - `/gp` route → `X-Hermes-Profile` header (server resolves auth)
   - Direct gateway → `Authorization: Bearer` header
   - Flag any component using the wrong path.

2. **AbortController vulnerability:** When a mid-stream error occurs (network flip,
   run ID lost, server returns non-200 after headers were consumed), `reader.cancel()` is
   called in `finally` but the fetch `signal` abort does NOT take effect because the body
   reader is already being consumed. If a promise race causes `stopStreaming()` + new
   `sendMessage()` to fire simultaneously, the old `abortController` reference is lost.
   Check: is there a window where `sendMessage()` can be called twice without the
   `isStreaming()` guard catching it?

3. **`onCleanup` / unmount memory leaks:** ModalChat adds `handleDragMove` and `endDrag`
   listeners with `document.addEventListener` in `startDrag/endDrag` but removes them in
   `onCleanup`. If the component is unmounted while dragging is in progress, the listeners
   reference `setPosition` on a dead component. Same for the `thinkingInterval`. Is there
   a case where `onCleanup` runs after `stopStreaming()` nulls the abort controller but
   before the streaming promise settles?

4. **`requestCancelled` mid-stream (CRITICAL):** ModalChat's streaming loop reads
   `reader.read()` which resolves when the stream ends or errors. If the server sends
   `requestCancelled` SSE event (gateway cancelled the run externally), the event is caught
   by the empty `catch {}` block and silently swallowed. The UI stays stuck on
   `isStreaming=true`, the thinking animation keeps running, and the placeholder message
   never gets updated. Does ProfileChat handle `requestCancelled` correctly?

5. **Error message on `streamRes.ok` failure:** Both ModalChat and ProfileChat set the
   error on the LAST message `last.role === 'assistant'`. Is `last` guaranteed to be the
   assistant placeholder? What if the `setMessages` call in the try block hasn't produced
   a new element yet due to batching?

6. **Model ID display:** ModalChat defaults `modelInfo()` to `{ name: 'Qwen3.6-27B-FP8', context: 262111 }`.
   ProfileChat defaults to `{ name: 'grok-4.3', context: 10000000 }`. When `fetchModelInfo()`
   fails silently (catch {}), the wrong model name is shown. Is there a path where the
   displayed model name doesn't match the actual routing model?

7. **`gatewayPort` prop: display-only warning:** ModalChat has no `gatewayPort` prop.
   ProfileChat receives it and renders a port badge. Does the `fetchModelInfo()` call in
   ProfileChat attempt to construct a URL from `gatewayPort`? (It does not — but verify.)

### Specific Checks for ProfileManager.tsx

- Does the inline create-profile form at lines ~195–264 include a CRON/CONFIG toggle?
- Does it write to the right profile `.env`?
- Are there TypeScript errors on `HermesProfile` type (known: missing `apiKey` at line ~367)?

### Specific Checks for Backend (`backend/server.ts`)

- `/gp` proxy: does it read `X-Hermes-Profile` header, load the profile's `.env`, and
  forward with the resolved `HERMES_GATEWAY_PORT` + `HERMES_API_KEY`?
- `/api/gateway/*`: does it also accept GET (for `/v1/models`) as well as POST?
- When the body is a stream (SSE), does `server.ts` set `Content-Type: text/event-stream`?
- Does it strip or pass through `X-Hermes-Session-Id`?

### Files to Audit

```
frontend/src/components/App.tsx
frontend/src/components/ModalChat.tsx          ← canonical reference (legacy but canonical)
frontend/src/components/ProfileChat.tsx        ← current production chat
frontend/src/components/ProfileManager.tsx     ← profile CRUD
frontend/src/components/SystemPanel.tsx
frontend/src/components/OnboardingModal.tsx
frontend/src/App.tsx                           ← root mount point
frontend/src/lib/api-base.ts                   ← apiUrl() helper
backend/server.ts                              ← gateway proxy + static serve
```

### Boundaries: Do NOT Modify

- `backend/scripts/` — orchestrator scripts, do not touch
- `frontend/src/lib/chat-ui/` — the chat-ui library (internal, not the shell components)
- `~/.hermes/` — Hermes Agent runtime configs
- Any `.env` files

### Output Format

Write results to `./AUDIT_REPORT.md`:

```markdown
# Don Hermes OS Codebase Audit

**Date:** auto-fill  
**Auditor:** OpenCode  
**Scope:** frontend/src/ + backend/server.ts

## CRITICAL
[... numbered issues]

## HIGH
[...]

## MEDIUM
[...]

## LOW
[...]

## ModalChat → ProfileChat Diff Summary
[What ProfileChat got right compared to the canonical ModalChat, and what it lost or broke]
```

Then run `npx tsc --noEmit` on the frontend and append the error count to the report.
