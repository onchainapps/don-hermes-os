# Don OS Backend - Project Memory

## Current State (2026-05-12)
- **Project**: don-os-backend (Bun/Elysia API server)
- **Port**: 3001
- **Git**: ~/dev/git/don-hermes-suite/don-os-backend
- **PM2**: don-os-backend service

## Architecture
- **Runtime**: Bun 1.3.12+
- **Framework**: Elysia
- **Database**: SQLite (state.db) via Bun:sqlite
- **Deployment**: PM2 (don-os-backend)
- **Ecosystem config**: ~/dev/ecosystem.config.cjs

## API Endpoints

### Sessions API
- `GET /api/sessions?limit=100&source=` - List sessions from state.db
- `GET /api/sessions/clustered?limit=200` - Sessions grouped by title
- `GET /api/sessions/search?q=` - Search sessions by title/ID
- `GET /api/sessions/:id/messages?limit=50` - Session messages
- `GET /api/sessions/:id` - Single session details

### Jobs API
- `GET /api/jobs` - List cron jobs (parses `hermes cron list`)
- `POST /api/jobs/create` - Create cron job
- `DELETE /api/jobs/:id` - Delete cron job
- `POST /api/jobs/:id/pause|resume|run` - Job actions

### System API
- `GET /api/gateway/health` - Gateway health check
- `GET /api/stats` - System stats (CPU, memory, disk)

### File System API
- `GET /api/projects` - List directories in ~/dev
- `GET /api/files?path=` - File tree browser
- `GET /api/git/status?repo=` - Git status (branch, staged/unstaged)
- `GET /api/project-root?path=` - Find project root

### Hermes Profiles API
- `GET /api/hermes/profiles` - List profiles
- `GET /api/hermes/profiles/details?name=` - Profile details (SOUL.md, skills)
- `POST /api/hermes/profiles/create` - Create profile
- `POST /api/hermes/profiles/start` - Start profile
- `POST /api/hermes/profiles/stop` - Stop profile
- `DELETE /api/hermes/profiles/delete?name=` - Delete profile

## Database
- **state.db**: Hermes session state
  - Tables: sessions, messages
  - No `active` column (removed from queries)
  - Uses Bun:sqlite native API (`db.query().all()`)

## Known Issues
- None currently

## Recent Changes
- Complete rewrite with full API endpoints
- Fixed SQLite query API usage
- Fixed trailing commas in SQL queries
- Removed non-existent `active` column from queries

## Notes
- All API endpoints return JSON
- Error handling with try/catch blocks
- Uses execSync for shell commands (hermes cron, git)
- Database queries use parameterized queries for safety
- No authentication/authorization (local dev only)
