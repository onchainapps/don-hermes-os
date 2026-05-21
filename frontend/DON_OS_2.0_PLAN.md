# Don OS 2.0 — Dashboard Overhaul Plan

## Problem Statement
1. Tab switching (F1-F5) destroys component state — SSH terminals die, chat sessions reset
2. Dashboard doesn't leverage the full gateway API (sessions, runs, cron jobs, responses)
3. Layout is basic tab switching — not "Don OS" caliber

## Theme Preservation
Keep existing cyberpunk/Hermes theme colors exactly:
- Background: `#050507`
- Panel: `#111113` with `rgba(0, 243, 255, 0.3)` border glow
- Cyan: `#00f3ff` (primary accent)
- Green: `#00ff9f` (success/status)
- Magenta: `#ff006e` (errors/alerts)
- Text: `#e0ffe8`, Dim: `#aaffcc`
- Font: JetBrains Mono + Fira Code

## Architecture: Don OS Shell

### Layout (Sidebar + Main + StatusBar)
```
┌──┬──────────────────────────────────────────────┐
│  │  HEADER: Don OS 2.0 + gateway status + time  │
│  ├──────────────────────────────────────────────┤
│  │                                              │
│S │  MAIN CONTENT AREA                           │
│I │  (apps render here, never unmounted)         │
│D │                                              │
│E │                                              │
│B │                                              │
│A │                                              │
│R │                                              │
│  ├──────────────────────────────────────────────┤
│  │  STATUS BAR: CPU | MEM | UPTIME | GATEWAY    │
└──┴──────────────────────────────────────────────┘
```

### Sidebar Apps (icon-based, not tabs)
1. **CHAT** — Hermes chat with session browser (the star)
2. **TERMINAL** — SSH sessions (persistent, multi-tab)
3. **CODE** — Monaco editor + file tree + git
4. **SYSTEM** — CPU/MEM/DISK metrics + running processes
5. **CRON** — Job scheduler (full CRUD via gateway)
6. **SESSIONS** — All Hermes sessions (from state.db)

### State Persistence Solution
**Core fix**: Apps render behind `display: none` instead of being conditionally rendered.
- `activeTab() === 'X' && <ComponentX/>` → destroys component
- New: All apps mount once, CSS toggles visibility
- React/SolidJS components keep their internal state alive

### Gateway API Integration
Backend server.js gets new proxy routes:

| Frontend Route | Backend Proxy | Gateway Endpoint |
|---|---|---|
| Chat (existing) | `/api/chat` | `POST /v1/chat/completions` (already done) |
| Sessions list | `GET /api/sessions` | Read `state.db` directly |
| Session messages | `GET /api/sessions/:id/messages` | Read `state.db` messages table |
| Cron jobs | `/api/jobs/*` | Proxy to `GET/POST/PATCH/DELETE /api/jobs/*` |
| Runs | `/api/runs` | `POST /v1/runs` + `GET /v1/runs/:id/events` |
| Health | `/api/gateway/health` | `GET /health` |

### Chat Panel Enhancement
- **Session sidebar**: List all sessions from state.db, click to load
- **Multiple concurrent chats**: Each session is a separate message list
- **Session metadata**: Show model, message count, tokens, last active time
- **Streaming indicator**: Tool call progress from SSE
- **New session button**: Creates fresh conversation
- **Session search**: Filter by title/content

## Implementation Steps

### Phase 1: Backend — Gateway Proxy + Session API
- [x] Audit current server.js
- [ ] Add session DB query endpoints (`/api/sessions`, `/api/sessions/:id/messages`)
- [ ] Add gateway proxy routes for jobs, runs, health
- [ ] Test all endpoints

### Phase 2: Don OS Shell — Sidebar + Persistent Mounting
- [ ] Create `Sidebar.tsx` — icon-based app launcher
- [ ] Create `StatusBar.tsx` — system stats footer
- [ ] Refactor `App.tsx` — replace F1-F5 tabs with sidebar + visibility toggle
- [ ] Ensure all existing components mount once and toggle via CSS

### Phase 3: Chat Overhaul — Session Browser + Multi-Session
- [ ] Create `SessionBrowser.tsx` — list/search/select sessions
- [ ] Refactor `ChatPanel.tsx` — add session sidebar, multi-session support
- [ ] Add session creation, loading, and metadata display
- [ ] Wire up to new backend session endpoints

### Phase 4: Cron Manager — Full Gateway CRUD
- [ ] Create `CronPanel.tsx` — list/create/edit/pause/resume/delete jobs
- [ ] Wire up to gateway `/api/jobs` endpoints

### Phase 5: System Monitor — Enhanced Metrics
- [ ] Refactor metrics into `SystemPanel.tsx` with real-time graphs
- [ ] Add gateway health status indicator
- [ ] Process list from `/api/stats`

### Phase 6: Polish
- [ ] Keyboard shortcuts (Cmd/Ctrl+1-6 to switch apps)
- [ ] Smooth transitions between apps
- [ ] Mobile-friendly sidebar collapse

## Files to Modify/Create
- `server.js` — new proxy routes + session DB queries
- `src/App.tsx` — complete rewrite (sidebar shell)
- `src/components/ChatPanel.tsx` — session browser + multi-session
- `src/components/Sidebar.tsx` — NEW (app launcher)
- `src/components/StatusBar.tsx` — NEW (system stats bar)
- `src/components/SessionBrowser.tsx` — NEW (session list)
- `src/components/CronPanel.tsx` — NEW (job manager)
- `src/components/SystemPanel.tsx` — NEW (metrics dashboard)
- `src/index.css` — sidebar + status bar styles
- `tailwind.config.js` — sidebar colors if needed

## OpenCode for Implementation
Per developer skill: ALL coding goes through OpenCode.
Plan first → get confirmation → code via OpenCode.
