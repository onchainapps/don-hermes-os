# Don Hermes OS Codebase Audit

**Date:** 2026-05-21
**Auditor:** OpenCode
**Scope:** frontend/src/ + backend/server.ts

## CRITICAL

### 1. `requestCancelled` SSE event silently swallowed (ModalChat + ProfileChat)
**Files:** `ModalChat.tsx:446`, `ProfileChat.tsx:535`

Both components have an empty `catch {}` inside the SSE parsing loop. If the gateway sends a `requestCancelled` event (or any malformed JSON), the error is silently swallowed. The UI remains stuck with `isStreaming=true`, the thinking animation keeps running indefinitely, and the assistant placeholder message is never updated with an error state. The user has no way to recover except closing the chat component.

**Fix:** Parse the event before the try/catch, check for `event.event === "requestCancelled"` (or similar cancellation events), and break the loop with an appropriate error message set on the last assistant message.

### 2. AbortController race window — double `sendMessage()` possible
**Files:** `ModalChat.tsx:357`, `ProfileChat.tsx:423`

Both components check `if (isStreaming()) return;` as the guard against concurrent sends. However, `stopStreaming()` sets `setIsStreaming(false)` synchronously (ModalChat:342, ProfileChat:405) *before* the streaming promise's `finally` block runs. If `stopStreaming()` is called (e.g., via `/stop` slash command) and then `sendMessage()` is triggered within the same tick — such as from voice input's `setTimeout(() => sendMessage(), 50)` (ModalChat:184, ProfileChat:265) — the old `abortController` reference is lost but the old streaming promise is still executing. The new `sendMessage()` creates a fresh `abortController` and proceeds, resulting in two concurrent streams writing to the same message array.

**Fix:** Add an additional guard using the `abortController` reference itself, not just `isStreaming()`. E.g., `if (abortController) return;` before creating a new one.

### 3. Error handler `last.role` null dereference (ProfileChat)
**File:** `ProfileChat.tsx:550`

In the `catch` block, `const last = updated[updated.length - 1]` is accessed without optional chaining: `if (last.role === 'assistant')`. If `messages()` is empty (edge case), `last` is `undefined` and accessing `.role` throws a TypeError. ModalChat has the same bug at line 457. Note: the *stream failure* handler (ProfileChat:491, ModalChat:401) correctly uses `last?.role`, but the catch block does not.

**Fix:** Use `if (last?.role === 'assistant')` in both catch blocks.

### 4. `/gp` proxy hardcodes `targetHost = '192.168.1.141'`
**File:** `backend/server.ts:1446`

When a profile has a port configured, the gateway proxy hardcodes the target host to `192.168.1.141` instead of using the `GATEWAY_HOST` env var. This breaks all profile routing if the backend runs on any machine other than `192.168.1.141`. The `/api/gateway` proxy (line 1349) correctly uses `GATEWAY_HOST`.

**Fix:** Use `targetHost = GATEWAY_HOST` or make it configurable per-profile via the `.env` file (e.g., `HERMES_GATEWAY_HOST`).

### 5. `/gp` proxy has hard 120s timeout that kills SSE streams
**File:** `backend/server.ts:1468`

The `/gp` proxy uses `AbortSignal.timeout(120000)` for ALL requests, including SSE event streams. Long-running agent sessions that take more than 2 minutes will have their stream abruptly terminated. The `/api/gateway` proxy (line 1349) does not set a timeout, allowing streams to run indefinitely.

**Fix:** Do not apply `AbortSignal.timeout` to streaming endpoints (`/events`). Use a longer timeout or no timeout for SSE paths.

## HIGH

### 6. `HermesProfile` type missing `apiKey` property
**File:** `ProfileManager.tsx:6-10`, `ProfileManager.tsx:367`

The `HermesProfile` interface declares `name`, `status`, and `gatewayPort` but NOT `apiKey`. Line 367 dispatches `profile.apiKey` in the `open-profile-chat` event, causing TypeScript error TS2339. The backend DOES return `apiKey` in the profiles response (server.ts:534), so the runtime value exists but the type is incomplete.

**Impact:** `ProfileChat` receives `apiKey: undefined` even when the profile has a key. Currently not used by ProfileChat (correctly, since auth is server-side), but breaks type safety and any future feature that needs it.

### 7. `Component` type not imported in SystemPanel
**File:** `SystemPanel.tsx:104`

The `MetricCard` component uses `Component` as a type for `icon` and `children` props, but `Component` is not imported from `solid-js`. Causes TypeScript errors TS2304 (×2).

### 8. ProfileChat missing `<Portal>` wrapper
**File:** `ProfileChat.tsx:632` vs `ModalChat.tsx:488`

ModalChat wraps its entire UI in `<Portal>` to render outside the React/Solid tree, avoiding z-index and stacking context issues. ProfileChat renders inline inside App.tsx's layout div (line 418-427). With `z-[999999]`, it works most of the time, but any parent with `transform`, `filter`, or `contain` CSS properties will create a new stacking context that can trap the modal behind other elements.

### 9. `requireAuth` middleware is dead code with unreachable return
**File:** `backend/server.ts:243-249`

The `requireAuth` function is defined but never called anywhere in the codebase. Additionally, line 247 returns a `Response` object (`jsonErr(401, ...)`) and line 248 has an unreachable `return false;`. If this function were ever used, it would return a Response instead of a boolean, breaking any guard pattern.

### 10. ProfileChat `onCleanup` calls `stopThinkingAnimation()` redundantly
**File:** `ProfileChat.tsx:625-626`

`onCleanup` calls `stopThinkingAnimation()` then `stopStreaming()`, but `stopStreaming()` already calls `stopThinkingAnimation()` internally (line 406). ModalChat's `onCleanup` only calls `stopStreaming()` (line 271), which is correct. Not a bug, but indicates drift from the canonical reference.

## MEDIUM

### 11. Empty catch blocks throughout (error swallowing)
**Files:** `ModalChat.tsx:235,446`, `ProfileChat.tsx:319,535`, `server.ts` (multiple)

Both chat components have empty `catch {}` blocks that silently swallow:
- JSON parse errors in SSE event parsing
- `fetchModelInfo()` network failures
- IndexedDB errors (these at least log a warning)

The backend server.ts has ~20 instances of unreachable `return jsonErr(500, "Internal error");` after try/catch blocks that already handle all paths (lines 408, 441, 451, 466, 542, 751, 767, 847, 908, 922, 939, 966, 991, 1006, 1020, 1181, 1202, 1215, 1229, 1260, 1283, 1305, 1322).

### 12. Model info fallback mismatch between ModalChat and ProfileChat
**Files:** `ModalChat.tsx:106`, `ProfileChat.tsx:117`

ModalChat defaults to `{ name: 'Qwen3.6-27B-FP8', context: 262111 }`, ProfileChat defaults to `{ name: 'grok-4.3', context: 10000000 }`. When `fetchModelInfo()` fails silently (which it always does if the gateway is offline), users see a model name that may not match the actual routing model. ProfileChat's `context: 10000000` is also suspiciously round (10M) vs ModalChat's specific `262111`.

### 13. ProfileManager `saveConfig` bypasses `hermesApi` helper
**File:** `ProfileManager.tsx:150-154`

The `saveConfig` function uses raw `fetch()` with a hardcoded `/api/hermes/profiles/config/raw` URL, while all other API calls in the component use the `hermesPost`/`hermesGet` helpers from `../lib/hermesApi`. Inconsistent API client usage means auth headers, base URL configuration, and error handling may differ.

### 14. ModalChat is commented out and drifting from canonical reference
**File:** `App.tsx:17`

`//import ModalChat from './components/ModalChat';` — ModalChat is designated as the canonical reference but is not used in production. As ProfileChat evolves independently, ModalChat will increasingly diverge, losing its value as a reference implementation. Consider either removing ModalChat or keeping it as a dev-only toggle.

### 15. ProfileChat logs `gatewayPort` but correctly doesn't use it for URLs
**File:** `ProfileChat.tsx:432`

`log('Sending message', { text, gatewayPort: props.gatewayPort });` — The log includes `gatewayPort` which may mislead developers into thinking it's used for routing. The actual fetch goes through `/gp` (line 460), which resolves the port server-side. This is correct behavior per the audit instructions, but the log is misleading.

## LOW

### 16. ProfileChat resize handle container missing `relative` class
**File:** `ProfileChat.tsx:633` vs `ModalChat.tsx:490`

ModalChat's container div has `relative` class (line 490), ensuring the `absolute` positioned resize handle (line 597) is positioned relative to the modal. ProfileChat's container (line 633) lacks `relative`, so the resize handle's `absolute bottom-1 right-1` positioning is relative to the nearest positioned ancestor (or the viewport), which may cause misalignment.

### 17. ProfileChat default dimensions differ from ModalChat
**Files:** `ModalChat.tsx:99`, `ProfileChat.tsx:115`

ModalChat: `width: 720, height: 640`. ProfileChat: `width: 520, height: 620`. The narrower width (520px) may cause code blocks and wide content to wrap awkwardly in the chat view.

### 18. ProfileChat header omits context size badge
**Files:** `ModalChat.tsx:505-507`, `ProfileChat.tsx:655-657`

ModalChat shows `{modelInfo().name} · {Math.floor(modelInfo().context / 1000)}k` in the header. ProfileChat only shows `{modelInfo().name}`. Users lose the context window size information.

### 19. Session timestamps lack timezone info
**Files:** Both components

Neither ModalChat nor ProfileChat includes timezone information when persisting session timestamps (`updatedAt: Date.now()`). When displaying session times to users, there's no way to disambiguate local vs UTC.

### 20. ProfileChat `closeModal` dispatches event but ModalChat does not
**File:** `ProfileChat.tsx:391`

ProfileChat dispatches `profile-chat-close` custom event on close, which App.tsx listens to for cleanup (line 169-175). ModalChat has no equivalent event. This is correct since ModalChat is legacy, but worth noting for completeness.

## TypeScript Error Count

```
Total errors: 21
In-scope errors (audited files only): 3
  - ProfileManager.tsx: 1 (apiKey missing from HermesProfile type)
  - SystemPanel.tsx: 2 (Component type not imported)
Out-of-scope errors (frontend/src/lib/chat-ui/): 18
  - ChatWindow.tsx: 10 (rpc, reconnectionStatus missing types)
  - ConnectionStatus.tsx: 1 (ConnectionState not exported)
  - createHermesChat.ts: 6 (argument count, property missing, type conversion)
  - profileChatStore.ts: 1 (argument count)
```

## ModalChat → ProfileChat Diff Summary

### What ProfileChat Got Right
1. **Correct production routing:** Uses `/gp` proxy with `X-Hermes-Profile` header instead of `/api/gateway` with client-side `Authorization: Bearer`. Auth is resolved server-side from the profile's `.env`.
2. **Per-profile isolation:** DB key is `profile-chat-{id}` (per-profile) vs ModalChat's global `modal-chat-v1`.
3. **Session ID tracking:** ProfileChat captures and persists `session_id` from run responses (line 477-479), ModalChat does not.
4. **Multi-instance support:** ProfileChat is designed as a reusable component with props, allowing multiple profile chats open simultaneously. ModalChat is a singleton.
5. **Auto-scroll:** ProfileChat has a `createEffect` + `messagesEndRef` for auto-scrolling (line 592-599). ModalChat lacks this.
6. **Better logging:** ProfileChat has a `log()` helper with profile name prefix for debugging.
7. **Drag listeners on `window`:** ProfileChat uses `window.addEventListener` for drag/resize vs ModalChat's `document.addEventListener`, which is more consistent with modern patterns.

### What ProfileChat Lost or Broke
1. **`requestCancelled` handling:** Same empty catch block as ModalChat — the canonical reference's bug was copied, not fixed.
2. **AbortController race:** Same vulnerability — `isStreaming()` guard can be bypassed between `stopStreaming()` and the `finally` block.
3. **`last.role` null deref in catch block:** ModalChat's bug was copied verbatim.
4. **No `<Portal>` wrapper:** ModalChat correctly uses `<Portal>`; ProfileChat renders inline, risking stacking context issues.
5. **Missing context size in header:** ModalChat shows model name + context window; ProfileChat shows only model name.
6. **Redundant `stopThinkingAnimation()` in onCleanup:** ProfileChat calls it twice (once directly, once via `stopStreaming()`).
7. **Smaller default width:** 520px vs 720px, potentially causing content wrapping issues.
