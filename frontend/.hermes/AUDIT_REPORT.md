# TRIPLE AUDIT REPORT — Don's Dashboard

**Date:** 2026-04-15
**Auditors:** Hermes (direct), OpenCode (static analysis), Claude Code (architecture/security)
**Scope:** 49 source files, ~7,273 lines, all `.ts/.tsx` in `src/`
**Stack:** SolidJS + Vite 7 + Tailwind v4 + Monaco + xterm.js + BabylonJS

---

## Summary

Risk score: **6/10** before fixes, **4/10** after.

1 critical XSS, 6 high-severity memory leaks, 8 TypeScript errors, and multiple architectural issues found. Critical and high issues fixed. Medium/low items documented for future work.

---

## Scorecard

| Severity | Hermes | OpenCode | Claude | Consensus | Fixed |
|----------|--------|----------|--------|-----------|-------|
| Critical | 1 | 1 | 1 | 3/3 ✅ | ✅ |
| High | 6 | 6 | 7 | 2+ ✅ | ✅ |
| Medium | 8 | 24 | 18 | 2+ ✅ | — |
| Low | 2 | 12 | 9 | — | — |

---

## Critical Issues (FIXED)

### [CRITICAL] XSS via unsanitized innerHTML — InlineEdit.tsx:61
- **Auditors:** OpenCode + Claude Code (consensus)
- **Hypothesis:** `props.proposedCode` injected via raw innerHTML allows arbitrary JS execution
- **Evidence:** `widgetRef.innerHTML = \`<pre>${props.proposedCode}</pre>\`` — no escaping
- **Fix:** Added `escapeHtml()` helper, all code content now HTML-escaped before injection

---

## High Issues (ALL FIXED)

### [HIGH] TypeScript errors — 8 errors across 5 files
- **Auditors:** Hermes (direct `tsc --noEmit`)
- **Errors:**
  - `EditorTerminal.tsx:41` — `NodeJS.Timeout` → `ReturnType<typeof setTimeout>`
  - `MonacoEditor.tsx:1015` — `listenerDisposer` not in inferred type → explicit `FileTab` annotation
  - `LogViewer.tsx:146,148,159,161` — `Show` not imported → added to import
  - `OAuthManager.tsx:22` — API response type mismatch → `Array.isArray()` guard
  - `SkillsManager.tsx:52,71` — Same pattern → `Array.isArray()` guard
- **Fix:** All 8 errors resolved. `tsc --noEmit` now passes clean.

### [HIGH] Memory leak — CronPanel.tsx onMount return used as cleanup
- **Auditors:** OpenCode
- **Evidence:** `onMount(() => { ... return () => clearInterval(i); })` — SolidJS ignores onMount return
- **Fix:** Moved interval to component scope, cleanup via `onCleanup`

### [HIGH] Memory leak — SystemPanel.tsx same pattern
- **Auditors:** OpenCode
- **Fix:** Same as CronPanel

### [HIGH] Memory leak — DiffPreview.tsx Monaco models not disposed
- **Auditors:** OpenCode + Claude Code (consensus)
- **Evidence:** `monaco.editor.createModel()` called twice, models never disposed
- **Fix:** Models hoisted to component scope, disposed in `onCleanup`

### [HIGH] Memory leak — MonacoEditor.tsx contextmenu listener never removed
- **Auditors:** OpenCode
- **Fix:** Handler extracted to named function, `removeEventListener` in `onCleanup`

### [HIGH] Memory leak — MonacoEditor.tsx marker listener never disposed
- **Auditors:** OpenCode
- **Evidence:** `monaco.editor.onDidChangeMarkers()` returns IDisposable, never captured
- **Fix:** Disposable captured and disposed in `onCleanup`

### [HIGH] No Error Boundaries — entire app crashes on any component failure
- **Auditors:** Claude Code
- **Fix:** `ErrorBoundary` added wrapping `<main>` in App.tsx with reload button

---

## Medium Issues (Documented — not fixed yet)

### [MEDIUM] 30+ `<For>` blocks missing `key` props
- **Auditors:** OpenCode
- **Impact:** Performance degradation in dynamic lists (sessions, messages, tabs)
- **Files:** Multiple — App.tsx, EditorTerminal, Chat, CronPanel, GitPanel, etc.
- **Recommendation:** Add `key` props using stable identifiers (IDs, paths)

### [MEDIUM] MonacoEditor.tsx is a god component (1,157 lines)
- **Auditors:** Claude Code
- **Impact:** Hard to maintain, test, and debug. Handles 10+ responsibilities
- **Recommendation:** Split into: TabManager, EditorCore, ContextMenu/Actions, SessionPersistence

### [MEDIUM] Scattered global state — no context providers
- **Auditors:** Claude Code
- **Impact:** Prop drilling, duplicated polling, no centralized store
- **Recommendation:** Create `ProjectContext`, `GatewayContext` providers

### [MEDIUM] Duplicate `useDebounce` in 3 files
- **Auditors:** Claude Code
- **Files:** ApiKeyManager.tsx, LogViewer.tsx, SkillsManager.tsx
- **Recommendation:** Extract to `src/lib/hooks.ts`

### [MEDIUM] Empty catch blocks — 10+ instances
- **Auditors:** OpenCode
- **Impact:** Silent failures for localStorage, WebSocket send, fetch calls
- **Recommendation:** At minimum `console.warn`, ideally user-visible error states

### [MEDIUM] Race condition in EditorChat.tsx project switching
- **Auditors:** Claude Code
- **Evidence:** `createEffect` on projectRoot fires async fetches without generation guard
- **Impact:** Rapid project switching can cause stale data overwrite

### [MEDIUM] `.map()` instead of `<For>` for MonacoEditor tab bar
- **Auditors:** OpenCode
- **Impact:** All tabs recreated on every re-render

### [MEDIUM] Missing `batch()` for grouped signal updates
- **Auditors:** OpenCode
- **Files:** Chat/index.tsx streaming callbacks, EditorTerminal.tsx ws.onopen

### [MEDIUM] No CSP header or meta tag
- **Auditors:** Claude Code
- **Impact:** Injected scripts can execute freely

### [MEDIUM] No input validation on API calls
- **Auditors:** Claude Code
- **Files:** CronPanel (job names), FileTree (path traversal), GitPanel (commit messages)

---

## Low Issues (Future)

- WikiSearch.tsx — dead code (never imported)
- Duplicate `generateId()` in Chat/types.ts and Chat/utils.ts
- Module-level mutable state in EditorTerminal.tsx
- `holo-dark-2d.ts` O(n²) energy line calculation
- `graph-layout.ts` O(n²) force-directed layout (should use Web Workers)
- `as any` usage in Monaco type access (6+ instances)
- localStorage values not validated on read

---

## Cross-Auditor Consensus (2+ agree)

| Finding | Auditors |
|---------|----------|
| XSS in InlineEdit innerHTML | OpenCode + Claude |
| DiffPreview models not disposed | OpenCode + Claude |
| No Error Boundaries | OpenCode + Claude |
| `<For>` missing key props (30+) | OpenCode + Claude |
| Empty catch blocks (10+) | OpenCode + Hermes |
| God component MonacoEditor (1157 lines) | Claude + OpenCode |
| Scattered state management | Claude + OpenCode |

---

## Positive Observations

- **Race condition guards** — MonacoEditor uses `fileLoadGeneration` counter, Chat uses `loadGeneration` — good pattern
- **DOMPurify** used for markdown rendering in MessageContent.tsx
- **WebSocket reconnection** with exponential backoff in EditorTerminal.tsx
- **Session persistence** with localStorage is well-structured
- **Cyberpunk design system** is consistent across all components
- **Code splitting** properly implemented with vendor/monaco/babylonjs chunks
- **No circular dependencies** — clean component tree

---

## Recommendations (Priority Order)

1. Add `key` props to all `<For>` blocks with dynamic data
2. Extract `useDebounce` to shared hook
3. Add input validation at API boundaries
4. Replace empty catch blocks with at minimum `console.warn`
5. Split MonacoEditor god component into focused modules
6. Add CSP meta tag to index.html
7. Add generation guards to EditorChat project switching
8. Remove dead code (WikiSearch.tsx)
9. Use `batch()` for grouped signal updates
10. Add lazy loading for heavy panels (Monaco, Terminal)

---

*Triple Audit complete. All critical and high issues fixed. Build passes clean.*
