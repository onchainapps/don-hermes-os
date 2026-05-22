# don-hermes-os Full Audit

## Project Overview
don-hermes-os is a conversational AI workspace dashboard with per-profile Hermes Agent gateway proxying. Stack: SolidJS/Vite/Tailwind (frontend), Bun/Elysia (backend), PM2 (process management). Port scheme: backend prod=3001, backend dev=3003, dashboard prod=3002, dashboard dev=5173.

## What to Audit

### 1. Hardcoded Backend URLs
Search for any remaining hardcoded `localhost:3001`, `localhost:3101`, `:3001`, `:3101` references in `frontend/src/` that should use `apiUrl()` or `wsUrl()` from `api-base.ts`. Every relative API path like `/api/`, `/gp/`, `/terminal`, `/ws/` must go through the configurable base URL helper — the production dashboard on port 3002 has no Vite proxy.

Already fixed files (check they're correct):
- `frontend/src/lib/api-base.ts` — wsUrl/wsHost/wsUrl functions
- `frontend/src/lib/hermesApi.ts` — uses apiUrl()
- `frontend/src/components/ProfileChat.tsx` — uses apiUrl('/gp')
- `frontend/src/components/EditorTerminal.tsx` — uses wsUrl('/terminal')

Still need to check:
- Any other components making direct fetch() calls with relative paths
- Any `new WebSocket('ws://...')` not using wsUrl

### 2. API Request Patterns
Scan all `fetch(` calls and `new WebSocket(` calls in `frontend/src/`. List any that use a raw path without `apiUrl()` or `wsUrl()`.

### 3. TypeScript / Linting Errors
Check for TypeScript errors across the frontend source. Focus on:
- `frontend/src/lib/api-base.ts` — window.location compatibility
- `frontend/src/components/EditorTerminal.tsx` — TerminalInstance type
- `frontend/src/lib/hermesApi.ts` — generic types

### 4. Backend Routes
Verify the backend (`server.ts`) has all routes the frontend expects:
- `/api/hermes/*` (profiles, config)
- `/gp/*` (gateway proxy)
- `/terminal` (WebSocket)
- `/ws/chat` (WebSocket)
- `/health`
- `/api/version`
- `/api/stats`

### 5. Port Configuration Consistency
Check that all config files reference the correct port scheme:
- ecosystem.config.js (dev, port 3002 for dashboard)
- ecosystem.packaged.config.js (prod, port 3002 for dashboard)
- frontend/scripts/run.mjs (default port 3002)
- All four run.mjs scripts (backend + frontend) have the correct default ports

### 6. Recent Changes Validation
Verify these recent fixes are complete and consistent:
- `api-base.ts` exports `wsUrl()`, `wsHost()`, `apiUrl()`, `apiBase()`
- `EditorTerminal.tsx` imports and uses `wsUrl()` 
- `hermesApi.ts` imports and uses `apiUrl()`
- `ProfileChat.tsx` imports and uses `apiUrl()`

## Boundaries
DO NOT modify any files. This is a read-only audit.
DO NOT modify any .env files, PM2 configs outside the repo, or scripts in ~/llms/.
DO NOT change any production configuration.

## Output Format
Organize findings by section above with:
- CRITICAL: breaks production dashboard
- HIGH: potential production issue
- MEDIUM: code quality or consistency
- LOW: minor/style
