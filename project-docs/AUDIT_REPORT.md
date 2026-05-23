# Codebase Audit Report

**Generated:** 2026-05-22  
**Scope:** `frontend/src/`, `backend/`, `scripts/`, `.hermes/`  
**Methodology:** Static analysis, cross-reference search, pattern matching

---

## Severity Classification

| Severity | Criteria |
|----------|----------|
| **CRITICAL** | Data loss, security vulnerability, broken functionality, silent failure |
| **HIGH** | Significant maintainability burden, incorrect behavior, potential crashes |
| **MEDIUM** | Code smells, minor inefficiencies, missing edge-case handling |
| **LOW** | Cosmetic, stale docs, commented-out code |

---

## CRITICAL FINDINGS

### C1. Race condition in `sendMessage` – concurrent streaming requests
**File:** `frontend/src/components/ProfileChat.tsx:513-539`  
**Severity:** CRITICAL  

TOCTOU race between `isStreaming()` check and `setIsStreaming(true)`. Two rapid Enter presses in the same microtask can both pass the guard (line 513) before either sets the flag (line 532), resulting in two concurrent streaming requests sharing the same `messages()` signal.

```
User presses Enter twice
  → sendMessage() call #1 (isStreaming() = false, passes)
  → sendMessage() call #2 (isStreaming() = false, ALSO passes!!)
  → setIsStreaming(true)   ← only prevents a 3rd, not the 2nd
  → setIsStreaming(true)
  → Two concurrent AbortControllers, both writing to messages()
```

**Fix:** Use a **module-level mutable flag** (not a signal) that is set synchronously before any `await`, or queue the second invocation.

---

### C2. Tab limit enforcement never implemented – unbounded memory growth
**File:** `frontend/src/components/MonacoEditor.tsx:1002-1007`  
**Severity:** CRITICAL  

```typescript
if (updated.length > 30) {
  console.warn('Tab limit reached (30). Closing oldest non-dirty tab.');
  // Simple limit enforcement - could be improved with LRU
}
```

Logs a warning but **never actually closes tabs**. Users can open unlimited tabs, consuming unbounded memory. Comment admits the enforcement was never implemented. If eventually enforced, it will silently close tabs without confirmation.

---

### C3. Per-profile cron actions bypass profile routing
**Files:** `frontend/src/components/CronPanel.tsx:63-71, 260-288`  
**Severity:** CRITICAL  

The `action()` helper uses raw `fetch(endpoint, ...)` without `cronHeaders()` or `cronUrl()`. It calls hardcoded `/api/jobs/...` endpoints instead of profile-aware routes. Per-profile cron pause/resume/run operations hit the **global** cron API, rendering profile-scoped controls non-functional.

---

### C4. 23 instances of unreachable dead code after `return` statements
**File:** `backend/server.ts` at lines: 420, 453, 463, 478, 555, 765, 781, 864, 926, 942, 961, 1034, 1059, 1074, 1088, 1249, 1270, 1283, 1297, 1328, 1351, 1373, 1390  
**Severity:** CRITICAL  

Every HTTP handler follows the pattern:
```typescript
try {
  ...
  return jsonOk(...);    // always returns
} catch (e: any) {
  return jsonErr(...);   // always returns
}
return jsonErr(500, "Internal error");  // NEVER REACHED (x23)
```

23 dead `return` statements after try/catch blocks. Every handler's catch already returns. These constitute dead code that obscures control flow.

---

### C5. `WikiSearch.tsx` – entirely dead component
**File:** `frontend/src/components/WikiSearch.tsx` (71 lines)  
**Severity:** CRITICAL  

The `WikiSearch` component is **never imported or used** anywhere in the codebase. The actual search UI is implemented inline in `WikiPanel.tsx`. Also, `createSignal` is imported (line 1) but never used.

---

### C6. Three test files are empty stubs – zero test coverage
**Files:**
- `backend/tests/chat.test.ts` – `export {}` only
- `backend/tests/label-propagation.test.ts` – `export {}` only
- `backend/e2e-chat-test.ts` – `export {}` only  
**Severity:** CRITICAL

Every file contains only `export {};` with a comment "Legacy test — WebSocket path removed". No assertions, no test cases. Any code change is untested.

---

### C7. Terminal WebSocket has no authentication or input validation
**File:** `backend/server.ts:208-228`  
**Severity:** CRITICAL  

`handleTerminalUpgrade` spawns a bash process and connects directly to any WebSocket client. `handleTerminalMessage` writes raw input to stdin with no sanitization – full arbitrary command execution. Any client reaching the WebSocket endpoint gets a shell.

---

### C8. `terminal-pty.js` is a duplicate unsecured terminal server
**File:** `backend/terminal-pty.js` (entire file)  
**Severity:** CRITICAL  

Runs a completely separate WebSocket server on port 3003 using `node-pty` with no authentication. Duplicates the terminal functionality already in `server.ts:208-228` but uses a different library (`node-pty` + `ws` vs `Bun.spawn`). Two independent terminal implementations with inconsistent behavior; double the attack surface.

---

### C9. Hardcoded LAN IP in deploy/upgrade verification will fail on other machines
**Files:** `scripts/deploy.sh:75`, `scripts/upgrade.sh:137`  
**Severity:** CRITICAL  

```bash
-H "Origin: http://192.168.1.141:5173"
```

Both scripts hardcode `192.168.1.141` in CORS verification curl tests. On any other machine, these checks return false negatives, causing deploy/upgrade to falsely report failure.

---

### C10. Version bump applied before build succeeds – dirty state risk
**File:** `scripts/upgrade.sh:45-56, 144-155`  
**Severity:** CRITICAL  

Version bump is applied to all three `package.json` files **before** any building/packing. If the build or global install fails, `package.json` is already modified on disk with no automated rollback. Partial failure leaves the working tree dirty.

---

### C11. Duplicate CORS allow-headers env var (likely typo)
**Files:** `scripts/setup.mjs:104-105`, `backend/server.ts:686-687`  
**Severity:** CRITICAL  

Both `API_SERVER_CORS_ALLOW_HEADERS=*` (missing `ED`) and `API_SERVER_CORS_ALLOWED_HEADERS=*` coexist. One is silently ignored by the gateway, potentially causing unexpected CORS header filtering.

---

### C12. Gateway health and DB health not verified in `/health` endpoint
**File:** `backend/server.ts:350-352`  
**Severity:** CRITICAL  

The `/health` endpoint returns `{ status: 'ok' }` unconditionally. It does **not** verify:
- Database connectivity (SQLite `state.db`)
- Gateway reachability (`GATEWAY_URL`)
- Filesystem writability

A "healthy" response can be returned while the database is locked or the gateway is unreachable.

---

## HIGH FINDINGS

### H1. Hardcoded `/home/don/dev` path appears 7+ times as fallback
**Files:**
| File | Line | Code |
|------|------|------|
| `frontend/src/App.tsx` | 52 | `createSignal<string>('/home/don/dev')` |
| `frontend/src/components/FileTree.tsx` | 94 | `props.rootPath \|\| '/home/don/dev'` |
| `frontend/src/components/MonacoEditor.tsx` | 265, 1126 | `projectRoot === '/home/don/dev'` |
| `frontend/src/components/GitPanel.tsx` | 18 | `props.repoPath \|\| '/home/don/dev'` |
| `frontend/src/components/EditorTerminal.tsx` | 58 | `cwd \|\| props.projectPath \|\| '/home/don/dev'` |
| `backend/server.ts` | 25, 210, 212, 230, 486, 510, 576, 583, 600, 604, 613, 615, 664, 667, 1101, 1309, 1334, 1481, 1526 | `process.env.HOME \|\| '/home/don'` |

**Severity:** HIGH  

On any other machine, these fallbacks point to non-existent directories, breaking file tree, editor, git panel, terminal, and backend operations on first launch.

---

### H2. Hardcoded ports and gateway URLs in `api-base.ts`
**File:** `frontend/src/lib/api-base.ts:21-22, 37-38`  
**Severity:** HIGH  

```typescript
if (port === '5173') return '';                    // dev
if (port === '3002') return `http://${host}:3001`; // prod dashboard
if (port === '5173') return `${host}:5173`;        // dev WS
if (port === '3002') return `${host}:3001`;        // prod dashboard WS
```

Ports 5173, 3002, 3001 hardcoded. `VITE_API_BASE_URL` env var can override HTTP but **WS host has no env override**. If ports change, frontend breaks silently.

---

### H3. Hardcoded gateway port `8642` in display strings
**Files:**
- `frontend/src/components/StatusBar.tsx:94` – `GW:${props.gatewayOnline ? '8642' : 'OFF'}`
- `frontend/src/components/SystemPanel.tsx:218` – `{key === 'Port' && '8642'}`  
**Severity:** HIGH

Gateway port hardcoded in UI labels. If gateway port changes, UI will show incorrect port while still functioning.

---

### H4. Duplicate IndexedDB persistence implementations
**Files:**
- `frontend/src/lib/chat-persist.ts` (103 lines) – reusable library
- `frontend/src/components/ProfileChat.tsx:40-83` (43 lines) – reimplements `openDB`, `saveState`, `loadState`  
**Severity:** HIGH

ProfileChat's inlined implementation calls `db.close()` inside `tx.oncomplete`, which closes the shared IndexedDB connection cached by `chat-persist`. If other code uses the same DB concurrently, this causes `TransactionInactiveError`. The inlined version should be replaced with `chat-persist.ts` calls.

---

### H5. `_refreshing` module-level flag shared across CronPanel instances
**File:** `frontend/src/components/CronPanel.tsx:41`  
**Severity:** HIGH  

```typescript
let _refreshing = false;
```

Module-level variable, not a signal or instance property. If multiple CronPanel instances exist (overlay vs standalone), they share this flag causing incoherent loading states.

---

### H6. `loadConfig` fetches raw YAML config (including secrets) just to extract model name
**File:** `frontend/src/components/ProfileChat.tsx:359-377`  
**Severity:** HIGH  

Fetches the full raw profile config `/api/hermes/profiles/config/raw?name=...` including **API keys and env vars** – transmitted to the frontend just to regex-extract the model name.

---

### H7. Three defined but never-used backend functions/constants
**File:** `backend/server.ts`  
**Severity:** HIGH  

| Symbol | Line | Status |
|--------|------|--------|
| `sqliteQuery()` | 290 | Shells out to `sqlite3 -json` CLI, never called |
| `sanitizeInt()` | 284 | Input sanitization, never called |
| `sqlEscape()` | 279 | String escaping for SQL, never called |
| `DASHBOARD_AUTH_TOKEN` | 30 | Read from env, never used in any handler |
| `LOG_FILES` | 235 | Map of log file names, never used |
| `LOGS_DIR` | 233 | Never used |

---

### H8. No database connection pooling – opened/closed per-request
**File:** `backend/server.ts` at lines 1111, 1132, 1162, 1175, 1198  
**Severity:** HIGH  

`new Database(stateDbPath)` opens a new SQLite connection for every request, with `.close()` after. Under concurrent load, this can exhaust file descriptors or cause `SQLITE_BUSY`. Some handlers open the DB **outside** the try block (lines 1162, 1175, 1198), risking unhandled crashes.

---

### H9. Command injection risk in `execSync` calls
**File:** `backend/server.ts`  
**Severity:** HIGH  

- Line 1358: `git -C ${repo} status` – `repo` is user-controlled via query param, not shell-escaped (only `decodeURIComponent`)
- Line 1264: `hermes ${args.join(' ')}` – `shell: true` semantics, args with spaces/special chars break
- Line 587: `hermes profile create ${JSON.stringify(name)}` – only call with proper escaping

---

### H10. No graceful shutdown handler
**File:** `backend/server.ts`  
**Severity:** HIGH  

No `process.on('SIGTERM', ...)` or `process.on('SIGINT', ...)`. Active WebSocket connections and spawned terminal processes are not cleaned up on shutdown.

---

### H11. 70% code duplication between `deploy.sh` and `upgrade.sh`
**Files:** `scripts/deploy.sh`, `scripts/upgrade.sh`  
**Severity:** HIGH  

Build, pack, install, PM2 restart, and verification logic is copy-pasted across both files. Any fix must be applied in two places. The `check()` function (7 lines) is identical in both.

---

### H12. PM2 restart uses fixed sleep instead of health-poll loop
**Files:** `scripts/deploy.sh:48-49`, `scripts/upgrade.sh:106-107`  
**Severity:** HIGH  

`sleep 3` / `sleep 2` after `pm2 restart` instead of polling the `/health` endpoint. On slow systems, PIDs may not exist yet, causing stale reads.

---

### H13. Dead function: `detectHermesProfiles()` defined but never called
**File:** `scripts/setup.mjs:70-76`  
**Severity:** HIGH  

Function is defined but never called. The same logic is duplicated inline at lines 177-179.

---

### H14. `corsPortsDefault` variable assigned but never used
**File:** `scripts/setup.mjs:198`  
**Severity:** HIGH  

```javascript
let corsPortsDefault = ['3001', '3002'];  // never referenced again
```

---

### H15. Duplicate `.env` template (setup.mjs vs server.ts)
**Files:** `scripts/setup.mjs:93-120`, `backend/server.ts:679-702`  
**Severity:** HIGH  

~40 lines of `.env` template duplicated. The two copies have already drifted slightly (comment formatting). Any new env var must be added in two places.

---

### H16. Platform assumptions: `systemctl --user`, `/bin/bash`, `hermes` binary on PATH
**Files:** `backend/server.ts:209, 848`, `backend/terminal-pty.js:8`  
**Severity:** HIGH  

- `systemctl --user` assumes systemd (non-portable to Alpine, macOS, etc.)
- `/bin/bash` hardcoded instead of `$SHELL` or `os.homedir()`
- `hermes` binary assumed on `PATH` (13+ references)

---

## MEDIUM FINDINGS

### M1. `fetchModelInfo` silent failure on gateway error
**File:** `frontend/src/components/ProfileChat.tsx:339-357`  
If gateway models endpoint fails, model info silently stays at hardcoded default with no user feedback.

### M2. `chatRequest` in MonacoEditor has no timeout/abort mechanism
**File:** `frontend/src/components/MonacoEditor.tsx:538-548`  
Unlike streaming chat (60s timeout), non-streaming `chatRequest` has no timeout or abort controller. A slow gateway hangs the editor indefinitely.

### M3. Weak error handling – empty catch blocks and unawaited async calls
**Files:**
- `frontend/src/components/FileTree.tsx:255` – outer catch logs, inner fetches have no error handling
- `frontend/src/components/ProfileManager.tsx:354` – `catch { /* backend not available, leave empty */ }` – silent swallow
- `frontend/src/components/GitPanel.tsx:271` – `refresh()` called without `await`

### M4. Timer cleanup gaps
**Files:**
- `frontend/src/components/ProfileManager.tsx:238` – `setTimeout` for status message not cleaned on unmount
- `frontend/src/components/EditorTerminal.tsx:145-152` – `retryTimeout` for WebSocket reconnect not cancelled on fast unmount (though `onCleanup` exists)
- `frontend/src/components/CronPanel.tsx:63-71` – `setTimeout(fetchJobs, 500)` in `action()` not cleaned up if unmounted

### M5. `pendingTool` array never read or written – potential leak if extended
**File:** `frontend/src/components/ProfileChat.tsx:140`  
Module-level `const pendingTool: { id: string; name: string; startTime: number }[] = [];` is declared but never referenced.

### M6. No request size limits on backend
**File:** `backend/server.ts`  
`await req.text()` is called without size checks. Large payloads can exhaust memory (DoS vector).

### M7. CORS set to `*` on all responses
**File:** `backend/server.ts:321, 328, 338-341, 1555-1556`  
Acceptable for local dev but insecure if the backend is ever exposed to a network.

### M8. WebSocket `handlerType` stored via `(ws as any)` casts
**File:** `backend/server.ts:44, 1585-1601`  
TypeScript safety bypassed. `data` object passed via `server.upgrade(req, { data: { pathname } })` is available but ignored.

### M9. Duplicate hostname IP detection in profile creation
**File:** `backend/server.ts:641-646` and `664-669`  
`execSync('hostname -I')` logic duplicated verbatim in the "clone from template" and "no template" branches.

### M10. Wiki watcher has no overlap protection
**File:** `frontend/scripts/watch-wiki.sh:22, 31`  
Polling loop sleeps 30s then runs Python generator. If generator takes >30s, invocations overlap with no lock guard.

### M11. `|| true` masking real failures in deploy/upgrade
**Files:** `scripts/deploy.sh:41-42, 48`, `scripts/upgrade.sh:100-101, 106`  
`npm install -g` and `pm2 restart` errors are silenced by `|| true`.

### M12. PID file glob vulnerable to stale matches
**File:** `scripts/deploy.sh:51-52`  
Glob `~/.pm2/pids/don-os-backend-*.pid` may match stale files. `upgrade.sh` correctly uses `pm2 pid` instead.

### M13. Hardcoded port 8650 for profile gateway assignments
**File:** `backend/server.ts:624`  
Starting port for profile gateways is hardcoded. Should be configurable via env.

### M14. Hardcoded `localhost:3003` in terminal-pty.js
**File:** `backend/terminal-pty.js:6`  
Should use configurable env var.

### M15. `tsconfig.json` includes `"DOM"` lib despite no DOM usage
**File:** `backend/tsconfig.json:3`  
Can mask type errors in a server-side codebase.

### M16. Duplicate status-color threshold logic across StatusBar and SystemPanel
**Files:** `frontend/src/components/StatusBar.tsx:20-34`, `frontend/src/components/SystemPanel.tsx:60-77`  
Identical `memIndicator()` and `cpuIndicator()` with the same hardcoded thresholds (85%, 65%, 80%, 50%) duplicated.

### M17. `fetchProjects()` called once on mount, never refreshed
**File:** `frontend/src/App.tsx:143`  
Project list fetched on mount only. External project creation/deletion is never reflected.

### M18. `editor-context` event fires on every effect cycle
**File:** `frontend/src/components/MonacoEditor.tsx:1021-1034`  
`createEffect` POSTs `/api/editor-context` on every tab switch or tab list change – excessive network calls.

---

## LOW FINDINGS

### L1. Commented-out code in MonacoEditor
**File:** `frontend/src/components/MonacoEditor.tsx:200-203`
```typescript
// console.log(`Initializing ${cfg.theme} dashboard...`);
// console.log(`Features: ${cfg.features.join(', ')}`);
```

### L2. Inconsistent keyboard shortcut patterns
**Files:** `frontend/src/App.tsx:203`, `frontend/src/components/MonacoEditor.tsx:854`, `frontend/src/components/GitPanel.tsx:380`  
Mix of `ctrlKey || metaKey`, `monaco.KeyMod.CtrlCmd`, and no modifier handling.

### L3. Inline styles mixed with Tailwind classes
Throughout many components (Sidebar, ProfileManager, ProfileChat) – inconsistent styling approach.

### L4. `formatYaml` error message never auto-clears
**File:** `frontend/src/components/ProfileManager.tsx:202-209`  
Unlike save function (which clears after 2s timeout), format error stays until user dismisses it.

### L5. `as boolean[]` cast unnecessary
**File:** `frontend/src/components/OnboardingModal.tsx:87`  
`Array(TOTAL_STEPS).fill(false)` already returns `boolean[]`.

### L6. Stale docs – PROJECT_MEMORY.md mentions Elysia framework
**File:** `backend/PROJECT_MEMORY.md:11`  
`"Framework": "Elysia"` – but no Elysia dependency exists; server uses raw `Bun.serve()`.

### L7. Stale log files from old port-3000 server
**Files:** `backend/logs/out.log`, `backend/logs/error.log`  
Historical logs from a port-3000 server version with different bugs.

### L8. Empty `items` array renders invisible ContextMenu
**File:** `frontend/src/components/ContextMenu.tsx:71-145`  
No guard against `props.items.length === 0` – invisible but positioned `<div>` rendered.

### L9. `jsonOk` and `jsonErr` have duplicated CORS header logic
**File:** `backend/server.ts:318-331`  
Could be combined into one helper.

### L10. Unused `DIST_PATH` static-file fallback silently 404s
**File:** `backend/server.ts:1442, 1439-1466`  
If frontend dist doesn't exist, requests to `/` return 404 instead of a clear error.

### L11. WebSocket write without readyState check
**File:** `backend/server.ts:216-217`  
Terminal read loop sends to WS without checking `ws.readyState === 1` – throws if socket closed mid-read.

### L12. `handleChatMessage` deeply nested (6+ levels)
**File:** `backend/server.ts:47-206`  
Streaming logic reaches 6+ levels of nesting – difficult to maintain.

### L13. `readdirSync` with `|| true` masks empty-directory detection
**File:** `backend/server.ts:894`  
`const stat = readdirSync(...).length > 0 || true;` – `|| true` makes it always `true`. Effectively always pushes the skill entry.

### L14. Stale `test-profile-routing.ts`, `test-cors.ts` in frontend root
Abandoned one-off test harnesses not referenced by any build/CI pipeline.

### L15. Empty `tests/` directory structure with only stubs
**Files:** `backend/tests/chat.test.ts`, `backend/tests/label-propagation.test.ts`  
Full directory exists for tests but contains no actual tests.

---

## Dependency Graph

```
┌───────────────────────┐
│    frontend/src/       │
│  (SolidJS + Vite)      │
│                        │
│  App.tsx ──┬── ProfileChat.tsx ── lib/api-base.ts
│            ├── MonacoEditor.tsx ── lib/gateway.ts
│            ├── FileTree.tsx      ── lib/chat-persist.ts
│            ├── CronPanel.tsx
│            ├── StatusBar.tsx ───── lib/chat-persist.ts
│            ├── SystemPanel.tsx
│            ├── GitPanel.tsx
│            ├── EditorTerminal.tsx
│            ├── ProfileManager.tsx
│            ├── SessionPanel.tsx
│            ├── WikiPanel.tsx
│            ├── Sidebar.tsx
│            ├── ContextMenu.tsx
│            ├── DiffPreview.tsx
│            ├── OnboardingModal.tsx
│            └── WikiSearch.tsx (DEAD)
└───────────┬───────────┘
            │ HTTP/WS
            ▼
┌───────────────────────┐
│     backend/           │
│  (Bun.serve port 3001) │
│                        │
│  server.ts ─── SQLite (state.db)
│       ├────── execSync(git, hermes CLI)
│       ├────── gateway proxy ──→ Hermes Gateway
│       └────── static files (dist/)
│
│  terminal-pty.js ────── port 3003 (DUPLICATE, no auth)
│  (node-pty + ws)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│      scripts/          │
│                        │
│  setup.mjs ─────────── env generation (dupes server.ts)
│  deploy.sh ─┐
│  upgrade.sh ─┼── 70% duplicated logic
│             │
│  ecosystem.config.js (dev)
│  ecosystem.packaged.config.js (prod)
└───────────────────────┘
```

---

## Summary Counts

| Severity | Frontend | Backend | Scripts | Total |
|----------|----------|---------|---------|-------|
| CRITICAL | 5 (C1-C5) | 4 (C4, C6-C8, C12) | 3 (C9-C11) | 12 |
| HIGH     | 4 (H1-H4) | 7 (H5-H11) | 5 (H11-H15) | 16 |
| MEDIUM   | 9 (M1-M5, M16-M19) | 5 (M6-M9, M13) | 3 (M10-M12) | 18* |
| LOW      | 4 (L1-L4) | 7 (L6-L13) | 2 (L14-L15) | 14* |

*Some findings span both frontend and backend (e.g., H1 hardcoded path appears in both).

**Total unique findings: ~60**

---

## Priority Remediation Recommendations

### Immediate (CRITICAL)
1. **C1** – Fix TOCTOU race in `sendMessage`: use synchronous module-level `let _sending = false` flag
2. **C2** – Implement tab limit enforcement with LRU eviction (user warning first)
3. **C3** – Route cron actions through `cronUrl()` / `cronHeaders()`
4. **C4** – Remove 23 unreachable `return jsonErr(500, ...)` statements in `server.ts`
5. **C5** – Delete `WikiSearch.tsx` (dead component)
6. **C6** – Write real tests or remove stub files
7. **C7/C8** – Add terminal WS authentication; consolidate into one implementation
8. **C9** – Read LAN IP dynamically in deploy/upgrade verification
9. **C10** – Move version bump to after successful build
10. **C11** – Consolidate CORS allow-headers to a single canonical name
11. **C12** – Add database + gateway health checks to `/health`

### Next (HIGH)
1. **H1** – Replace `/home/don/dev` with `os.homedir()` + configurable `PROJECTS_DIR`
2. **H2** – Add WS host override via `VITE_WS_BASE_URL` env var
3. **H4** – Remove duplicate IndexedDB code from ProfileChat, reuse `chat-persist.ts`
4. **H6** – Use metadata endpoint instead of raw config for model detection
5. **H7** – Remove dead functions/constants from `server.ts`
6. **H8** – Implement SQLite connection pooling or reuse single connection
7. **H9** – Shell-escape all user-provided inputs in `execSync`
8. **H10** – Add SIGTERM/SIGINT handlers for graceful shutdown
9. **H11-H12** – Extract shared deployment logic into reusable script; add health-poll loop
10. **H15** – Single-source `.env` template (e.g., a shared JSON/YAML file)
