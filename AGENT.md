# AGENT.md — Don Hermes OS

> **What this file is:** A self-contained instruction set for a Hermes Agent (or any LLM-based coding agent) dropped into this repo. Read top to bottom before touching any code.
> **GitHub:** `https://github.com/onchainapps/don-hermes-os`
> **Branch:** `master` only — no branches.

---

## 1 · What This Project Is

Don Hermes OS is a **self-contained local AI agent workspace** for a single host. It has three layers:

```
┌──────────────────────────────────────────────────────┐
│  Hermes Agent profiles (~/.hermes/profiles/*)         │
│  Each profile = one independent AI agent instance      │
└───────────────┬──────────────────────────────────────┘
                │ gateway (ws://127.0.0.1:8642)
┌───────────────▼──────────────────────────────────────┐
│  Backend API (don-os-backend) — Bun server, port 3001 │
│  · /v1/runs + streaming SSE → Hermes Gateway proxy    │
│  · /api/gateway/*  → webhook → gateway               │
│  · /v1/rpc        → gateway RPC proxy                │
│  · /api/stats, /api/projects, /api/gateway/health     │
└───────────────┬──────────────────────────────────────┘
                │ HTTP (proxy or direct)
┌───────────────▼──────────────────────────────────────┐
│  Frontend Dashboard (don-os-frontend) — SolidJS/Vite   │
│  Dev :5173 ·  Packaged: 3101                          │
│  · System, SESSIONS, WIKI, PROFILES panels            │
│  · Floating ModalChat — canonical chat component       │
│  · Per-profile ProfileChat — routed through /gp proxy │
└──────────────────────────────────────────────────────┘
```

**Why it exists:** Bakon's agent infrastructure needs to be fully portable — clone the repo, run setup, start PM2, done. No manual config.

---

## 2 · Prerequisites (read before doing anything)

| Tool | Required? | Notes |
|------|-----------|-------|
| `bun` ≥ 1.3.12 | ✅ | Primary runtime. Install: `curl -fsSL https://bun.sh/install \| bash` |
| `node` | ✅ | Needed for `scripts/setup.mjs` (setup script) |
| `pm2` | ✅ | Process manager for both dev and prod. `npm i -g pm2` |
| `hermes` CLI | ✅ | Used by backend to create profiles. `hermes --version` must work |
| `openssl` | ✅ | Generates API keys in setup. `openssl version` must work |
| `nginx` | optional | Production reverse proxy |
| `docker` | optional | Not used in current workflow |

If bun or node are missing, install them first. The setup script (`scripts/setup.mjs`) **detects** all of these and skips gracefully when absent, but the agent cannot function without `bun` + `hermes` + `pm2`.

---

## 3 · One-Command Setup (preferred)

This is the path an agent should always start with:

```bash
# 1. Clone
git clone https://github.com/onchainapps/don-hermes-os.git
cd don-hermes-os

# 2. Install dependencies (root has no deps, but backend + frontend do)
cd backend && bun install && cd ..
cd frontend && npm install && cd ..

# 3. Bootstrap environment — creates Hermes profiles, writes .env, detects IP
npm run setup

# Interactive mode: will ask "Create a default profile? (Y/n)"
# CI / non-interactive mode:
npm run setup:ci
```

**`npm run setup` does:**
1. Detects local IP via `hostname -I`
2. Audits all required tools
3. Scans `~/.hermes/profiles/` for existing profiles
4. Creates a `default` profile at `~/.hermes/profiles/default/.env` with:
   - `API_SERVER_PORT=8650` (unique per profile, auto-incremented)
   - `API_SERVER_KEY` (64-char hex from `openssl rand -hex 32`)
   - `API_SERVER_CORS_ORIGINS` — 6 entries: detected IP + localhost × {5173, 3101}
   - All other Hermes .env sections stubbed
5. Copies `SOUL.md` from repo root into the new profile
6. Prints next-steps

**`npm run setup:ci`** does the same but: auto-creates profile, auto-accepts detected IP, no prompts. Use this for automation.

---

## 4 · Starting the Services

### 4a. Development — from source

```bash
pm2 start ecosystem.config.js
pm2 save
```

`ecosystem.config.js` uses `bun run server.ts` (hot-reload) and `bun run dev` (Vite HMR):

| Process | Port | Command |
|---------|------|---------|
| `don-os-backend` | 3001 | `bun run server.ts` (watch mode) |
| `don-os-dashboard` | 5173 | `bun run dev` (Vite HMR) |

Both logs go to `/home/don/logs/` (create that dir if absent: `mkdir -p ~/logs`).

### 4b. Production — from installed packages

```bash
# Build
cd backend && bun build src/server.ts --outdir=dist --target=bun
cd frontend && npm run build

# Package (optional — creates .tgz)
npm run package:backend   # → backend/*.tgz
npm run package:frontend  # → frontend/*.tgz

# Install as binary
# Option A: npm pack + tar
tar -xzf don-os-backend-*.tgz -C ~/.bun/packages/
tar -xzf don-os-frontend-*.tgz -C ~/.bun/packages/

# Option B: npm link (from each package dir)
cd backend && npm link
cd frontend && npm link

# Start with PM2
pm2 start ecosystem.packaged.config.js
pm2 save
```

`ecosystem.packaged.config.js` runs installed binaries from `~/.bun/packages/`:

| Process | Port | Runs |
|---------|------|------|
| `don-os-backend` | 3001 | `bun dist/server.js` |
| `don-os-dashboard` | 3101 | `node scripts/run.mjs` (→ vite preview) |

---

## 5 · Repo Layout

```
don-hermes-os/
├── AGENT.md                        # ← you are here
├── SOUL.md                         # Don Mirror identity — copy into new profiles
├── CHANGELOG.md                    # Every change to this repo
├── package.json                    # Root scripts: setup, build, package:* 
├── ecosystem.config.js             # Dev PM2 config (source-based, hot-reload)
├── ecosystem.packaged.config.js    # Prod PM2 config (installed binaries)
├── scripts/
│   └── setup.mjs                   # Environment bootstrap — run this first
├── docs/
│   ├── packaging.md                # npm packaging architecture and procedures
│   └── architecture/               # Architecture docs
├── backend/
│   ├── package.json                # don-os-backend package + bin entry
│   ├── .env.example                # Reference profile .env template
│   ├── scripts/
│   │   └── run.mjs                 # don-os-backend bin shim → bun dist/server.js
│   └── server.ts                   # Full Bun API server (1,510 lines)
│       ├── POST /profiles/create   →  creates Hermes profile, writes .env
│       ├── GET  /profiles           →  lists profiles
│       ├── GET  /api/stats          →  system stats (CPU, RAM, uptime)
│       ├── GET  /api/projects       →  git project scan
│       ├── GET  /api/gateway/health →  probes ws://127.0.0.1:8642
│       ├── POST /api/gateway/rpc    →  RPC proxy to Hermes Gateway
│       ├── POST /api/editor-context →  receives file/project context from editor
│       └── /v1/runs  /v1/rpc       →  Hermes Gateway proxy endpoints
└── frontend/
    ├── package.json                # don-os-frontend package + bin entry
    ├── scripts/
    │   └── run.mjs                 # don-os-frontend bin shim → vite preview
    ├── src/
    │   ├── App.tsx                 # Root layout — mounts all panels
    │   ├── main.tsx                # Entry point
    │   ├── lib/
    │   │   ├── api-base.ts         # apiUrl() helper — '' prefix (works behind proxy)
    │   │   ├── gateway.ts          # Gateway URL + headers builder
    │   │   ├── gatewayClient.ts    # Legacy WebSocket stub (kept for compat)
    │   │   ├── chat-ui/            # New solid-js-chat-core (per-profile hub)
    │   │   └── slashRpc.ts         # /api/gateway/v1/rpc wrapper for slash cmds
    │   └── components/
    │       ├── ModalChat.tsx       # ⭐ CANONICAL — floating chat, uses /gateway proxy
    │       ├── ProfileChat.tsx     # Per-profile chat, uses /gp proxy
    │       ├── ProfileManager.tsx  # Hermes profile CRUD
    │       ├── Sidebar.tsx         # App navigation (ctrl+1-5 shortcuts)
    │       ├── SystemPanel.tsx     // GPU, CPU, memory, gateway health
    │       ├── SessionPanel.tsx    // Hermes session browser
    │       ├── WikiPanel.tsx       // lazy-loaded wiki
    │       ├── CronPanel.tsx       // Per-profile cron job management
    │       ├── StatusBar.tsx       // Bottom bar: stats + clock
    │       ├── MonacoEditor.tsx    // Code editor panel
    │       ├── FileTree.tsx        // Project file explorer
    │       ├── GitPanel.tsx        // Git status + commit UI
    │       └── EditorTerminal.tsx  // Project-scoped terminal
    └── index.html
```

---

## 6 · ModalChat.tsx — The Canonical Chat Pattern

`frontend/src/components/ModalChat.tsx` (563 lines) is the **reference implementation** for all new chat components in this codebase.

### Why it's canonical

- Uses the **pure HTTP Runs API** — no WebSocket dependency (`gatewayClient.ts` is explicitly legacy, see its header comment)
- **Streaming via `/gateway/v1/runs/{id}/events`** SSE endpoint
- **IndexedDB persistence** — position, size, messages, sessionId survive page refresh
- **Rotating thinking animation** — TUI-style rotating phrases during streaming
- **Complete chat feature set** — voice input, file attachment, slash commands, Markdown rendering, token usage display

### Key patterns to copy

#### 6a. API path
```ts
// ModalChat uses the backend's gateway proxy:
const API_BASE = '/gateway';          // backend proxies → ws://127.0.0.1:8642
const API_KEY = import.meta.env.VITE_GATEWAY_AUTH || '';

// Create run:
const res = await fetch(`${API_BASE}/v1/runs`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,  // if key present
  },
  body: JSON.stringify({
    input: prompt,
    stream: true,
    conversation_history: [...],
  }),
});
const { run_id } = await res.json();

// Stream events:
const streamRes = await fetch(`${API_BASE}/v1/runs/${run_id}/events`, {
  headers: { 'Accept': 'text/event-stream', 'Authorization': `Bearer ${API_KEY}` },
});
const reader = streamRes.body!.getReader();
// …read loop, look for event.event === "message.delta"
```

#### 6b. SSE parsing (exact pattern)
```ts
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      const event = JSON.parse(data);
      if (event.event === "message.delta" && event.delta) {
        // Append delta to current assistant message
      }
      if (event.event === "run.completed" && event.usage) {
        // Save token usage: event.usage.input_tokens / output_tokens / total_tokens
      }
    }
  }
}
```

#### 6c. IndexedDB persistence pattern
```ts
const DB_NAME = 'don-chat-db';        // unique DB per app
const STORE_NAME = 'chat-state';
const STATE_KEY = 'modal-chat-v1';     // unique key per component

// saveState / loadState — debounced with 400ms timeout
// Persist: position, size, messages[], sessionId
```

#### 6d. Floating/draggable/resizable container
```tsx
<Portal>
  <div class="fixed z-[999999]"
    style={{
      position: 'fixed',
      left: `${position().x}px`,
      top: `${position().y}px`,
      width: `${size().width}px`,
      height: isMinimized() ? 'auto' : `${size().height}px`,
    }}
  >
    {/* header: drag handle + minimize + close */}
    <div class="cursor-move select-none" onMouseDown={startDrag}>…</div>
    {/* messages area */}
    <div class="flex-1 overflow-y-auto">…</div>
    {/* input area: file attachment, voice (Ctrl/Cmd+B), slash commands */}
    <div class="border-t">…</div>
    {/* SE resize handle — bottom-right, stays INSIDE container */}
    <div class="absolute bottom-1 right-1 cursor-se-resize z-[1000000]" onMouseDown={startResize}>⤡</div>
  </div>
</Portal>
```

#### 6e. Slash commands
```ts
const SLASH_COMMANDS = [
  { cmd: '/help',  desc: 'Show available commands' },
  { cmd: '/new',   desc: 'Start a new conversation' },
  { cmd: '/clear', desc: 'Clear chat history' },
  { cmd: '/stop',  desc: 'Stop streaming response' },
  { cmd: '/retry', desc: 'Retry last user message' },
  { cmd: '/status', desc: 'Show gateway status' },
  { cmd: '/model <name>', desc: 'Change model' },
  { cmd: '/steer <mode>', desc: 'Busy mode (queue|steer|interrupt|status)' },
  { cmd: '/bg <prompt>',  desc: 'Run prompt in background' },
  { cmd: '/compact',      desc: 'Compress current session' },
  { cmd: '/session list', desc: 'List session clusters' },
  { cmd: '/profile [name]', desc: 'Switch or show profile' },
];

// Autocomplete: watch input, show dropdown when it starts with '/'
onInput: (e) => {
  if (val.startsWith('/')) setShowSlash(true);
  setSlashFilter(val.slice(1));
}
```

#### 6f. Thinking animation (TUI-style)
```ts
const THINKING_PHRASES = ["Thinking...", "Working on it...", "Analyzing...", "One moment...", ...];
let thinkingInterval: number | null = null;

function startThinkingAnimation() {
  let index = 0;
  setThinkingText(THINKING_PHRASES[index]);
  thinkingInterval = setInterval(() => {
    index = (index + 1) % THINKING_PHRASES.length;
    setThinkingText(THINKING_PHRASES[index]);
  }, 1800);  // 1.8s per phrase
}
function stopThinkingAnimation() {
  if (thinkingInterval) clearInterval(thinkingInterval);
  thinkingInterval = null;
}

// Show during streaming:
<Show when={isStreaming()}>
  <div class="text-xs flex items-center gap-2">
    <div class="flex gap-1">
      <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
      <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
      <div class="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
    </div>
    <span>{thinkingText()}</span>
  </div>
</Show>
```

#### 6g. Voice input
```ts
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognition = new SpeechRecognitionAPI();
recognition.continuous = false;
recognition.interimResults = false;
recognition.lang = 'en-US';
recognition.onresult = (event) => {
  setInput(event.results[0][0].transcript);
  setTimeout(() => sendMessage(), 50);
};
// Trigger: Ctrl/Cmd+B
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') startVoiceInput();
});
```

#### 6h. Model info fetch
```ts
async function fetchModelInfo() {
  const res = await fetch(`${API_BASE}/v1/models`, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
  if (res.ok) {
    const { data } = await res.json();
    const model = data[0];
    setModelInfo({ name: model.id, context: model.context_length });
  }
}
```

---

## 7 · Adding a New Chat Component (step-by-step)

When building a new chat UI (e.g., EditorChat, WikiChat, CronAssistant), follow this checklist:

- [ ] Import `createSignal, onMount, onCleanup, For, Show, Index, Portal` from `solid-js`
- [ ] Use `/gateway` as the API base (ModalChat pattern) for remote access
  - **OR** use `/api/gateway` if the component is inside the main dashboard and routes through the Vite→backend proxy
  - The difference: `/gateway` → backend directly (used within the dashboard SPA); `/api/gateway` → Vite proxy then backend (used OR for external browser access)
- [ ] Call `POST /v1/runs` with `{ input, stream: true, conversation_history }`
- [ ] Stream via `GET /v1/runs/{run_id}/events`, parse SSE lines
- [ ] Show rotating thinking animation while `isStreaming` is true
- [ ] Persist state to IndexedDB with a unique DB name + key combination
- [ ] Add slash commands + autocomplete dropdown
- [ ] Add Ctrl/Cmd+B voice input shortcut
- [ ] Handle `AbortController` for streaming cancellation on component unmount
- [ ] Style list (`.max-w-[80%] user=right/assistant=left`) and token usage footer
- [ ] Add resize handle (`⤡`, bottom-right, `cursor-se-resize`)

---

## 8 · Vite Dev Proxy

The Vite dev server (port 5173) proxies `/api/*` to the backend (port 3001). This is configured in `frontend/vite.config.ts`. In production (vite preview on port 3101, or nginx), the relative path `/api/gateway/*` hits the backend directly.

**`api-base.ts`:**
```ts
export function apiBase(): string { return ''; } // Relative — works everywhere
export function apiUrl(path: string): string { return `${apiBase()}${path}`; }
```

---

## 9 · Backend Routing Patterns

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/runs` | POST | Create a new Hermes run (input + history) |
| `/v1/runs/:id/events` | GET | SSE stream for a running run |
| `/v1/rpc` | POST | RPC proxy — forwards to Hermes Gateway |
| `/profiles/create` | POST | Create Hermes profile (with auto .env generation) |
| `/profiles` | GET | List all Hermes profiles |
| `/api/stats` | GET | System CPU/RAM/uptime |
| `/api/projects` | GET | Scan for git projects |
| `/api/project-root` | GET | Resolve project root from file path |
| `/api/gateway/health` | GET | Probe Hermes Gateway (returns 200/503) |
| `/api/gateway/rpc` | POST | Gateway RPC from frontend panels |
| `/api/editor-context` | POST | Receive editor tab context |

---

## 10 · The Gateway Proxy Pattern

The backend talks to the Hermes Gateway (`ws://127.0.0.1:8642`) on behalf of the frontend, so the browser never needs to reach the gateway directly.

| Gateway Port | Frontend Route | Auth |
|--------------|---------------|------|
| 8642 (per profile) | `/gateway/*` | `VITE_GATEWAY_AUTH` from profile `.env` |
| 8642 (default) | `/api/gateway/*` | Not required (same host) |
| Per-profile | `/gp/*` | `X-Hermes-Profile` header → backend resolves profile's port + key |

**`/gp` proxy** (the per-profile route):  
The backend reads `X-Hermes-Profile` from the request header, looks up that profile's `.env` for `GATEWAY_PORT` + `VITE_GATEWAY_AUTH`, and proxies the WebSocket to that specific profile's gateway. Each profile gets its own Hermes Gateway port (8650, 8651, …).

**Profile `.env` (auto-generated):**
```
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8650          ← unique per profile
API_SERVER_KEY=<64-char hex>   ← per profile
API_SERVER_CORS_ORIGINS=<6 IPs>
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=8642
GATEWAY_AUTH=<profile key>
```

---

## 11 · PM2 Reference

```bash
# Dev — hot reload
pm2 start ecosystem.config.js

# Prod — packaged
pm2 start ecosystem.packaged.config.js

# Check status
pm2 jlist
pm2 logs don-os-backend
pm2 logs don-os-dashboard

# Restart
pm2 restart don-os-backend don-os-dashboard

# Save / restore on reboot
pm2 save
pm2 resurrect

# Kill all
pm2 delete all
```

**Logs:**
`~/logs/don-os-backend-{dev-out,dev-error,out,err}.log`

---

## 12 · Backend Profile Creation (internal)

When the frontend calls `POST /profiles/create`, `server.ts` lines 545–709 do the following:

1. **Validate** name (alphanumeric + `_-` only)
2. **Clone or create** via `hermes profile create` — if `body.template` is a named existing profile, clone with `--clone-from`; else fresh `--no-alias`
3. **Write SOUL.md** if `body.soul` body field is present
4. **Generate unique port** — starts at 8650, increments if taken
5. **Generate API key** — `randomBytes(32).toString('hex')`
6. **Regenerate CORS_ORIGINS** with `hostname -I` detected IP × {5173, 3101}
7. **Write `.env`** at `~/.hermes/profiles/<name>/.env`
8. **Write `config.yaml`** description if `body.description` provided

---

## 13 · Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `pm2 jlist` returns `[]` | PM2 not loaded or daemon restarted | `pm2 resurrect` |
| Backend HTTP 404 on `/` | No root route defined (expected) | Use `/api/...` endpoints |
| `Invalid API key` from Hermes | Profile key mismatch between `.env` and gateway | Re-run profile create or check `VITE_GATEWAY_AUTH` |
| CORS error from browser | `API_SERVER_CORS_ORIGINS` missing current IP | Re-run `npm run setup` or manually update `.env` |
| Port 3001 already taken | Stale process or other app | `lsof -ti:3001 \| xargs kill -9` then `pm2 restart` |
| ModalChat has no connection | Backend not running or `/gateway` returns 401 | Check `pm2 logs don-os-backend`, confirm `API_SERVER_KEY` |
| `hermes` CLI not found | Not in PATH or not installed | `which hermes`; install via `npm i -g hermes` |
| Frontend shows "OFFLINE" for gateway | `/api/gateway/health` returns non-200 | Check gateway is running: `hermes gateway start` |

---

## 17 · Optional — Wiki Knowledge Base

The **WikiPanel** (fourth sidebar tab) is a static knowledge-graph viewer that renders from `wiki-data.json`:

- Fetches `GET /wiki-data.json` (a static file Vite auto-copies from `public/`)
- Shows category-filtered nodes, a 3D force graph (WikiGraph3D), and a detail drawer with inbound/outbound wikilinks
- The JSON is *generated* by the wiki-autopilot pipeline — it is not part of this repo

### Wiki Pipeline (separate from this repo)

Not everyone needs this. It's an optional **agent knowledge-base layer** on top of Don Hermes OS.

| Script | Skill | What it does |
|--------|-------|-------------|
| `export-transcripts.py` | wiki-transcript-ingest | Dumps Hermes `state.db` sessions → `~/wiki/raw/transcripts/` |
| `find-processable.py` | wiki-autopilot | Scores transcripts by knowledge density |
| Agent-powered extract | wiki-autopilot | Reads high-value transcripts, extracts decisions/corrections/solutions |
| Agent files pages | wiki-autopilot | Creates `~/wiki/{entities,concepts,decisions,lessons}/` pages with `[[wikilinks]]` |
| `generate-wiki-data.py` | wiki-autopilot | Regenerates `wiki-data.json` for the dashboard |

Both `wiki-autopilot` and `wiki-transcript-ingest` are **Hermes skills** (`skill_view(name='wiki-autopilot')`) — they live in `~/.hermes/skills/`, not in this repo.

### Setting up the wiki pipeline

```bash
# 1. Install the skills (run these as a Hermes command)
skill_view(name='wiki-autopilot')       # reads full SKILL.md
skill_view(name='wiki-transcript-ingest') # reads full SKILL.md

# 2. Create the wiki directory structure
mkdir -p ~/wiki/{entities,concepts,decisions,lessons,milestones,comparisons,queries,reflections,raw/transcripts}
mkdir -p ~/dev/git/hermes-dashboard/public

# 3. Run the pipeline manually once
python3 ~/.hermes/skills/wiki-transcript-ingest/scripts/export-transcripts.py
python3 ~/.hermes/skills/wiki-autopilot/scripts/find-processable.py 15 > /tmp/raw-scores.json 2>/dev/null
# Then extract + file the top transcripts (agent does this — see wiki-autopilot SKILL.md)
# Finally regenerate dashboard JSON:
python3 ~/dev/git/hermes-dashboard/scripts/generate-wiki-data.py

# 4. Schedule via cron job
cronjob action='create' schedule='0 5 * * *' 
  prompt='Run the wiki-autopilot pipeline: export transcripts, score, extract, file, check index, audit tags, regenerate dashboard JSON.'
```

### WikiPanel frontend internals

- `WikiPanel.tsx` (`frontend/src/components/WikiPanel.tsx`) — main grid: sidebar search + category filters + stats, centre 3D graph, right detail drawer  
- `WikiGraph3D.tsx` (`frontend/src/components/WikiGraph3D.tsx`) — **Babylon.js 3D force-directed graph**: emits neon spheres (category-coloured) connected by lines, ArcRotateCamera, GlowLayer for emissive bloom, interactive hover/click per node; 347 lines of raw Babylon.js API calls (no wrapper)
- `graph-layout.ts` (`frontend/src/lib/graph-layout.ts`) — force-directed layout algorithm (iterative spring simulation) runs client-side; computes node `{x,y,z,vx,vy,vz}` positions from `wiki-data.json` edges before Babylon renders
- Category colour palette: `entities→#00f3ff | concepts→#00ff9f | lessons→#ff00cc | decisions→#ffcc00 | milestones→#ff6600 | reflections→#aa66ff | research→#ff4444` (`getCategoryColor()` in `graph-layout.ts`)
- `wiki-data.json` — generated by `~/dev/git/hermes-dashboard/scripts/generate-wiki-data.py`; placed in dashboard `public/` so Vite auto-copies to `dist/` on build
- **If `wiki-data.json` returns 404:** The 3D graph falls back to "Loading wiki graph…" The pipeline simply hasn't run yet. This is expected on a fresh install.

---

## 18 · Versioning & Branching

- **Branch:** `master` only. No feature branches in normal use.
- **Semantic versioning:** When creating npm packages, bump `major.minor.patch` in both `backend/package.json` and `frontend/package.json`.

---

## 15 · When Making Changes

1. **`scripts/setup.mjs`** — the entry point for first-run / re-run setup. OK to modify freely.
2. **`server.ts`** profile creation (`/profiles/create`) — the only path that writes `.env`. Changes need smoke tests.
3. **`ecosystem.config.js`** / `ecosystem.packaged.config.js` — PM2 configs. Only edit for startup command or path changes.
4. **`ModalChat.tsx`** — the canonical chat. When fixing a chat bug, fix it here first, mirror pattern to ProfileChat.
5. **`ProfileChat.tsx`** — inherits all ModalChat patterns, adds per-profile routing through `/gp`.
6. **Frontend components** in `src/components/` — follow existing patterns (drag/resize, signal style, `.class` not `className`).
7. **Backend** — Bun.native APIs, `jsonErr()` helper, CORS detection pattern for any new profile-write path.

---

## 16 · Frontend Component File Structure (Pattern Reference)

Every SolidJS component follows this structure:

```
MyComponent.tsx
├── interface Props { ... }             // Typed props
├── interface InternalState { ... }     // Local state types
├── Signals / createEffect / onMount    // Signal-first, no classes
├── Helper functions (typed)            // Pure, no side-effects in render
├── export default function MyComponent  // JSX at the bottom
├── <Portal>                            // For modals (floating above everything)
├── class="z-[N]"                       // Z-index scale: panels 100, modals 999999, resize 1000000
└── .class not className (SolidJS syntax)
```

---

*Last updated by agent: 2026-05-21 | Repo commit: e261188*
