# Don OS 2.0 — Security & Code Audit

**Date:** 2026-04-11
**Auditor:** Claude (automated)
**Scope:** Full codebase — `server.js`, all `src/` components, config files

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [server.js — Backend](#serverjs)
3. [App.tsx — Root Component](#apptsx)
4. [ChatPanel.tsx](#chatpaneltsx)
5. [EditorChat.tsx](#editorchattsx)
6. [EditorTerminal.tsx](#editorterminaltsx)
7. [FileTree.tsx](#filetreetsx)
8. [GitPanel.tsx](#gitpaneltsx)
9. [MonacoEditor.tsx](#monacoeditertsx)
10. [SessionPanel.tsx](#sessionpaneltsx)
11. [ResizableSplitter.tsx](#resizablesplittertsx)
12. [Sidebar.tsx](#sidebartsx)
13. [StatusBar.tsx](#statusbartsx)
14. [SystemPanel.tsx](#systempaneltsx)
15. [WikiGraph3D.tsx](#wikigraph3dtsx)
16. [graph-layout.ts](#graph-layoutts)
17. [PagePanel.tsx & WikiSearch.tsx](#pagepaneltsx--wikisearchtsx)
18. [holo-dark-2d.ts](#holo-dark-2dts)
19. [TypeScript & Config Issues](#typescript--config-issues)
20. [CSS / Tailwind Issues](#css--tailwind-issues)
21. [Prioritized Fix Plan](#prioritized-fix-plan)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 5     |
| High     | 12    |
| Medium   | 28    |
| Low      | 22    |

**Top risks:**
1. Hardcoded API secret in source code (`server.js:27`)
2. No authentication on file write/delete/terminal endpoints
3. XSS via unsanitized HTML injection in ChatPanel
4. No request body size limits (DoS vector)
5. `ALLOWED_ROOTS` prefix matching can be bypassed with sibling directories

---

## server.js

### CRITICAL-01: Hardcoded API key
- **Line:** 27
- **Code:** `const GATEWAY_AUTH = 'Bearer dev-key-12345';`
- **Risk:** Secret committed to source control. Anyone with repo access gets gateway auth.
- **Fix:** Use `process.env.GATEWAY_AUTH` with `.env` file (gitignored).

### CRITICAL-02: No authentication on destructive endpoints
- **Lines:** 392-445, 571-635
- **Risk:** File write (`POST /api/files`), file delete (`POST /api/files/delete`), directory creation (`POST /api/files/create`), and the terminal WebSocket (`/terminal`) have zero authentication. Any client on the network can write, delete, or execute arbitrary commands.
- **Fix:** Add token-based auth middleware or bind to `127.0.0.1` only.

### CRITICAL-03: No request body size limit
- **Lines:** 498-502
- **Code:** `readBody` accumulates all incoming data without any limit.
- **Risk:** Attacker sends multi-GB POST body → server OOM crash.
- **Fix:** Cap body accumulation (e.g., 10MB) and abort on excess.

### CRITICAL-04: ALLOWED_ROOTS prefix matching bypass
- **Lines:** 353-357
- **Code:** `ALLOWED_ROOTS.some(root => resolved.startsWith(root))`
- **Risk:** A directory like `/home/don/developer/` or `/home/don/dev-secrets/` would pass the `/home/don/dev` prefix check. String `startsWith` is not a proper path containment check.
- **Fix:** Check `resolved === root || resolved.startsWith(root + '/')`.

### CRITICAL-05: SQL via shell execution
- **Lines:** 93-114
- **Code:** `execSync(\`sqlite3 -json ${JSON.stringify(dbPath)} ${JSON.stringify(sql)}\`)`
- **Risk:** While `JSON.stringify` provides some escaping, executing SQL through shell `execSync` is inherently fragile. Shell metacharacter injection is theoretically possible if the DB path were user-controlled. The `sqlEscape` function provides protection for values, but query construction remains string concatenation.
- **Fix:** Use a proper SQLite binding (e.g., `better-sqlite3`) instead of the CLI.

### HIGH-01: `fileCount` computed but never returned
- **Lines:** 291-305
- **Code:** `fileCount` is computed per project but never included in the response object.
- **Fix:** Either add `fileCount` to the project object or remove the dead computation.

### HIGH-02: `rmSync` with recursive + force
- **Line:** 438
- **Code:** `rmSync(safe, { recursive: true, force: true })`
- **Risk:** Can delete entire directory trees within allowed roots with a single API call.
- **Fix:** Add confirmation parameter, limit deletion depth, or require explicit `recursive` flag from client.

### HIGH-03: Session ID not validated on messages endpoint
- **Line:** 203
- **Code:** `/api/sessions/:id/messages` extracts `sessionId` from URL but doesn't validate its format (unlike the single session endpoint at line 218 which checks `/^[a-zA-Z0-9_-]+$/`).
- **Fix:** Add the same regex validation.

### MEDIUM-01: CORS allows any origin
- **Line:** 134
- **Code:** `res.setHeader('Access-Control-Allow-Origin', '*')`
- **Risk:** Fine for local dev, dangerous if server is network-accessible.

### MEDIUM-02: Static file serving path safety
- **Line:** 480
- **Code:** `join(DIST, url.pathname)` — while `new URL()` normalizes `..`, no explicit path traversal guard exists for static files.

### MEDIUM-03: Error messages leak internal paths
- **Line:** 386
- **Code:** `res.end(JSON.stringify({ error: e.message }))` — exception messages can contain full filesystem paths.

### LOW-01: No HTTPS support
### LOW-02: No rate limiting on any endpoint
### LOW-03: Gateway proxy doesn't validate response content-type

---

## App.tsx

### HIGH-04: `setAndSaveProjectRoot` defined but unused
- **Lines:** 130-133 (defined), 70-73 (not used)
- **Code:** `selectProject()` calls `setProjectRoot(project.path)` directly, bypassing `setAndSaveProjectRoot`. Project selection is NOT persisted despite the restore logic at line 99-102.
- **Fix:** Call `setAndSaveProjectRoot(project.path)` in `selectProject`.

### HIGH-05: Clock cleanup pattern incorrect for SolidJS
- **Lines:** 319-323
- **Code:** `onMount(() => { const i = setInterval(...); return () => clearInterval(i); })`
- **Risk:** In SolidJS, `onMount` does NOT use the return value for cleanup (unlike React's `useEffect`). The interval is **never cleared** — memory leak on component unmount.
- **Fix:** Use `onCleanup(() => clearInterval(i))` inside the `onMount` callback.

### MEDIUM-04: No click-outside-to-close on project picker
- **Lines:** 211-243
- **Risk:** Dropdown stays open until user explicitly clicks a project or the toggle button.
- **Fix:** Add a `document.addEventListener('click', ...)` handler to close on outside click.

### MEDIUM-05: `saveProject` defined but never called
- **Lines:** 118-120
- **Code:** Inside `onMount`, a `saveProject` function is defined but never invoked or registered as an effect.

### MEDIUM-06: Header date is static
- **Line:** 169
- **Code:** `new Date().toISOString().split('T')[0]` — evaluated once at render time, never updates after midnight.

### MEDIUM-07: Gateway health check `.json()` call is pointless
- **Lines:** 77-79
- **Code:** `.then(r => { setGatewayOnline(r.ok); return r.json(); })` — the `r.json()` result is discarded and could throw if the response isn't JSON.
- **Fix:** Remove `.json()` call or handle the rejection.

### LOW-04: Stats polling at 2s is excessive
- **Line:** 89 — Consider 5-10s intervals.

---

## ChatPanel.tsx

### CRITICAL — XSS via unsanitized HTML injection
- **Lines:** 33-48
- **Code:** `createThinkingMessage`, `createToolMessage`, and `createHelpHtml` interpolate variables directly into HTML strings without escaping:
  ```js
  function createToolMessage(toolName, preview) {
    return `...<span class="tool-name">${toolName}</span>${preview ? `<span class="tool-preview">${preview}</span>` : ''}...`
  }
  ```
- **Risk:** If the SSE stream returns a malicious tool name like `<img onerror="..." src=x>`, it would execute as HTML.
- **Fix:** HTML-escape all interpolated values, or use DOM APIs to create elements.

### HIGH-06: `remarkable.html: true` enables raw HTML in markdown
- **Line:** 663
- **Code:** `chatRef.remarkable = { html: true, breaks: true, typographer: true }`
- **Risk:** Combined with the XSS above, any HTML in AI responses is rendered directly.
- **Fix:** Set `html: false` unless specifically needed, or sanitize with DOMPurify.

### HIGH-07: `requestBodyLimits.maxMessages` set to 0
- **Line:** 597
- **Code:** `chatRef.requestBodyLimits = { maxMessages: 0 }`
- **Risk:** Sends ALL messages in the conversation history on every request. Long conversations will create very large payloads.
- **Fix:** Set a reasonable limit (e.g., 50-100 messages).

### MEDIUM-08: Shadow DOM manipulation is fragile
- **Lines:** 186-199, 346-358
- **Risk:** Direct manipulation of deep-chat's shadow root (`chatRef.shadowRoot.querySelectorAll(...)`) will break on deep-chat library updates.

### MEDIUM-09: `chatRef` is untyped `any`
- **Line:** 114

### LOW-05: Session groups use timezone math that could be incorrect across DST
### LOW-06: No error UI for failed session loading

---

## EditorChat.tsx

### HIGH-08: Message duplication in API request body
- **Lines:** 128-147
- **Code:**
  ```js
  setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
  // ...
  const body = {
    messages: [...messages(), { role: 'user', content: text }].map(...)
  };
  ```
- **Risk:** After `setMessages`, `messages()` already contains the new user message. Then `[...messages(), { role: 'user', content: text }]` appends it again — the last user message is duplicated in every API request.
- **Fix:** Remove the extra `{ role: 'user', content: text }` from the body, since it's already in `messages()`.

### MEDIUM-10: `formatTime` hardcoded to America/Chicago
- **Line:** 21
- **Fix:** Use the user's local timezone or make it configurable.

### MEDIUM-11: Save effect fires on every message change
- **Lines:** 116-122
- **Risk:** `localStorage.setItem` called on every signal update during streaming. Could be heavy with large conversations.
- **Fix:** Debounce saves or only save on conversation end.

### LOW-07: `scrollToBottom` uses raw `setTimeout` — should use `requestAnimationFrame` or SolidJS scheduling.

---

## EditorTerminal.tsx

### MEDIUM-12: No auto-reconnection logic
- **Risk:** When WebSocket disconnects, the user must manually click "reconnect". No exponential backoff or auto-retry.

### MEDIUM-13: `lastPromptDir` declared but never used
- **Line:** 78
- **Code:** `let lastPromptDir = '';` — dead code.

### MEDIUM-14: `createEffect` for path change fires during initial mount
- **Lines:** 81-89
- **Risk:** Could trigger a reconnect during initialization if `props.projectPath` is set.

### LOW-08: Binary/text frames both converted to utf-8 — could corrupt binary terminal data.

---

## FileTree.tsx

### MEDIUM-15: Mutable `lastRoot` variable for tracking changes
- **Lines:** 145-152
- **Code:** Uses a plain `let lastRoot` to detect prop changes — fragile pattern in SolidJS.
- **Fix:** Use SolidJS `on()` helper in `createEffect` to track previous values:
  ```js
  createEffect(on(() => rootPath(), (current, prev) => { if (current !== prev) loadRoot(); }));
  ```

### MEDIUM-16: Error state is never cleared
- **Risk:** Once `setError(e.message)` is called, the error banner persists forever.
- **Fix:** Clear error on successful fetch or on `loadRoot`.

### LOW-09: Double sorting — entries sorted both client-side (line 84) and server-side (line 370 in server.js). Redundant.
### LOW-10: `e: any` catch blocks throughout — no type narrowing.

---

## GitPanel.tsx

### MEDIUM-17: Polling conditional on fragile path heuristic
- **Lines:** 92-93
- **Code:** `if (repo().includes('/git/') || repo().includes('/dev/git'))` — repos outside these specific paths won't auto-refresh.
- **Fix:** Always poll, or check for `.git` directory existence via API.

### MEDIUM-18: `switchTab` creates unhandled promise rejections
- **Lines:** 74-77
- **Code:** `fetchStatus().then(() => setLoading(false))` — no `.catch()` handler.

### MEDIUM-19: `.map()` for tab rendering instead of `<For>`
- **Line:** 110
- **Risk:** In SolidJS, `.map()` runs eagerly once and doesn't re-render when the array changes (which is fine here since `GitTab[]` is static, but inconsistent with idiomatic SolidJS).

### LOW-11: Status polling only for STATUS tab — LOG and BRANCHES never auto-refresh.

---

## MonacoEditor.tsx

### HIGH-09: Tab name collision for files from different directories
- **Lines:** 393-400
- **Code:** Tab name is `filePath.split('/').pop()` — opening `src/index.ts` and `lib/index.ts` creates two tabs both named `index.ts` with no way to distinguish them visually.
- **Fix:** Include parent directory in tab name when duplicates exist.

### HIGH-10: Monaco model URI clash on remount
- **Lines:** 367-370, 219-226
- **Risk:** On component unmount, all models are disposed. But `createEffect` for `activeFile` calls `monaco.editor.getModel(uri)` which could return a stale model from a previous mount cycle if disposal hasn't completed.
- **Fix:** Use unique URI prefixes or ensure full cleanup before re-initialization.

### MEDIUM-20: `prompt()` used for new file dialog
- **Line:** 241 — Blocking browser dialog, poor UX.

### MEDIUM-21: Save feedback uses raw DOM manipulation
- **Lines:** 327-351
- **Code:** Creates/removes overlay `<div>` elements manually instead of using reactive state.
- **Fix:** Use a SolidJS signal for save status with a timeout.

### MEDIUM-22: Tab rendering uses `.map()` instead of `<For>`
- **Line:** 421 — Tabs are dynamic (can be added/closed), so `.map()` won't update reactively.

### LOW-12: Default starter files always created even when opening a real project file.
### LOW-13: `createNewFile` doesn't check for duplicate tab names.

---

## SessionPanel.tsx

### HIGH-11: Double-fetch on mount
- **Lines:** 65-76
- **Code:** `onMount` calls `fetchSessions()`, and the `createEffect` at lines 71-75 tracking `filter()` and `sourceFilter()` also fires on initial mount because SolidJS effects run immediately. Result: two fetches on startup.
- **Fix:** Skip the `fetchSessions()` in `onMount` (let the effect handle it), or use `on(...)` with `{ defer: true }` to skip the initial run.

### MEDIUM-23: No pagination UI
- **Risk:** Always fetches first 100 sessions. Users with many sessions can't browse further.

### LOW-14: Message content truncated at 500 chars with no expand option.
### LOW-15: `formatTime` expects Unix seconds — no validation for malformed data.

---

## ResizableSplitter.tsx

### MEDIUM-24: No touch/pointer event support
- **Risk:** Splitter is mouse-only. Doesn't work on tablet/touch devices.
- **Fix:** Add `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers, or use pointer events.

### LOW-16: `dragging` is a plain `let` boolean — works but inconsistent with SolidJS patterns.
### LOW-17: 4px drag handle may be too narrow for some users.
### LOW-18: No keyboard accessibility for the splitter handle.

---

## Sidebar.tsx

### LOW-19: Tooltip z-index (z-50) could conflict with project picker dropdown (also z-50).
### LOW-20: No collapsed state — sidebar always occupies 56px.

---

## StatusBar.tsx

### LOW-21: `cpuColor` and `memColor` logic duplicated between StatusBar.tsx and SystemPanel.tsx.

---

## SystemPanel.tsx

### MEDIUM-25: Sparkline component defined inside parent component
- **Lines:** 37-59
- **Risk:** In SolidJS, defining a component inside another component means it's recreated on each render cycle. While SolidJS minimizes re-renders vs React, this is still not idiomatic.
- **Fix:** Extract `Sparkline` to a standalone component.

### MEDIUM-26: History interval mismatched with stats polling
- **Line:** 28 — `setInterval` at 1000ms for history, but stats polled at 2000ms in App.tsx. History captures stale data every other tick.

---

## WikiGraph3D.tsx

### HIGH-12: O(n) node lookups in loops — O(n^2) complexity
- **Lines:** 101-104, 113, 221-224, 241-246
- **Code:** `graphData.nodes.find(n => n.id === ...)` called inside `forEach` loops over links and nodes.
- **Risk:** For a graph with 500 nodes and 1000 links, this is millions of iterations.
- **Fix:** Build a `Map<string, GraphNode>` once and use it for lookups.

### MEDIUM-27: Camera animations array grows without bound
- **Lines:** 192, 209
- **Code:** `camera.animations.push(animation)` — animations are added but never cleared.
- **Fix:** Clear `camera.animations` before adding new ones.

### MEDIUM-28: Unused variable `page` in visibility effect
- **Line:** 223
- **Code:** `const page = props.wikiData?.pages.find(...)` — fetched but never read.

---

## graph-layout.ts

### MEDIUM — O(n^2) force simulation
- **Lines:** 89-104
- **Code:** Nested `nodes.forEach` loop — repulsive force calculation is O(n^2) per iteration, run 200 times.
- **Risk:** For >200 nodes, this will freeze the browser for seconds.
- **Fix:** Use Barnes-Hut approximation, limit iterations, or offload to Web Worker.

---

## PagePanel.tsx & WikiSearch.tsx

### MEDIUM — `page: any` type throughout PagePanel
- **Line:** PagePanel.tsx:3
- **Risk:** No type safety for the page object. All `props.page!` accesses are unchecked.

### LOW-22: `parseTags` assumes specific bracket format (line 29-35 of PagePanel).

---

## holo-dark-2d.ts

### LOW — Fixed 60fps timestep assumption
- **Line:** 309
- **Code:** `const dt = 1 / 60` — should use actual `requestAnimationFrame` delta time.

### LOW — O(n^2) energy line drawing
- **Lines:** 263-291 — ~7000 distance checks per frame for 120 particles. Acceptable at current count but doesn't scale.

---

## TypeScript & Config Issues

### MEDIUM: `strict: false` in tsconfig.json
- **Line:** tsconfig.json:8
- **Risk:** No strict null checks, no implicit any errors, no strict function types. Many potential runtime errors go uncaught.
- **Fix:** Enable `"strict": true` and fix resulting errors.

### MEDIUM: Duplicate type declaration files
- **Files:** `src/deep-chat.d.ts` and `src/types/deep-chat.d.ts`
- **Risk:** Both declare `deep-chat` for JSX intrinsic elements but with conflicting types (`any` vs detailed interface).
- **Fix:** Keep one, delete the other.

### MEDIUM: Pervasive `any` types
- `chatRef: any` (ChatPanel:114)
- `page: any` (PagePanel:3, WikiGraph3D:8)
- `wikiData: any` (WikiGraph3D:8)
- `signals: any` (ChatPanel:214)
- `body: any` (CronPanel:46)
- Multiple `catch (e: any)` blocks

### LOW: `types: []` in tsconfig.json
- **Line:** tsconfig.json:10
- **Risk:** Prevents automatic inclusion of type definitions. Could cause missing types for `node`, `dom`, etc.

---

## CSS / Tailwind Issues

### MEDIUM: `.panel` class has `resize: vertical`
- **Line:** index.css:22
- **Risk:** Browser-native resize handle on panels can break layout, especially with the ResizableSplitter.

### LOW: No responsive breakpoints for mobile
- All panels assume desktop viewport. Sidebar is fixed 56px, splitters don't adapt.

### LOW: Hardcoded colors in inline styles duplicate Tailwind theme
- Throughout all components, colors like `#00f3ff`, `#00ff9f`, `#050507` appear in inline styles. These should reference the Tailwind theme or CSS variables.

---

## Prioritized Fix Plan

### Phase 1 — Critical Security (Do Immediately)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Hardcoded API key | server.js:27 | Move to `process.env.GATEWAY_AUTH` |
| 2 | No auth on endpoints | server.js | Add token auth or bind to 127.0.0.1 |
| 3 | No body size limit | server.js:498 | Cap at 10MB in `readBody` |
| 4 | ALLOWED_ROOTS prefix bypass | server.js:354 | Check `resolved.startsWith(root + '/')` |
| 5 | XSS in ChatPanel | ChatPanel.tsx:33-48 | HTML-escape interpolated values |

### Phase 2 — High Priority Bugs (This Week)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 6 | `setAndSaveProjectRoot` unused | App.tsx:70 | Use it in `selectProject` |
| 7 | Clock interval never cleared | App.tsx:319 | Use `onCleanup` instead of return |
| 8 | Message duplication in API body | EditorChat.tsx:142 | Remove duplicate user message |
| 9 | `remarkable.html: true` | ChatPanel.tsx:663 | Set to `false` or add sanitizer |
| 10 | `maxMessages: 0` sends all | ChatPanel.tsx:597 | Set reasonable limit |
| 11 | SessionPanel double-fetch | SessionPanel.tsx:65-76 | Defer effect or remove onMount fetch |
| 12 | Tab name collision | MonacoEditor.tsx:393 | Include parent dir for duplicates |
| 13 | `fileCount` dead code | server.js:291 | Return it or remove it |
| 14 | Session ID not validated | server.js:203 | Add regex validation |
| 15 | WikiGraph3D O(n^2) lookups | WikiGraph3D.tsx | Use Map for node lookups |
| 16 | `rmSync` recursive force | server.js:438 | Add depth/confirmation guard |
| 17 | Monaco model URI clash | MonacoEditor.tsx | Ensure clean lifecycle |

### Phase 3 — Medium Priority (Next Sprint)

| # | Issue | File |
|---|-------|------|
| 18 | Click-outside-to-close dropdown | App.tsx |
| 19 | No auto-reconnection for terminal | EditorTerminal.tsx |
| 20 | Dead variables (`lastPromptDir`, `saveProject`) | EditorTerminal.tsx, App.tsx |
| 21 | Enable `strict: true` in tsconfig | tsconfig.json |
| 22 | Remove duplicate type decl files | src/deep-chat.d.ts |
| 23 | Fix all `.map()` → `<For>` for dynamic lists | MonacoEditor, GitPanel |
| 24 | Extract Sparkline component | SystemPanel.tsx |
| 25 | Add touch support to ResizableSplitter | ResizableSplitter.tsx |
| 26 | Fix graph-layout O(n^2) for large datasets | graph-layout.ts |
| 27 | Debounce EditorChat session saves | EditorChat.tsx |
| 28 | Fix GitPanel poll heuristic | GitPanel.tsx |
| 29 | Unhandled promise rejections in switchTab | GitPanel.tsx |
| 30 | Camera animation array growth | WikiGraph3D.tsx |
| 31 | `.panel` resize:vertical | index.css |
| 32 | History interval mismatch | SystemPanel.tsx |
| 33 | Gateway health .json() call | App.tsx |
| 34 | FileTree mutable lastRoot tracking | FileTree.tsx |
| 35 | FileTree error never cleared | FileTree.tsx |

### Phase 4 — Low Priority (Backlog)

- Add HTTPS support
- Add rate limiting
- Add pagination to SessionPanel
- Responsive/mobile layout
- Consolidate duplicated color logic
- Add keyboard accessibility to splitter
- Add disk/network stats to SystemPanel
- Replace `prompt()` dialog in MonacoEditor
- Fix timestep assumption in holo-dark-2d
- Expand message content in SessionPanel
