# Don OS Backend — API Server

Standalone Bun HTTP/WebSocket backend. **API-only** — no static file serving.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│  don-os-backend :3001│◄────│  don-os-dashboard :5173  │
│  (Bun API server)   │     │  (Vite HMR dev server)   │
│                     │     │  Proxies /api/* → :3001   │
└─────────┬───────────┘     └──────────────────────────┘
          │
          ▼
┌─────────────────────┐
│  hermes-gateway :8642│
│  (Hermes Agent)      │
└─────────────────────┘
```

- **:3001** — Don OS Backend (API + WebSocket only, no frontend)
- **:5173** — Vite HMR dev server (serves SolidJS frontend, hot reload)
- **:8642** — Hermes Gateway (chat, sessions, cron)

The dashboard frontend lives in `don-os-frontend/` and is served by Vite during development. All `/api` calls from the frontend are proxied to `:3001` by Vite's proxy config.

## PM2 Processes

| Name | Port | Description |
|------|------|-------------|
| `don-os-backend` | 3001 | Bun API server (WebSocket + REST) |
| `don-os-dashboard` | 5173 | Vite dev server with HMR |

```bash
# Start
bunx pm2 start ecosystem.config.cjs       # don-os-backend
bunx pm2 start "bunx vite --host" --name don-os-dashboard --cwd ~/dev/git/don-hermes-suite/don-os-frontend

# Manage
bunx pm2 restart don-os-backend
bunx pm2 logs don-os-backend --lines 50
```

## API Endpoints

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | System stats (CPU, memory, uptime) |
| GET | `/api/gateway/health` | Hermes gateway health check |

### Chat & Sessions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Proxy to Hermes gateway |
| GET | `/api/sessions` | List sessions from state.db |
| GET | `/api/sessions/:id` | Get single session detail |
| GET | `/api/sessions/:id/messages` | Get session messages |
| GET | `/api/sessions/search?query=` | Full-text search sessions |
| GET | `/api/sessions/clustered` | Clustered session list |

### Files & Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/files?path=` | Read file or list directory |
| POST | `/api/files` | Write/update file |
| POST | `/api/files/create` | Create new file/directory |
| POST | `/api/files/delete` | Delete file/directory |
| GET | `/api/projects` | Scan for git repos + directories |
| GET | `/api/project-root?path=` | Detect project root from file path |

### Git
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/git/*` | Git operations (status, log, diff) |

### Editor & Completions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/editor-context` | Get active editor file/project |
| POST | `/api/editor-context` | Set active editor context |
| POST | `/api/completions` | Inline ghost-text completions |

### Cron Jobs (proxy to gateway)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List cron jobs |
| POST | `/api/jobs` | Create cron job |
| GET | `/api/jobs/:id` | Get job detail |
| PATCH | `/api/jobs/:id` | Update job |
| DELETE | `/api/jobs/:id` | Delete job |
| POST | `/api/jobs/:id/(pause|resume|run)` | Control job |

## WebSocket

| Path | Description |
|------|-------------|
| `ws://localhost:3001/terminal?token=*** | Terminal session (auth required) |

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `3001` | Listen port |
| `DIST_PATH` | _(unset)_ | Static dist path — **leave unset** (API-only mode) |
| `HERMES_DB` | `~/.hermes/state.db` | Path to Hermes state database |
| `GATEWAY_HOST` | `127.0.0.1` | Hermes gateway host |
| `GATEWAY_PORT` | `8642` | Hermes gateway port |
| `GATEWAY_AUTH` | — | Hermes gateway auth token |
| `PROJECT_NAME` | `don-os-backend` | Label for logs |

**Note:** `DIST_PATH` was previously required. As of the HMR refactor, don-os-backend is API-only. The frontend is served exclusively by Vite (`don-os-dashboard`). Setting `DIST_PATH` re-enables static file serving as a fallback — not recommended with the Vite setup.

## Gateway Proxy

don-os-backend is the **single gateway proxy** for all dashboards. Both don-os-dashboard and mirror-trader route chat through `/api/chat`:

```
don-os-dashboard (browser) → Vite :5173 → don-os-backend :3001/api/chat → gateway :8642
mirror-trader (browser) → Bun  :3020 → don-os-backend :3001/api/chat → gateway :8642
```

don-os-backend handles Bearer auth injection (`dev-key-12345`) and `X-Hermes-Session-Id` header forwarding. Dashboards don't need `API_SERVER_KEY` for chat.

## Dependencies

- Bun runtime
- `ws` — WebSocket server
