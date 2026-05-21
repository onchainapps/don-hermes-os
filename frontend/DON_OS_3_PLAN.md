# Don OS 3.0 — Electrobun Rebase Plan

## Overview

Rebase Don's Dashboard from browser-tab SolidJS + Node backend to a native desktop app using **Electrobun**. Kill the Node server, run everything from a Bun main process.

### Current (Don OS 2.0)
```
Browser → Vite/SolidJS SPA → Node server.js (:3000) → Gateway (:8642)
```

### Target (Don OS 3.0)
```
Electrobun app → Bun main process → Gateway child process (:8642)
            └── BrowserWindow → SolidJS UI (views:// protocol)
```

---

## Architecture

### Directory Structure
```
dons-dashboard/
├── electrobun.config.ts          # NEW — Electrobun configuration
├── src/
│   ├── bun/
│   │   └── index.ts              # NEW — Main process (replaces server.js)
│   ├── mainview/
│   │   ├── index.ts              # NEW — View entrypoint (loads SolidJS app)
│   │   └── index.html            # NEW — View HTML shell
│   ├── components/               # EXISTS — Move as-is (adapt imports only)
│   │   ├── Chat/                 # EXISTS
│   │   ├── MonacoEditor.tsx      # EXISTS
│   │   ├── FileTree.tsx          # EXISTS
│   │   ├── EditorTerminal.tsx    # EXISTS — adapts to RPC instead of WS
│   │   ├── EditorChat.tsx        # EXISTS
│   │   ├── Sidebar.tsx           # EXISTS
│   │   ├── StatusBar.tsx         # EXISTS
│   │   ├── SessionPanel.tsx      # EXISTS
│   │   ├── GitPanel.tsx          # EXISTS
│   │   ├── WikiPanel.tsx         # EXISTS
│   │   ├── WikiGraph3D.tsx       # EXISTS — BabylonJS needs CEF on Linux
│   │   ├── WikiSearch.tsx        # EXISTS
│   │   ├── PagePanel.tsx         # EXISTS
│   │   ├── SystemPanel.tsx       # EXISTS
│   │   ├── CronPanel.tsx         # EXISTS
│   │   └── ResizableSplitter.tsx # EXISTS
│   ├── App.tsx                   # EXISTS — Minimal adaptation
│   ├── main.tsx                  # EXISTS — Adapt entrypoint
│   ├── index.css                 # EXISTS — Move as-is
│   └── shared/
│       └── rpc-types.ts          # NEW — Typed RPC schema
├── package.json                  # MODIFY — Add electrobun, keep deps
└── tsconfig.json                 # MODIFY — Add JSX config
```

---

## Phase 1: Scaffold Electrobun Shell

### 1.1 electrobun.config.ts
```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Don OS",
    identifier: "io.onchainapps.donos",
    version: "3.0.0",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      jsx: { runtime: "automatic", importSource: "solid-js" },
      sourcemap: "linked",
      minify: false,
    },
    views: {
      mainview: { entrypoint: "src/mainview/index.ts" },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/index.css": "views/mainview/index.css",
    },
    linux: { bundleCEF: true, defaultRenderer: "cef" },
    mac: { defaultRenderer: "native" },
    win: { bundleCEF: true, defaultRenderer: "cef" },
  },
} satisfies ElectrobunConfig;
```

### 1.2 src/bun/index.ts (Main Process)
Replaces `server.js` entirely. Responsibilities:
- Create BrowserWindow pointing to `views://mainview/index.html`
- Spawn Gateway as child process on startup
- Define typed RPC handlers for all backend functions
- System stats (native Bun, no HTTP needed)
- File operations (native Bun `fs`)
- Terminal management (Bun subprocess + pty)
- Tray icon with menu (start/stop gateway, show/hide window, quit)
- Application menu

```typescript
import { BrowserWindow, Tray, ApplicationMenu, Utils } from "electrobun/bun";
import { spawn, type Subprocess } from "bun";
import { defineRPC } from "./rpc-handler";

// 1. Start Gateway subprocess
let gateway: Subprocess;
function startGateway() {
  gateway = spawn(["python3", "-m", "gateway.run"], {
    cwd: "/home/don/.hermes/hermes-agent",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PORT: "8642" },
  });
}

// 2. Create main window
const rpc = defineRPC();
const win = new BrowserWindow({
  title: "Don OS 3.0",
  url: "views://mainview/index.html",
  frame: { width: 1400, height: 900 },
  titleBarStyle: "hiddenInset",
  rpc,
});

// 3. Tray
const tray = new Tray({
  title: "Don",
  image: "views://assets/tray-icon.png",
  template: true,
});
tray.setMenu([
  { label: "Show Dashboard", action: "show", type: "normal" },
  { label: "Restart Gateway", action: "restart-gw", type: "normal" },
  { type: "separator" },
  { label: "Quit", role: "quit" },
]);

// 4. Lifecycle
startGateway();
```

### 1.3 RPC Schema (src/shared/rpc-types.ts)
Replace HTTP API calls with typed RPC:

```typescript
export type DonOSRPC = {
  bun: RPCSchema<{
    requests: {
      getSystemStats: { params: {}; response: SystemStats };
      getSessions: { params: { limit?: number }; response: Session[] };
      gatewayProxy: { params: { path: string; body?: any }; response: any };
      fileRead: { params: { path: string }; response: string };
      fileWrite: { params: { path: string; content: string }; response: boolean };
      terminalCreate: { params: { cols: number; rows: number }; response: { id: string } };
      terminalWrite: { params: { id: string; data: string }; response: void };
      terminalResize: { params: { id: string; cols: number; rows: number }; response: void };
      terminalClose: { params: { id: string }; response: void };
      gitStatus: { params: { path: string }; response: string };
      gitLog: { params: { path: string; count?: number }; response: string };
    };
    messages: {
      terminalOutput: { id: string; data: string };
      terminalExit: { id: string; code: number };
      gatewayLog: { level: string; message: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      notify: { title: string; body: string };
    };
  }>;
};
```

---

## Phase 2: Adapt SolidJS Frontend

### 2.1 Entrypoint Changes
- `src/mainview/index.ts` — imports `App.tsx`, mounts to DOM
- `src/mainview/index.html` — minimal shell, loads `index.ts`
- Remove Vite-specific imports (HMR, env vars)
- Replace `import.meta.env` with BuildConfig or hardcoded values

### 2.2 Replace HTTP Calls with RPC
Every component that hits `server.js` endpoints needs to switch to RPC:

| Current (HTTP) | New (RPC) |
|----------------|-----------|
| `fetch('/api/stats')` | `rpc.request.getSystemStats({})` |
| `fetch('/api/sessions')` | `rpc.request.getSessions({})` |
| `fetch('/api/gateway/...')` | `rpc.request.gatewayProxy({ path, body })` |
| `WebSocket('/terminal')` | `rpc.request.terminalCreate()` + messages |
| `fetch('/api/files/...')` | `rpc.request.fileRead/Write()` |
| `fetch('/api/git/...')` | `rpc.request.gitStatus/Log()` |

### 2.3 Components to Adapt
- **Chat/** — Replace `fetch('/api/gateway/v1/chat/completions')` with RPC `gatewayProxy`
- **EditorTerminal** — Replace WebSocket with RPC `terminalCreate/Write/Resize` + `terminalOutput` messages
- **SystemPanel** — Replace `fetch('/api/stats')` with RPC
- **SessionPanel** — Replace `fetch('/api/sessions')` with RPC
- **FileTree** — Replace file API calls with RPC
- **GitPanel** — Replace git API calls with RPC
- **CronPanel** — Replace job API calls with RPC

### 2.4 Components NOT to Touch
- MonacoEditor — self-contained, no backend calls
- WikiGraph3D — BabylonJS, needs CEF on Linux (already configured)
- WikiPanel, WikiSearch, PagePanel — self-contained or gateway-proxied
- ResizableSplitter — pure UI

---

## Phase 3: Build & Test

### 3.1 Remove Dead Code
- Delete `server.js` (replaced by `src/bun/index.ts`)
- Remove `vite` and `vite-plugin-solid` from devDependencies (Electrobun uses Bun bundler)
- Remove `ecosystem.config.cjs` (PM2 no longer needed for Don OS)
- Clean up any Vite-specific plugins or config

### 3.2 Build Commands
```json
{
  "scripts": {
    "dev": "electrobun dev --watch",
    "build": "electrobun build --env=stable",
    "start": "electrobun run"
  }
}
```

### 3.3 Testing Checklist
- [ ] App launches and shows main window
- [ ] Gateway starts as child process
- [ ] Chat panel connects to Gateway via RPC
- [ ] Terminal creates and works (pty)
- [ ] File tree reads/writes files
- [ ] Git panel shows status/log
- [ ] System stats update live
- [ ] Tray icon works (show/hide/quit)
- [ ] Application menu works
- [ ] Window resize/close works
- [ ] Gateway restart from tray works
- [ ] BabylonJS 3D graph renders (needs CEF)

---

## Phase 4: Cleanup & Polish

### 4.1 Gateway Child Process Management
- Auto-restart gateway if it crashes
- Show gateway status in tray menu
- Log gateway output to console + file
- Clean shutdown on app quit (SIGTERM → wait → SIGKILL)

### 4.2 Window Management
- Remember window position/size between launches
- Custom titlebar with draggable region (hiddenInset)
- Window controls (close/minimize/maximize) via RPC

### 4.3 Error Handling
- Gateway connection failure → show reconnect UI
- RPC timeout handling
- Graceful degradation if terminal pty unavailable

---

## Key Risks

| Risk | Mitigation |
|------|------------|
| System WebView doesn't support Monaco | Use CEF on Linux (already configured) |
| BabylonJS needs WebGL | CEF has full Chromium, supports WebGL |
| node-pty doesn't work with Bun | Use Bun's native subprocess or `bun-pty` |
| Gateway Python process dies | Monitor + auto-restart from main process |
| Breaking existing components | Move first, adapt second — minimal changes |

---

## Agent Delegation Plan

### OpenCode Agent — Main Process + Config
- Task 1: Scaffold electrobun.config.ts
- Task 2: Implement src/bun/index.ts (main process)
- Task 3: Implement RPC handler
- Task 4: Create view entrypoints

### Claude Code Agent — Frontend Adaptation
- Task 1: Create RPC client utility
- Task 2: Adapt Chat/ components to use RPC
- Task 3: Adapt EditorTerminal to use RPC
- Task 4: Adapt SystemPanel, SessionPanel, FileTree, GitPanel, CronPanel
- Task 5: Update App.tsx entrypoint and routing

### Don (me) — Orchestration + Verification
- Run both agents in parallel
- Verify builds
- Test in browser
- Fix integration issues
