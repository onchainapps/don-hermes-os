# Fix Report

**Date:** 2026-05-22  
**Total findings fixed:** 15 (7 CRITICAL, 6 HIGH, 1 MEDIUM, 1 verified-non-issue)

---

## CRITICAL

### C1 — Race condition in `sendMessage` guard
- **File:** `frontend/src/components/ProfileChat.tsx`
- **Change:** Replaced `isStreaming()` signal guard with module-level `let _sending = false` flag, set synchronously before any `await` and cleared in `finally`.
- **Commit:** `cb7bf34`

### C3 — CronPanel.action() bypasses profile routing
- **File:** `frontend/src/components/CronPanel.tsx`
- **Change:** `action()` now calls `cronUrl()` and `cronHeaders()` instead of raw `fetch(endpoint, ...)`.
- **Commit:** `0ffd30f`

### C5 — Delete dead WikiSearch.tsx
- **File:** `frontend/src/components/WikiSearch.tsx`
- **Change:** Deleted entire file (71 lines, never imported).
- **Commit:** `5f397a3`

### C7 — Add WS origin check on terminal upgrade
- **File:** `backend/server.ts`
- **Change:** `/terminal` WS upgrade now validates `Origin` against `localhost`, `127.0.0.1`, `[::1]`, and `GATEWAY_HOST`.
- **Commit:** `0fdb8ef`

### C8 — Delete duplicate insecure terminal server
- **File:** `backend/terminal-pty.js`
- **Change:** Deleted entire file (39 lines, separate WS server on port 3003 with no auth). Removed unused `node-pty` and `ws` deps from `package.json`.
- **Commit:** `e077185`

### C11 — Consolidate CORS allow-headers env var
- **Files:** `backend/server.ts`, `scripts/setup.mjs`
- **Change:** Removed the `API_SERVER_CORS_ALLOW_HEADERS` (typo, missing "ED") variant from both files. Kept only `API_SERVER_CORS_ALLOWED_HEADERS`.
- **Commit:** `bc7122c`

### C12 — /health must verify DB + gateway
- **File:** `backend/server.ts`
- **Change:** `/health` now opens `state.db` (pings `SELECT 1`) and fetches `GATEWAY_URL/health`. Returns `{status, db: boolean, gateway: boolean}`.
- **Commit:** `6dad405`

### C4 — Remove 23 dead `return jsonErr(500, "Internal error")`
- **File:** `backend/server.ts`
- **Change:** Removed all 23 unreachable `return jsonErr(500, "Internal error")` lines after try/catch blocks.
- **Commit:** `1b8fec5`

---

## HIGH

### H5 — `_refreshing` already in component function body
- **File:** `frontend/src/components/CronPanel.tsx`
- **Note:** Code review confirmed `let _refreshing = false` was already inside the `export default function CronPanel()` body (line 41), not at module scope. No change needed.

### H4 — Remove duplicate IndexedDB from ProfileChat, use chat-persist.ts
- **Files:** `frontend/src/components/ProfileChat.tsx`, `frontend/src/lib/chat-persist.ts`
- **Change:** Deleted 54 lines of duplicate `openDB`/`saveState`/`loadState` helpers. Now imports `saveSession`/`loadSession` from `chat-persist.ts`. Extended `PersistedSession` with optional `position`/`size` fields.
- **Commit:** `86b2a3e`

### H7 — Delete dead code in server.ts
- **File:** `backend/server.ts`
- **Change:** Removed `sqliteQuery()`, `sanitizeInt()`, `sqlEscape()`, `LOG_FILES`, `LOGS_DIR`, `DASHBOARD_AUTH_TOKEN` (6 dead symbols, 32 lines).
- **Commit:** `a40700a`

### H10 — Add SIGTERM/SIGINT graceful shutdown
- **File:** `backend/server.ts`
- **Change:** Added `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` handlers that kill terminal processes, abort chat runners, stop the server, and exit cleanly.
- **Commit:** `1c8a61f`

### H13 — Delete dead `detectHermesProfiles()` in setup.mjs
- **File:** `scripts/setup.mjs`
- **Change:** Removed the dead function (never called). The logic is already duplicated inline.
- **Commit:** `2a386c2`

### H15 — Consolidate duplicate .env template
- **Files:** `backend/server.ts`, `scripts/setup.mjs`
- **Change:** Exported `generateProfileEnv()` from `setup.mjs`. Server.ts now imports and calls it instead of maintaining a duplicate inline array.
- **Commit:** `c65c4c7`

---

## MEDIUM

### M6 — Add 1MB max body size check
- **File:** `backend/server.ts`
- **Change:** Added `async function readBody(req)` that checks `Content-Length` header (capped at 1MB) before calling `req.text()`. Replaced all 12 `await req.text()` calls with `await readBody(req)`.
- **Commit:** `578e420`

---

## Final Build Results

| Check | Status |
|---|---|
| `npx tsc --noEmit --skipLibCheck` (frontend) | **PASS** (exit 0) |
| `npx vite build --mode production` (frontend) | **PASS** (exit 0) |
| `bun build --target=bun server.ts` (backend) | **PASS** (exit 0) |

## Final `git log --oneline -10`

```
578e420 fix(M6): add 1MB max body size check on req.text() calls
c65c4c7 fix(H15): consolidate duplicate .env template into shared generateProfileEnv
2a386c2 fix(H13): delete dead detectHermesProfiles() in setup.mjs
1c8a61f fix(H10): add SIGTERM/SIGINT graceful shutdown handlers
a40700a fix(H7): remove dead code sqliteQuery, sanitizeInt, sqlEscape, LOG_FILES, LOGS_DIR, DASHBOARD_AUTH_TOKEN
86b2a3e fix(H4): remove duplicate IndexedDB impl from ProfileChat, use chat-persist.ts
1b8fec5 fix(C4): remove 23 unreachable return jsonErr(500, ...) dead code lines
6dad405 fix(C12): health endpoint now checks DB + gateway connectivity
bc7122c fix(C11): remove duplicate CORS ALLOW_HEADERS typo variant
e077185 fix(C8): delete duplicate insecure terminal server terminal-pty.js
```
