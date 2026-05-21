# Don's Dashboard — Full Roadmap & Plan

> Don OS 3.0 — Cyberpunk IDE with AI superpowers
> Created: 2026-04-14

---

## Current State (What's Shipped)

- **Chat App** — Hermes Gateway streaming with unified Chat component, session browser
- **Code Editor** — Monaco with context menu, Ask Don, inline completions, file-aware chat, inline edit, diff preview component
- **Resizable Panels** — FileTree|GitPanel, Editor|Terminal+Chat
- **Hermes Admin** — Config editor, API key manager, log viewer, analytics, skills manager, OAuth manager
- **System Panel** — Live CPU/memory stats
- **Cron Panel** — CRUD for scheduled jobs
- **Wiki 3D** — BabylonJS graph visualization
- **Vite 7 + Tailwind v4** — Latest toolchain

---

## Phase 1: Stability & Performance Fixes

### 1.1 Monaco Editor Bundler Compatibility
**Problem:** Monaco's Vite-specific `?worker` imports break in some bundler contexts.
**Fix:**
- Add CDN fallback in `src/vite-workers.d.ts` and `MonacoEditor.tsx`
- Use dynamic import with try/catch: attempt local worker, fall back to `cdn.jsdelivr.net/npm/monaco-editor`
- Test with `bunx vite build` to confirm no broken imports

**Files:** `src/components/MonacoEditor.tsx`, `src/vite-workers.d.ts`, `vite.config.ts`

### 1.2 Terminal node-pty Integration
**Problem:** `EditorTerminal.tsx` resize signals don't propagate correctly without a real PTY.
**Fix:**
- Add `node-pty` to `~/dev/git/don-backend/package.json`
- Replace `child_process.spawn` bash in don-backend WebSocket handler with `pty.spawn`
- Forward resize events via `ptyProcess.resize(cols, rows)`
- Test: open `top` or `vim`, resize panel, verify layout stays correct

**Files:** `~/dev/git/don-backend/server.ts` (WebSocket `/terminal` handler)

### 1.3 Bundle Size — Code Splitting
**Problem:** Single 4.1MB JS chunk (Monaco + Babylon.js).
**Fix:**
- `vite.config.ts` → `build.rollupOptions.output.manualChunks`
  - `monaco-editor` → separate chunk
  - `babylonjs` → separate chunk (only loaded when Wiki3D is active)
  - `vendor` → solid-js, marked, dompurify
- Lazy-load `WikiGraph3D` with `lazy()` + dynamic import
- Target: main chunk < 500KB, lazy chunks load on demand

**Files:** `vite.config.ts`, `src/App.tsx` (lazy imports)

### 1.4 DiffPreview Integration
**Problem:** `DiffPreview.tsx` exists but isn't wired to parse `diff` blocks from AI chat responses.
**Fix:**
- In `Chat/MessageContent.tsx` or `Chat/utils.ts`: detect ` ```diff ` fenced blocks
- Extract original/modified from diff syntax
- Render `DiffPreview` component inline in chat with Accept/Reject buttons
- Accept → `POST /api/files` to write changes, then refresh Monaco tab
- Accept/Reject keyboard shortcuts: Ctrl+Shift+Enter / Escape

**Files:** `src/components/Chat/MessageContent.tsx`, `src/components/Chat/utils.ts`, `src/components/DiffPreview.tsx`

---

## Phase 2: IDE Feature Completion

### 2.1 Code Actions (Lightbulb Menu)
- Register `CodeActionProvider` in Monaco
- Actions: "Don: Explain", "Don: Refactor", "Don: Add Tests", "Don: Find Bugs"
- Triggered by Ctrl+. on selected code or error markers
- Sends to EditorChat with file context

**Files:** `src/components/MonacoEditor.tsx`, `src/components/EditorChat.tsx`

### 2.2 Error Lens + Don Fix
- Show errors/warnings inline (like VS Code Error Lens extension)
- Use Monaco marker API → render severity + message after line
- Click error → "Ask Don to fix" action → auto-suggest fix in EditorChat
- Color: red for errors, yellow for warnings, gray for info

**Files:** `src/components/MonacoEditor.tsx`, `src/index.css`

### 2.3 Git Integration Panel Enhancement
- GitPanel shows commit history (log)
- "Explain this commit" button → sends to Don chat
- "Write commit message" based on staged changes
- Diff viewer for unstaged changes (reuse DiffPreview)
- Branch switcher in header

**Files:** `src/components/GitPanel.tsx`, `~/dev/git/don-backend/server.ts` (new `/api/git/*` endpoints)

### 2.4 Project-Wide Search + Don
- Wire `ProjectSearch.tsx` results to Don chat
- "Ask Don about these matches" button
- Refactor across files with Don
- Use ripgrep backend (`/api/search` endpoint)

**Files:** `src/components/ProjectSearch.tsx`, `src/components/EditorChat.tsx`

### 2.5 Multi-File Context
- "Add to context" button on FileTree items
- Context panel showing which files Don can see
- `/api/files` endpoint returns file contents for context injection
- EditorChat prepends file contexts to system message

**Files:** `src/components/FileTree.tsx`, `src/components/EditorChat.tsx`, `~/dev/git/don-backend/server.ts`

### 2.6 Terminal ↔ Don Integration
- "Run this" button on code blocks in Don's responses
- Terminal output feeds back to Don for debugging
- EditorChat POSTs to terminal WebSocket, captures output

**Files:** `src/components/Chat/MessageContent.tsx`, `src/components/EditorTerminal.tsx`

---

## Phase 3: Profile Manager

### 3.1 Profile Manager — Design

A profile = a named workspace configuration. Switching profiles changes:
- Active project root
- Editor layout (which panels are open, sizes)
- Sidebar app selection
- Chat session (per-profile session ID)
- Editor open tabs
- Theme/skin

**Storage:** `localStorage` with key `don-profiles` and `don-active-profile`.

**Default profiles:**
- `default` — General workspace
- `coding` — Code editor focused (FileTree + Editor + Terminal)
- `chat` — Chat focused (Chat + Sessions side by side)
- `monitoring` — System + Cron + Hermes admin

### 3.2 Profile Manager — Implementation

**New component: `src/components/ProfileManager.tsx`**
- Sidebar icon: 👤 (Ctrl+8)
- Profile list with name, icon, description
- Create / Rename / Delete / Duplicate
- Export/Import profiles as JSON
- "Save current layout as profile" button

**Data model:**
```typescript
interface Profile {
  id: string;
  name: string;
  icon: string;
  projectRoot: string;
  activeApp: AppId;
  editorLayout: {
    leftPanel: 'files' | 'git';
    rightPanel: 'terminal' | 'chat';
    splitRatios: { vertical: number; horizontal: number };
  };
  openTabs: string[];        // file paths
  activeTab?: string;
  theme: string;
  createdAt: number;
  updatedAt: number;
}
```

**Changes to existing components:**
- `App.tsx`: Profile signal, load/save profile state, apply profile on switch
- `Sidebar.tsx`: Add profile icon (Ctrl+8), show active profile name
- `MonacoEditor.tsx`: Save/restore open tabs per profile
- `ResizableSplitter.tsx`: Save/restore split ratios per profile
- `EditorChat.tsx`: Per-profile session key (`don-editor-chat-session:{profileId}`)

**Files:**
- NEW: `src/components/ProfileManager.tsx`
- MODIFY: `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/MonacoEditor.tsx`, `src/components/ResizableSplitter.tsx`, `src/components/EditorChat.tsx`

### 3.3 Profile Manager — Backend (Optional)
- `/api/profiles` — CRUD for profiles stored in don-backend SQLite
- Enables profile sync across browser tabs/devices
- Phase 2 if needed — localStorage is sufficient for v1

---

## Phase 4: Visual Polish & Themes

### 4.1 Custom Themes
- Theme system: `src/lib/themes.ts`
- Built-in: cyberpunk (current), minimal, monokai, nord, dracula
- Monaco editor theme + dashboard UI theme coupled
- Selector in header or Settings panel
- Persist to localStorage

**Files:** NEW `src/lib/themes.ts`, `src/components/MonacoEditor.tsx`, `src/index.css`

### 4.2 Snippet Library
- Save/load code snippets per project
- SQLite-backed on don-backend (`/api/snippets` CRUD)
- Monaco snippet provider integration
- "Save as snippet" in context menu

**Files:** NEW `src/components/SnippetPanel.tsx`, `~/dev/git/don-backend/server.ts`

---

## Phase 5: Smart Rename & Advanced IDE

### 5.1 Smart Rename
- Rename symbol → Don suggests better names based on usage context
- Multi-file rename with preview (diff)
- Uses Monaco's rename provider API + Don intelligence

### 5.2 Error Recovery
- Auto-detect TypeScript errors after save
- Offer "Don: Fix all errors" batch action
- Progress indicator for multi-file fixes

---

## Execution Order

| Priority | Phase | Effort | Blocks |
|----------|-------|--------|--------|
| 🔴 P0 | 1.1 Monaco bundler fix | Small | Nothing builds without it |
| 🔴 P0 | 1.3 Bundle splitting | Medium | User experience |
| 🟡 P1 | 1.2 Terminal node-pty | Medium | Code editor usability |
| 🟡 P1 | 1.4 DiffPreview wiring | Medium | AI code suggestions |
| 🟡 P1 | 3.1-3.2 Profile Manager | Large | Foundation for layouts |
| 🟢 P2 | 2.1 Code Actions | Medium | IDE features |
| 🟢 P2 | 2.2 Error Lens | Small | IDE features |
| 🟢 P2 | 2.3 Git Integration | Large | Daily workflow |
| 🟢 P2 | 2.4 Project Search + Don | Medium | IDE features |
| 🟢 P2 | 2.5 Multi-File Context | Medium | AI context |
| 🟢 P2 | 2.6 Terminal ↔ Don | Small | AI workflow |
| 🔵 P3 | 4.1 Custom Themes | Medium | Polish |
| 🔵 P3 | 4.2 Snippet Library | Medium | Productivity |
| ⚪ P4 | 5.1 Smart Rename | Large | Advanced IDE |
| ⚪ P4 | 5.2 Error Recovery | Medium | Advanced IDE |

---

## Verification Plan

After each phase:
1. `bunx vite build` — no errors, check chunk sizes
2. `pm2 restart don-dashboard-hmr` — dev server starts clean
3. Manual test in browser: each new feature works
4. Check browser console for errors
5. Test resize panels, theme switching, profile switching

---

## Notes

- All coding via OpenCode (per Bakon's preference)
- don-backend is SEPARATE — API changes go in `~/dev/git/don-backend/server.ts`, not dashboard repo
- Server.js in dashboard is STALE (Electrobun remnants removed)
- Keep cyberpunk aesthetic consistent across all new UI
