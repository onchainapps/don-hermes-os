# Chat & SSE Full Audit — ProfileChat + Don Backend
**Date:** 2026-05-22 | **Scope:** SSEChat, ProfileChat, Don backend SSE/WS endpoints, chat-persist

---

## 1. Architecture Overview

```
┌──────────────┐   HTTP SSE   ┌──────────────────┐   WS token relay   ┌──────────────┐
│ ProfileChat  │─────────────▶│   Don Backend    │────────────────────▶│ Hermes GW    │
│  (frontend)  │   POST /gp/  │  server.ts       │  /v1/runs           │8642          │
│              │   v1/runs    │  /ws/chat        │  /v1/runs/*/events  │              │
└──────────────┘              │  /v1/chat(legacy)│                     └──────────────┘
                               └──────────────────┘
Two independent chat tunnels:
  1. Old: WebSocket /ws/chat (Bun native) → server.ts:40–206  [ESTABLISHED, PRODUCTION]
  2. New: HTTP SSE /v1/runs → /v1/runs/{id}/events          [ProfileChat, streaming]
```

---

## 2. Backend: Server-Sent Events (SSE) endpoints

### 2.1 Runs API (new, real)
**Lines 82–206 of server.ts**

| Route | Method | Behaviour |
|---|---|---|
| `/v1/runs` | POST | Creates a run on Hermes GW, returns `{ run_id, session_id }` |
| `/v1/runs/{id}/events` | GET | Streams events from Hermes as `text/event-stream` |

**Stream parsing logic (L128–196):**
```ts
// Reads Hermes SSE stream in a raw-streaming loop
const reader = evtRes.body?.getReader();
// Manually buffers until newline boundaries, processes `data: ...` lines
const lines = buf.split('\n');
buf = lines.pop() || '';
```

Every Hermes event is relayed over WS to the frontend with enriched context.
- `event.delta` → `message.delta`(content)
- `message.complete / run.completed` → `message.complete`
- `tool.start / tool.result / tool.started / tool.completed` → forwarded verbatim
- `reasoning.available` → forwarded verbatim
- All other events → `{...event, type: eventType}` (type normalization)

---

### 2.2 WebSocket /ws/chat (old, legacy-established)
**Lines 40–206 of server.ts**

| Channel | Type | Notes |
|---|---|---|
| `/ws/chat` | WebSocket | Established production path for all chat messages |
| `/terminal` | WebSocket | Shell sessions |

- `chatRunners`: Map of `Bun.ServerWebSocket → { runId, label, abort }`
- On WS `start`/`chat` message: creates run on Hermes GW, then records `run_id` on the map
- On WS `cancel`: aborts current runner
- On WS `close`: aborts all runners for that connection

---

### 2.3 Gateway Proxy (/gp) — SSE header preservation

**Lines 1502–1569 of server.ts**

For every `/gp/*` request:
- Profile's `.env` port + API key resolved from `.env`
- Timeout is **infinite** (`undefined`) for any URL containing `/events`
- For SSE (`/events` endpoint): `text/event-stream` header is preserved
- CORS `*` headers added for all SSE responses
- `fetch(req.body)` is used for POST — relies on the incoming `Content-Type: application/json` standard

**BUG risk — request body passthrough:**
```ts
body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
```
When the Hermes SSE stream event reader is pushed through: it's GET so it avoids this. For POST-chat messages through `/ws/chat`, `req.body` is the raw `ArrayBuffer` from the WS binary frame, not a re-encoded body. However, `handleChatMessage` handles this already (json.parse on req.body text). **Safe.**

---

## 3. Frontend: ProfileChat

### 3.1 Communication path (ProfileChat.tsx)

```
ProfileChat
  ▼ POST /gp/v1/runs  {input, stream:true, conversation_history, session_id}
  └─► Don /ws/chat WS loop → relays to /v1/runs
       ▲ POST 200   {run_id}
  ▼ GET /gp/v1/runs/{run_id}/events  [Accept: text/event-stream]
  └─► Don SSE proxy → Hermes SSE stream
       ▲ text/event-stream={run_id, event, delta}
```

**Stream parsing — duplicate logic (frontend + backend):**

The SSE parsing algorithm appears **twice** with nuanced differences:

| Location | Buffer strategy | Cancellation detection |
|---|---|---|
| server.ts:128–196 (backend relay) | `buf += dec.decode(v, {stream:true}).split('\n')` | No cancellation check — relies on abort signal on fetch |
| ProfileChat.tsx:588–643 (frontend) | `buffer += decoder.decode(v).split('\n')` | Checks `\"requestCancelled\"` / `\"cancelled\"` in JSON, breaks streamLoop without waiting |

**Good practice:** The frontend has a cancellation safety net that the backend's relay does not. The backend will relay `[DONE]` forever if the reader doesn't get `done` — but `AbortSignal.timeout(undefined)` + AbortController should cut the fetch clean.

---

### 3.2 Stream event handling — event type fidelity

The frontend only parses two explicit event types from the stream:
- `event.event === "message.delta"` → `fullContent += event.delta`
- `event.event === "run.completed"` → reads `.usage`

**Service tool events are overlooked at the UI level** — ProfileChat does NOT display `tool.start` / `tool.started` / `tool.completed` / `tool.result` to the user (the stream processing loop ignores them on `event.event` check). Only `message.delta` and `run.completed` are parsed. The backend relays them anyway — they go to the WS side and are forwardable.

---

### 3.3 Message persistence: two separate stores

| Store | DB name | Scope key |
|---|---|---|
| ProfileChat | `don-profile-chat-db` | `profile-chat-{profileId}` (per profile instance) |
| chat-persist | `don-os-chat` | `{projectRoot}:{filePath}` (per editor tab) |

These two stores persist messages to different IndexedDB databases with different schemas. There is **no cross-store migration or sync.** Messages sent in ProfileChat are not accessible from the main editor chat, and vice versa.

---

## 4. Issues Found

### 🔴 CRITICAL / HIGH

#### #1 – No retry on SSE stream reconnect (frontend)
If the SSE stream drops mid-response after the run is created, the frontend just errors. There is no automatic re-poll of events or reconnects to `{run_id}/events`. A simple `AbortError` after the first fetch abandons the response. Background runs like `/bg` and `/queue` use this same path and may silently vanish.

**Recommendation:** On `AbortError` when not user-initiated, implement a short backoff-reconnect to `/v1/runs/{run_id}/events` using the stored `run_id`.

---

#### #2 – Race condition on concurrent messages (frontend but not a crash — by design)
ProfileChat line 504–508:
```ts
if (isStreaming()) return;
if (abortController) {
  log('Previous stream still active, preventing concurrent send');
  return;
}
```
This suppresses all concurrent sends rather than queuing them. It's designed to prevent double-streaming, but if you tab into the chat after a long wait, the send may falsely refuse because isStreaming is still true (stale true). The `abortController` guard kicks in first, which is correct, but then `isStreaming` is never unset for streams that were cancelled by `run.completed` only.

---

#### #3 – Hardcoded event type string dupe in backend relay
```ts
const eventType = event.event || event.type;
```
In 5 separate branches, it checks against string literals: `'message.delta'`, `'message.complete'`, `'run.completed'`, `'tool.start'`, `'tool.result'`, `'tool.started'`, `'tool.completed'`, `'reasoning.available'`. Adding or renaming event types in Hermes requires touching this switch in 8 places. No type definition or enum helps here.

**Recommendation:** Extract to a `const RUN_EVENT_TYPES` map and centralize the relay logic.

---

#### #4 – Legacy tests are stubs
`backend/tests/chat.test.ts` and `backend/e2e-chat-test.ts` are empty stubs (just `export {}`). They do not test any of the SSE or WS paths. A regression in SSE format would not be caught.

---

### 🟡 WARNINGS / CODE QUALITY

#### #5 – Double SSE parsing pattern
The SSE parsing loop is implemented in two copies (backend server.ts:128–196, frontend ProfileChat.tsx:588–643) with slightly different bug-detection logic. Bug fixes need to be applied in two places.

**Recommendation:** Extract SSE parsing to a shared library level, or at minimum add a comment pointing to the canonical copy.

---

#### #6 – `any` type overuse in backend
In `server.ts` frequently typed as `any`:
```ts
const parsed: unknown = JSON.parse(...)
const input = (parsed as any).input
runner?.label           // possibly undefined fallback issues
chatRunners.get(ws)?.abort.abort()  // watcher is full of any
```

Recommended: add a `ChatMessage` interface and restrict casts.

---

#### #7 – IndexedDB version mismatch for ProfileChat (not used, but referenced).
`don-profile-chat-db` opens at version `1` with no upgrade handling beyond object store creation — **acceptable** since there is nothing to upgrade yet. But if a newer version is needed, the upgrade function only creates the store and doesn't handle data migration. Document this limitation.

---

#### #8 – Access-Control-Allow-Origin already set
The gateway proxy at L1418-1552 sets `Access-Control-Allow-Origin: *` in `corsHeaders`. If a profile connects from a different origin (e.g., the main dashboard), CORS works. However, requests through `/ws/chat` (WebSocket) don't go through the proxy, so WebSocket CORS is handled implicitly by Bun's `Bun.serve` which doesn't check origin by default.

---

#### #9 – Gateway WS close handler is unconditional
```ts
// server.ts line 1594-1604
close(ws) {
  const handlerType = (ws as any).handlerType;
  if (handlerType === 'chat') {
    chatRunners.get(ws)?.abort.abort();
    chatRunners.delete(ws);
  }
```
Closes every `chatRunners` runner for this specific ws. This is correct.

---

#### #10 – Potential `navigator.sendBeacon` / `visibilitychange` not used during page unload
If the user closes the tab while a stream is active, `stopStreaming()` fires in `onCleanup`, but any in-flight tokens could be counted. The `AbortSignal` from abortController should fire the abort on the fetch, which stops the run on Hermes (since it's wrapped in AbortSignal-aware fetch). **Verified safe** — the abort signal is passed to the SSE `fetch` call line 573.

---

## 5. Recommended Fixes (Prioritized)

| # | Priority | Fix | Location |
|---|---|---|---|
| 1 | 🔴 HIGH | Centralize SSE parsing into a shared utility | ProfileChat.tsx + server.ts stream-relay |
| 2 | 🔴 HIGH | Reconnect logic for dropped SSE streams | ProfileChat.tsx:573+ |
| 3 | 🔴 HIGH | Rewrite chat tests with actual HTTP/SSE assertions | backend/tests/chat.test.ts |
| 4 | 🟡 MEDIUM | Extract Hermes event type constants | server.ts:155–190 |
| 5 | 🟡 MEDIUM | Add `tool.start/completed` visual indicator in ProfileChat | ProfileChat.tsx:617-627 |
| 6 | 🟢 LOW | Add IDB version migration stubs | ProfileChat.tsx:42 |

---

## 6. Functional Verdict

| Area | Status |
|---|---|
| SSE streaming /v1/runs → /v1/runs/{id}/events | ✅ Works end-to-end (Hermes GW → Don backend → ProfileChat) |
| WebSocket /ws/chat → Hermes gateway RPC | ✅ Established production path |
| HTTP proxy /gp/* for profile-routed requests | ✅ Complexity managed well |
| SSE header preservation in proxy | ✅ Text/event-stream headers correctly forwarded |
| Chat-persist (editor tab persistence) | ✅ Active, per-scope DB |
| ProfileChat IndexedDB persistence | ✅ Saves on every send / stop / resize |
| /ws/chat → handleChatMessage type safety | ⚠️ Uses `any` extensively |
| SSE parsing parity between backend + frontend | ⚠️ Duplicated, different safety checks |
| Test coverage | ❌ Tests are stubs (empty files) |
| `/bg` and `/queue` stream resilience | ⚠️ No retry on dropped stream |

---

## 7. Data Subscription channels (known API_SOURCES for context)

| Channel | URL | Type |
|---|---|---|
| Hermes GW Runs | `/v1/runs` `POST` | REST |
| Hermes GW Events | `/v1/runs/{id}/events` | SSE |
| Don Proxy | `/gp/*` → GW | HTTP Proxy |
| Don WS | `/ws/chat` | WebSocket |
| Don REST | `/api/*` | REST |
