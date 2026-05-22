# OpenCode Audit: ModalChat Reference Case → ProfileChat

## 1. Project Context (What & Why)

### What we built
`don-hermes-os` is a self-contained SolidJS/Vite/TailCSS frontend entitling a conversational AI workspace — "The Don Hermes OS." It runs via `bun run dev` and proxies through the local backend at `http://127.0.0.1:3001`. The backend (Bun `server.ts`, ~1518 lines) does two things:

1. **`/api/gateway/*` proxy** — forwards GET/POST to `GATEWAY_HOST:GATEWAY_PORT` with `Authorization: Bearer GATEWAY_AUTH` (single global token from `~/dev/ecosystem.config.cjs`). This is the "default" path.
2. **`/gp/*` proxy** — profile-aware gateway proxy. Reads `~/.hermes/profiles/<name>/.env` for `API_SERVER_PORT` and `API_SERVER_KEY`. When `X-Hermes-Profile: <name>` header is present, routes `POST /v1/runs` → the Hermes SSE stream of that profile.

Hermes Gateways (Python processes):
```
PID 219353 → `hermes_cli.main gateway run --replace`         → 192.168.1.141:8642 (default / global)
PID 67275  → `hermes_cli.main --profile don-developer gateway run --replace` → 192.168.1.141:8651
PID 77680  → `hermes_cli.main --profile don-researcher gateway run --replace` → 192.168.1.141:8650
```
Each profile has its own `API_SERVER_KEY` in `~/.hermes/profiles/<name>/.env`. The global `dev-key-12345` in `ecosystem.config.cjs` is the `GATEWAY_AUTH` for the `/api/gateway/` proxy path to the default gateway (8642).

### Why we're doing this
- The default (ModalChat) chat component was **broken in production**: it used `API_BASE = '/gateway'` — a path that has **no backend route**. Every request went to a 404-like void.
- We had **two parallel chat implementations**: ModalChat (broken, default profile) and ProfileChat (working, named profiles). Maintaining both was dead code twice over.
- A 401 "unauthorized" error appeared after `GATEWAY_HOST: 0.0.0.0` meant the backend `/gp` proxy was routing back to itself on port 0, producing 502/401 errors.
- The goal: **retire ModalChat entirely, make ProfileChat handle both the default and named-profile paths**.

---

## 2. Auth Architecture (How)

### Before: ModalChat auth (BROKEN)
```
ModalChat.tsx:
  API_BASE = '/gateway'          <-- NO SUCH BACKEND ROUTE
  API_KEY  = import.meta.env.VITE_GATEWAY_AUTH || ''
  → fetch('/gateway/v1/runs', { headers: { Authorization: `Bearer ${API_KEY}` } })
```
- Relied on Vite env variable `VITE_GATEWAY_AUTH` embedded in the built JS bundle
- Template: `dev-key-12345` from `ecosystem.config.cjs` — never actually made it to the Vite config
- Result: Every request failed silently in production

### Before: ProfileChat auth (WORKING for named profiles)
```
ProfileChat.tsx:
  apiBase = '/gp'                                               ← correct backend proxy path
  X-Hermes-Profile: <name>                                      ← routes to correct port
  → GET/POST /gp/v1/runs → /v1/runs/{id}/events                ← proxy passes profile API_SERVER_KEY
```
- Backend `/gp` handler (server.ts:1426–1480):
  - Reads `X-Hermes-Profile` header
  - Reads `~/.hermes/profiles/<name>/.env` for `API_SERVER_PORT` + `API_SERVER_KEY`
  - Constructs `http://{GATEWAY_HOST}:{profilePort}{path}`
  - Sends `Authorization: Bearer <profile API_SERVER_KEY>` to the Hermes gateway
- Default path (no X-Hermes-Profile): falls through to `GATEWAY_AUTH` from `ecosystem.config.cjs`

### Auth flow diagram
```
ProfileChat (frontend)
  |
  ├─ named profile → X-Hermes-Profile: don-developer
  |                    → /gp reads don-developer/.env
  |                    → apiKey = AFAA...C47E  (API_SERVER_KEY)
  |                    → fetch to 192.168.1.141:8651/v1/runs → 202 [✓]
  |
  └─ default profile → no X-Hermes-Profile header
                       → /gp falls through to GATEWAY_AUTH
                       → apiKey = dev-key-12345
                       → fetch to 192.168.1.141:8642/v1/runs → 202 [✓]

`/api/gateway/` path:
  → always sends `Authorization: Bearer GATEWAY_AUTH` (hard-coded)
  → goes to 192.168.1.141:GATEWAY_PORT (default 8642)
```

---

## 3. ModalChat.tsx — Key Patterns (What to Review)

**ModalChat.tsx location** (deleted in commit `6210c45`):
```
frontend/src/components/ModalChat.tsx   ← 563 lines   ← RETIRED
```

Auth pattern from ModalChat (the BROKEN reference case):
```ts
const API_BASE = '/gateway';                           // no such backend route
const API_KEY  = import.meta.env.VITE_GATEWAY_AUTH || '';  // Vite env, never reaches server
```

Auth pattern from ModalChat's `fetchModelInfo`:
```ts
const headers: Record<string, string> = {};
if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
const res = await fetch(`${API_BASE}/v1/models`, { headers });
```
- On `createRes.ok` failure → `throw new Error(...)` → caught in `sendMessage` catch → shows `Error: ${err.message}` inline in chat

**Stream read pattern** (ModalChat — no AbortController on reader):
```ts
const streamRes = await fetch(`${API_BASE}/v1/runs/${runId}/events`, { headers: streamHeaders });
// NOTE: no signal/AbortController on this fetch
const reader = streamRes.body!.getReader();
while (true) {
  const { done, value } = await reader.read();  // blocks forever on stall
  ...
}
```

**ProfileChat stream (current, fixed)**:
```ts
abortController = new AbortController();  // new per send
const signal = abortController.signal;

const createRes = await fetch(`${apiBase}/v1/runs`, { headers, signal });
...
const streamRes = await fetch(`${apiBase}/v1/runs/${runId}/events`, { headers: streamHeaders, signal });
const reader = streamRes.body!.getReader();
while (true) {
  const { done, value } = await reader.read();  // abortController.signal survives here
  ...
}
```
- `stopStreaming()` called on `/stop`, component unmount, or send completion
- `abortController.abort()` + `reader.cancel()` in `stopStreaming()`
- `abortController = null` in finally block

---

## 4. Known Auth/Proxy Bugs (Repository-Level)

### 4a. `GATEWAY_HOST: 0.0.0.0` → 492
- The backend `/gp` proxy built target URLs like `http://0.0.0.0:{port}{path}` — routing back to *itself*
- Fixed: `GATEWAY_HOST` changed from `0.0.0.0` → `192.168.1.141` in `~/dev/ecosystem.config.cjs`

### 4b. PM2 env reload gap
- `pm2 restart --update-env` does NOT reload env vars from the config file — only restarts existing process
- A PID with **zero** `GATEWAY_*` env loaded was found (PID 325696 → `pm2 stop + delete + start <config>` fixed it)
- Current running PID 357696 has correct env

### 4c. `/gp` proxy sends auth to every gateway
- `/gp/handleGatewayProxy` (server.ts:1426–1480) unconditionally sends `GATEWAY_AUTH` on non-profile paths
- This is *by design* for the default profile path, but means default chat only works if `dev-key-12345` is accepted by the gateway at 8642

### 4d. don-developer 401 mystery (OPEN)
```
ProfileChat named path → X-Hermes-Profile: don-developer → apiKey from .env → 8651
Terminal test: 8651 works via proxy (202), BUT direct HTTP to 192.168.1.141:8651 → 401
```
**All three gateways return 401 to raw HTTP requests** regardless of the token. The `/gp` proxy path works because the backend proxy handles the HTTP differently. This is likely a gateway-process-level protocol mismatch (Hermes internal HTTP server expects a different auth scheme than raw HTTP Bearer token). **Not yet resolved.**

### 4e. `POST /v1/runs` no timeout (ProfileChat)
- Line 468: `fetch(`${apiBase}/v1/runs`, ...)` has no timeout
- If gateway stalls after auth, frontend hangs indefinitely

### 4f. `/events` in /gp has NO timeout
- server.ts:1457: `const timeout = targetPath.includes('/events') ? undefined : 120000;`
- SSE stream has no backend timeout — if Hermes gateway stalls mid-stream, it hangs forever

---

## 5. ModalChat Issues OpenCode Should Verify in ProfileChat

The audit should confirm ProfileChat does NOT inherit these ModalChat bugs:

| Bug | ModalChat had it | ProfileChat fixed? |
|-----|-----------------|-------------------|
| `/gateway` → no backend route | YES | `/gp` route exists |
| Bearer token broken auth | YES (`import.meta.env.VITE_GATEWAY_AUTH` never works) | ProfileChat: `/gp` proxy routes profile keys from `.env`, or `GATEWAY_AUTH` for default |
| `X-Hermes-Profile` header on DEFAULT profile | N/A (no concept of default) | ✅ Guard added: only sent when `props.profileName && !== 'default'` |
| SSE stream no abort/cancel on `stopStreaming()` | YES — reader.read() blocks forever | ✅ `abortController.abort()` + `reader.cancel()` in stopStreaming |
| `abortController = null` without abort | YES | ✅ abort before null |
| `import.meta.env` for auth | YES | No, uses `/gp` server-side |
| `last.role` nullable crash (no `?.`) | check | ✅ uses `last?.role` |
| Permissive log data in production | YES prompt data in log() | ProfileChat log() calls — review |

---

## 6. Active Changes to Verify (Review Only, Do Not Modify)

These are already committed. Audit only, no cuts.

- `frontend/src/components/ProfileChat.tsx` — auth header guards at lines 459 and 491, stream handler 509–564
- `backend/server.ts` — `handleGatewayProxy` lines 1426–1480, `readProfileEnv` 1407–1424
- `frontend/src/App.tsx` — ProfileManager imports removed, `openProfileChat` at line 67
- `frontend/src/components/MonacoEditor.tsx` — IDisposable leak fix at registerCodeActionProvider
- `frontend/src/lib/api-base.ts` — check what imports expect still work
- `AUDIT_PLAN.md` — already executed, shows prior audit bounds

---

## 7. What OpenCode Should Execute

1. **Read the audit context** — this file + ProfileChat.tsx + server.ts gateway proxy
2. **Verify ModalChat bugs are NOT present in ProfileChat** (section 5 table above)
3. **Scan for new dead-code patterns** introduced by the ModalChat→ProfileChat migration
4. **Check `hermesApi.ts`** — might have stale `chatStore` consumer
5. **Verify SSE stream error handling** — ProfileChat catch block at 567 shows `msg` inline: any 401/502/network-error becomes visible text. This is intentional transparency — flag only if message format is confusing.
6. **Check `AbortSignal.timeout` availability** — server.ts:1458 uses `AbortSignal.timeout()` which is modern Node.js 20+ API; verify the Bun runtime supports it.
7. **Check `POST /v1/runs` fetch in ProfileChat** — no timeout on line 468; recommend adding one.
## 9. OpenCode Should Execute (current audit — PID display + status polling)

Run this audit AFTER the ProfileManager changes in commit `5fdc153`.

**The user's complaint:**
> "the status of the profile/gateway doesn't update after start has been pressed I have to hard refresh the frontend"

**Root cause found:**
`hermes -p <name> gateway start` returns "✓ User service started" BEFORE systemd has the service up. When `fetchProfiles()` immediately calls `hermes gateway list`, the output is stale — still shows `✗ <name> — not running` for 1–3 seconds.

**The fix (ProfileManager.tsx):**
1. Changed `handleStart` / `handleStop` to use `fetchProfilesWithRetry(name)` instead of `fetchProfiles()`
2. `fetchProfilesWithRetry` polls `/profiles` up to 5 times with 1.2s delay until the profile's status changes to 'active' or 'standby'
3. Added 30s auto-poll interval (`setInterval`) so the dashboard stays fresh even without user action
4. Added `pid` to the `HermesProfile` interface and a green "PID {n}" badge next to the gateway port in the card header

### Verification Checklist

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| `fetchProfilesWithRetry` stops early when status changes | ❓ | Verify: does it `return` on first valid status? |
| Retry doesn't hammer on 500 | ❓ | Empty `catch {}` swallows errors — is this acceptable or should it surface? |
| 30s poll skips when `refreshingProfile()` is truthy | ❓ | Does the `onCleanup` clear the timer on unmount? |
| PID badge only shows when `profile.pid` is truthy | ❓ | `pid: 0` would not render (`when={0}` is falsy) — is `null` vs `0` handled correctly by backend? |
| Gateway port `Show when={profile.gatewayPort}` falsy-gate | ❓ | `gatewayPort: 0` would not render — same as PID issue |

### Known Issues to Flag

1. **Gateway port 0 bug** — backend `portMatch` can return `0` from `.env` line `API_SERVER_PORT=0000`. The frontend `Show when={profile.gatewayPort}` hides it (falsy). This means a profile with `API_SERVER_PORT=0000` gets no port badge, not even `:0`. Better: `Show when={profile.gatewayPort != null && profile.gatewayPort > 0}`.
2. **don-template's .env has a dummy API key** — `API_SERVER_KEY=12345` causes Hermes API server to refuse start: `"Refusing to start: API_SERVER_KEY is set to a placeholder value"`. The systemd service starts then immediately exits with code 1. This may be a general Hermes setup issue for profiles.
3. **Infinite loading state** — if `handleStart` POST succeeds but `fetchProfilesWithRetry` exhausts all 5 retries (6s total), the fallback fetch runs but the UI has already shown stale status for 6s. Not ideal. Consider: reduce retry count or show "refreshing..." spinner during retry.

### Code to Review

| File | What to check |
|------|---------------|
| `frontend/src/components/ProfileManager.tsx` | Signal declarations, `fetchProfilesWithRetry`, `handleStart`/`handleStop`/`handleDelete` retry usage, 30s auto-poll, PID badge rendering |
| `backend/server.ts` lines 462–535 | `GET /profiles` — how `gatewayPort` and `pid` are parsed. Check regex for edge cases. |
| `backend/server.ts` lines 762–812 | `POST /profiles/start` — timing: `execSync` blocks for gateway start, but `gateway list` still stale after. Consider `sleep 2` before status read. |
