# Don Hermes OS

A conversational AI workspace dashboard with per-profile Hermes Agent gateway proxying.

> Built with SolidJS + Vite + Tailwind CSS (frontend) · Bun + Elysia (backend)

---

## Intro 
[![Don Hermes Os](https://github.com/onchainapps/don-hermes-os/blob/master/media/intro-thumbnail.png)](https://github.com/onchainapps/don-hermes-os/blob/master/media/onboarding.mp4)   
---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/onchainapps/don-hermes-os.git
cd don-hermes-os

# 2. Install dependencies
bun install

# 3. Run setup (detects LAN IP, generates .env, creates default profile)
node scripts/setup.mjs

# 4. Build & start
npm run build
bun run backend/server.ts
```

See `SETUP.md` in the repo root for detailed installation instructions.

## Architecture

| Layer | Stack | Port |
|-------|-------|------|
| **Frontend** | SolidJS + Vite + Tailwind | `:5173` (dev) |
| **Backend** | Bun + Elysia | `:3001` |
| **Gateway** | Hermes Agent per profile | `:8642+` (proxy via `/gp`) |

## Features

- **System Dashboard** — CPU, memory, gateway status panels
- **Code Editor** — Monaco IDE with file tree & terminal
- **Knowledge Graph Wiki** — Category tags, stats, node list
- **Agent Profiles** — Create & manage Hermes Agent profiles with per-profile `.env`

## NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start both backend + Vite dev server |
| `npm run build` | Build frontend + pack backend |
| `npm run bump:patch` | Increment patch version, build, commit |
| `npm run setup` | Run fresh install wizard |

---

**License:** MIT
