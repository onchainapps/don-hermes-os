# Audit Report: ModalChat Retirement → ProfileChat Migration

**Date:** 2026-05-21  
**Scope:** ModalChat→ProfileChat migration, auth architecture, SSE stream handling, ProfileManager PID/status polling  
**Mode:** Read-only audit — no files modified.

---

## Section 5 Verification Table: ModalChat Bugs → ProfileChat

| Bug | ModalChat had it | ProfileChat status | Verdict |
|-----|-----------------|-------------------|---------|
| `/gateway` → no backend route | YES | `/gp` route exists (`server.ts:1395`) | ✅ PASS |
| Bearer token broken auth (`import.meta.env.VITE_GATEWAY_AUTH`) | YES | Uses `/gp` server-side proxy with per-profile `.env` keys or `GATEWAY_AUTH` for default | ✅ PASS |
| `X-Hermes-Profile` header on default profile | N/A | Guarded: `if (props.profileName)` at lines 459, 493 — only sent when truthy | ✅ PASS |
| SSE stream no abort/cancel on stopStreaming() | YES | `abortController.abort()` + `reader.cancel()` in `stopStreaming()` at lines 400-411 | ✅ PASS |
| `abortController = null` without abort | YES | `abort()` called before null in all paths (lines 400-403, 589) | ✅ PASS |
| `import.meta.env` for auth | YES | No `import.meta.env` usage in ProfileChat | ✅ PASS |
| `last.role` nullable crash (no `?.`) | Checked | Uses `last?.role` throughout (lines 501, 528, 545, 554, 578) | ✅ PASS |
| Permissive log data in production | YES — prompt data in log() | ProfileChat line 440: `log('Sending message', { text })` — same pattern persists | ⚠️ PASS (same behavior, LOW) |

---

## CRITICAL Findings

### C1. `gateway.ts` — Stale `VITE_GATEWAY_AUTH` + `/api/gateway` route

**File:** `frontend/src/lib/gateway.ts:6-7`
```ts
const GATEWAY_URL = '/api/gateway';
const GATEWAY_AUTH = import.meta.env.VITE_GATEWAY_AUTH || '';
```

**Imported by:** `frontend/src/components/MonacoEditor.tsx:2` — used in `chatRequest()` for diff preview and inline edit features.

**Analysis:** Unlike ModalChat (which used `/gateway` with no backend route), this uses `/api/gateway` which IS handled by `server.ts:1318-1361`. So it's *functional* for the global gateway. However, it relies on `VITE_GATEWAY_AUTH` (an env var that the audit context says "never actually made it to the Vite config" in production). This is the **exact same broken auth pattern** as ModalChat, just on a different URL path.

**Severity:** HIGH — works in dev with Vite proxy but may silently fail in production builds where `import.meta.env.VITE_GATEWAY_AUTH` is undefined. The `/api/gateway` route also bypasses profile-awareness entirely.

### C2. `gateway.ts`/`gatewayClient.ts` discrepancy in `AUDIT_PLAN.md`

**File:** `AUDIT_PLAN.md:19` lists `gateway.ts` as having "0 imports". This is **incorrect** — `MonacoEditor.tsx:2` imports `gatewayChatUrl` and `gatewayHeaders` from `../lib/gateway`. The 0-import file is `gatewayClient.ts` (note `Client` suffix), which IS dead code.

**Severity:** MEDIUM — audit plan inaccuracy, might cause premature deletion of a live file.

---

## HIGH Findings

### H1. `gatewayPort: 0` / `pid: 0` falsy-gate in ProfileManager

**File:** `frontend/src/components/ProfileManager.tsx:377,382`
```tsx
<Show when={profile.gatewayPort}>     // line 377
<Show when={profile.pid}>             // line 382
```

**Problem:** `gatewayPort: 0` is falsy in JS. Backend `server.ts:509` parses `API_SERVER_PORT=(\d+)` — if `.env` contains `API_SERVER_PORT=0000`, `parseInt()` returns `0`, and the port badge is hidden. Similarly `pid: 0` (though unlikely since `pid` is `null` when no PID match, never `0`).

**Recommended fix:**
```tsx
<Show when={profile.gatewayPort != null && profile.gatewayPort > 0}>
<Show when={profile.pid != null && profile.pid > 0}>
```

**Severity:** HIGH — user gets no port badge for misconfigured profiles.

### H2. SSE stream fetch has no timeout

**File:** `frontend/src/components/ProfileChat.tsx:495`
```ts
const streamRes = await fetch(`${apiBase}/v1/runs/${runId}/events`, { headers: streamHeaders, signal });
```

**Problem:** The 60s timeout (`createTimeout` at line 468) is cleared at line 475 after the POST fetch. The subsequent stream fetch at line 495 uses the same `abortController.signal` but has no independent timeout. If the gateway accepts the stream connection but never sends data, `reader.read()` at line 512 hangs indefinitely until the user types `/stop`.

**Backend /gp proxy** (`server.ts:1457`) also has no timeout for `/events` paths:
```ts
const timeout = targetPath.includes('/events') ? undefined : 120000;
```

**Severity:** HIGH — hung stream requires manual intervention.

### H3. `POST /profiles/start` race condition — stale gateway list

**File:** `backend/server.ts:787-801`
```ts
execSync(`hermes -p ${JSON.stringify(name)} gateway start`, { ... });
const statusOutput = execSync(`${name} gateway status 2>/dev/null || echo "started"`, { ... });
```

**Problem:** `hermes gateway start` returns before systemd has the service fully up. When `fetchProfiles()` calls `hermes gateway list`, the output is stale for 1-3 seconds. The frontend's `fetchProfilesWithRetry` (5 retries × 1.2s = 6s total) compensates but the backend response itself confirms "started" immediately without verification.

**Severity:** HIGH — causes the exact user complaint ("status doesn't update after start").

---

## MEDIUM Findings

### M1. `.env.example` references stale `VITE_GATEWAY_AUTH`

**File:** `frontend/.env.example`
```
VITE_GATEWAY_AUTH=
VITE_GATEWAY_URL=http://192.168.1.141:8642
```

Both env vars are obsolete after the ModalChat→ProfileChat migration. `VITE_GATEWAY_AUTH` is only still consumed by `gateway.ts` (which should be updated/removed).

### M2. `fetchProfilesWithRetry` swallows errors silently

**File:** `frontend/src/components/ProfileManager.tsx:95,102`
```ts
} catch {}
...
} catch {}
```

**Problem:** If the server returns 500 across all 5 retries, the user sees no error feedback — the UI simply doesn't update. The final fallback fetch at line 99-101 also silently catches.

### M3. AUDIT_PLAN.md incorrectly lists `gateway.ts` as dead code

**File:** `AUDIT_PLAN.md:19`

Lists `src/lib/gateway.ts` as having "0 imports" but it IS imported by `MonacoEditor.tsx:2`. The dead file is `src/lib/gatewayClient.ts` (with `Client` suffix).

### M4. Dead files not yet cleaned up

**File:** `AUDIT_PLAN.md:14-18` lists these with confirmed 0 imports:
- `src/lib/gatewayClient.ts` — marked `@deprecated`
- `src/lib/chatClient.ts` — marked `@deprecated`
- `src/lib/chatStore.ts` — confirmed 0 imports via grep
- `src/lib/chatStorage.ts` — confirmed 0 imports via grep
- `src/lib/slashRpc.ts` — confirmed 0 imports via grep
- `src/components/hermes/*` — 7 components, all confirmed 0 imports

These were identified in Phase 1 of the existing audit plan but not yet deleted.

### M5. `/api/gateway/` backend proxy has no timeout (SSE)

**File:** `backend/server.ts:1341`
```ts
const proxyRes = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}${gatewayPath}`, proxyOpts);
```

Unlike the `/gp` proxy (which conditionally disables timeout for `/events`), the `/api/gateway/` proxy has no timeout at all — no `AbortSignal.timeout`, no `AbortController`. This applies even though `gateway.ts` calls this route.

### M6. `AbortSignal.timeout` availability

**File:** `backend/server.ts:1458`
```ts
const signal = timeout ? AbortSignal.timeout(timeout) : undefined;
```

**Verdict:** Bun (the runtime) implements Web-standard `AbortSignal.timeout()`. Available since Bun v0.7+. The project uses Bun, so this is safe. However, the `AbortSignal.timeout()` creates a signal that cannot be aborted externally — any abort triggered by the user's `stopStreaming` won't affect it once the 120s timeout expires. This is fine because the signal is only for the backend→gateway fetch, not the frontend→backend connection.

---

## LOW Findings

### L1. Logging user message text in production

**File:** `frontend/src/components/ProfileChat.tsx:440`
```ts
log('Sending message', { text });
```

Logs the user's full message text to console. Consistent with old ModalChat behavior. Low risk for a local dashboard but worth noting for production hardening.

### L2. `message.delta` appending creates new array each frame

**File:** `frontend/src/components/ProfileChat.tsx:542-549`

Each SSE delta creates a new `messages` array via the spread operator in `setMessages`. For very frequent deltas (e.g., character-by-character), this causes unnecessary GC pressure. Minor performance concern only.

### L3. ProfileChat `retry` slash command behavior

**File:** `frontend/src/components/ProfileChat.tsx:225-233`
```ts
if (cmd === '/retry') {
  const msgs = messages();
  const lastUser = [...msgs].reverse().find(m => m.role === 'user');
  if (lastUser) {
    setInput(lastUser.content);
    setMessages(prev => prev.slice(0, -2)); // pop last assistant + user
  }
  return true;
}
```

Pops the last 2 messages (assistant + user pair). If the last message is a user message (no assistant response yet), this pops the wrong message. Edge case.

---

## Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| CRITICAL | 1 | C1: `gateway.ts` stale auth pattern (functional but fragile) |
| HIGH | 3 | H1: falsy-gate for `gatewayPort:0`/`pid:0`; H2: no SSE stream timeout; H3: gateway start race condition |
| MEDIUM | 6 | M1: stale `.env.example`; M2: silent error swallowing; M3: AUDIT_PLAN inaccuracy; M4: dead files; M5: `/api/gateway` no timeout; M6: AbortSignal timeout check |
| LOW | 3 | L1: permissive logging; L2: array churn; L3: retry pop edge case |

### Previously fixed items (verified clean)
- ✅ ModalChat's `/gateway` → no route bug: ProfileChat uses `/gp` which has `handleGatewayProxy`
- ✅ ModalChat's `VITE_GATEWAY_AUTH` auth: ProfileChat uses server-side `.env` keys or `GATEWAY_AUTH`
- ✅ ModalChat's missing AbortController: ProfileChat has full `stopStreaming()` with abort + reader.cancel
- ✅ ModalChat's nullable crash: ProfileChat uses optional chaining (`last?.role`)
- ✅ `GATEWAY_HOST: 0.0.0.0` → `192.168.1.141` (ecosystem.config.cjs)
- ✅ `fetchProfilesWithRetry` polls and returns early on status change
- ✅ 30s auto-poll with `!refreshingProfile()` guard
- ✅ `onCleanup` clears `pollTimer`
- ✅ PID badge only renders when `profile.pid` is truthy

AUDIT_COMPLETE: 13 findings across 6 files. Main issues: stale gateway.ts auth pattern, falsy port/pid gates, no SSE stream timeout, gateway start race condition. Previously fixed items verified clean.
