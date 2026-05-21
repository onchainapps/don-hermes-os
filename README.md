# Don Hermes OS

A Hermes Agent dashboard with per-profile gateway proxy architecture. Provides a web UI (SolidJS + Vite) and backend API (Bun) for managing multiple isolated Hermes agent profiles, each running its own gateway process.

## Architecture

```
Browser → /gp/* → Vite proxy → Backend (port 3001) → Profile Gateway (192.168.1.141:XXXX)
```

- **frontend/** — SolidJS + Vite + Tailwind dashboard. Single-instance floating chat (ModalChat) and per-profile chat windows (ProfileChat) with Runs API streaming.
- **backend/** — Bun API server. Profiles CRUD, session management, system stats, and the dynamic gateway proxy (`/gp/*`) that reads `X-Hermes-Profile` header and routes to the correct profile gateway.

## Prerequisites

- [Bun](https://bun.sh) v1.3.12+
- [Hermes Agent](https://hermes-agent.nousresearch.com) installed and configured
- PM2 (for production deployment)
- A running Hermes gateway (main gateway at port 8642 by default)

## Quick Start

### 1. Start the backend

```bash
cd backend
bun run server.ts
```

The API server runs on **port 3000** by default (override with `PORT` env var).

Key env vars for the backend:
- `PORT` — listen port (default: 3000)
- `HERMES_STATE_DB` — path to Hermes state.db (default: `~/.hermes/state.db`)
- `GATEWAY_HOST` — main gateway host (default: 127.0.0.1)
- `GATEWAY_PORT` — main gateway port (default: 8642)
- `GATEWAY_AUTH` — main gateway auth token

### 2. Start the frontend

```bash
cd frontend
bun install
bun run dev
```

The dev server runs on **port 5173** by default. Create a `.env` file:

```env
VITE_GATEWAY_AUTH=dev-key-12345
VITE_GATEWAY_URL=http://192.168.1.141:8642
```

### 3. Create Hermes profiles

Each profile needs:
- A directory under `~/.hermes/profiles/{name}/`
- A `.env` file with API server settings:

```env
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8650
API_SERVER_KEY=your-profile-api-key-here
API_SERVER_CORS_ORIGINS=http://192.168.1.141:5173,http://localhost:5173,http://127.0.0.1:5173
```

- A `config.yaml` with the profile's LLM provider and agent configuration
- A running gateway service (`hermes -p {name} gateway install && hermes -p {name} gateway start`)

Profiles can also be created and managed from the dashboard UI.

### 4. Open the dashboard

Navigate to `http://192.168.1.141:5173` (or your server's IP).

## Gateway Proxy System

When you open a profile chat, the request flow is:

1. Browser sends `POST /gp/v1/runs` with `X-Hermes-Profile: profile-name` header
2. Vite proxy forwards to backend at `localhost:3001`
3. Backend's `handleGatewayProxy()` reads the profile header
4. Backend looks up `~/.hermes/profiles/{name}/.env` to find `API_SERVER_PORT` and `API_SERVER_KEY`
5. Backend proxies the request to `http://192.168.1.141:{port}/{path}` with the profile's auth key
6. Response (including SSE streaming) is piped back through all layers

This avoids CORS issues (browser talks to same origin) and keeps API keys server-side.

### Key Files

| File | Role |
|------|------|
| `frontend/vite.config.ts` | Vite proxy config — routes `/gp` to backend |
| `frontend/src/components/ProfileChat.tsx` | Per-profile chat with Runs API streaming |
| `frontend/src/components/ModalChat.tsx` | Single-instance floating chat |
| `backend/server.ts` | Backend API — profiles CRUD, gateway proxy, sessions |
| `backend/server.ts` (handleGatewayProxy) | Dynamic profile-aware proxy handler |

### API Endpoints

**Backend API** (port 3000):
- `GET /api/stats` — system stats (CPU, memory, uptime)
- `GET /api/gateway/health` — gateway health check
- `GET /api/hermes/profiles` — list profiles with status
- `POST /api/hermes/profiles/create` — create a new profile
- `DELETE /api/hermes/profiles/delete?name=X` — delete a profile
- `POST /api/hermes/profiles/start?name=X` — start profile gateway
- `POST /api/hermes/profiles/stop?name=X` — stop profile gateway
- `GET /api/hermes/profiles/{name}/details` — profile details
- `GET /api/hermes/sessions` — session list
- `GET /api/hermes/config` — Hermes config

**Gateway Proxy** (routed through Vite `/gp`):
- `POST /gp/v1/runs` — create a new agent run (with `X-Hermes-Profile` header)
- `GET /gp/v1/runs/{runId}` — poll run status
- `GET /gp/v1/runs/{runId}/events` — SSE stream of events
- `POST /gp/v1/runs/{runId}/stop` — cancel a run

## Production Deployment

Both services are managed via PM2:

```bash
# Backend
pm2 start backend/server.ts --name don-os-backend --interpreter bun

# Frontend (Vite dev server)
pm2 start frontend/node_modules/.bin/vite --name don-os-dashboard -- --host
```

The PM2 ecosystem is configured to restart on crash and start on system boot.

## Project Structure

```
don-hermes-os/
├── frontend/              # SolidJS + Vite dashboard
│   ├── src/
│   │   ├── components/    # UI components (ModalChat, ProfileChat, etc.)
│   │   ├── lib/           # Shared utilities (chat-ui, gatewayClient)
│   │   └── App.tsx        # Main app with sidebar + panel routing
│   ├── vite.config.ts     # Vite config with proxy rules
│   └── package.json
├── backend/               # Bun API server
│   ├── server.ts          # Main server with all API handlers
│   └── CHANGELOG.md
├── package.json           # Monorepo root scripts
└── README.md
```
