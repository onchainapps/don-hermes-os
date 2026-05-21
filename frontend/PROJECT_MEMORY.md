# Don OS Frontend - Project Memory

## Current State (2026-05-12)
- **Project**: don-os-frontend (SolidJS dashboard)
- **Port**: 5173 (Vite dev server)
- **Backend**: don-os-backend on port 3001
- **Git**: ~/dev/git/don-hermes-suite/don-os-frontend
- **PM2**: don-os-dashboard service

## Architecture
- **Frontend**: SolidJS + Vite 7 + Tailwind CSS v4
- **Backend**: don-os-backend (Bun/Elysia, port 3001)
- **Database**: SQLite (state.db) via Bun:sqlite
- **Deployment**: PM2 (don-os-dashboard, don-os-backend)
- **Ecosystem config**: ~/dev/ecosystem.config.cjs

## API Endpoints (all proxied via Vite to :3001)
- `/api/sessions` - Session management
- `/api/sessions/clustered` - Grouped sessions
- `/api/sessions/search` - Search sessions
- `/api/sessions/:id/messages` - Session messages
- `/api/jobs` - Cron jobs management
- `/api/gateway/health` - Gateway health check
- `/api/stats` - System stats
- `/api/projects` - List ~/dev directories
- `/api/files` - File tree browser
- `/api/git/status` - Git status
- `/api/project-root` - Find project root
- `/api/hermes/profiles` - Profile management
- `/api/hermes/profiles/details` - Profile details (SOUL.md, skills)

## Vite Config
- `/api` proxy -> localhost:3001
- `/hermes-api` proxy -> localhost:9119
- `/terminal` WebSocket proxy -> localhost:3001

## Components
- **ProfileManager**: Hermes profile management with SOUL.md display
- **SessionPanel**: Session list and search
- **CronPanel**: Cron jobs management
- **FileTree**: File browser
- **GitPanel**: Git status
- **EditorTerminal**: Monaco editor + terminal
- **Chat**: Chat interface with Don

## Known Issues
- None currently

## Recent Changes
- Complete rewrite with profile management, sessions, jobs, file browser
- Fixed Vite proxy for terminal WebSocket (port 3001)
- Fixed race condition in profile details fetching
- Fixed SQLite query API usage

## Notes
- All profiles share 124 global skills but have unique local skills and SOUL.md content
- Custom profiles (don-babylonjs-dev, don-blender-designer) have tailored SOUL.md files
- Generic profiles (don-mirror-trader, don-research) use default Hermes Agent SOUL.md
