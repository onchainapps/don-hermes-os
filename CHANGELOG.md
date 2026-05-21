# Changelog — 2026-05-21

## ProfileChat Enhancement
- **Position fix**: Removed `<Portal>` wrapper, added explicit `position: fixed` inline style to prevent Tailwind `relative` class from overriding. Chat now renders inside main layout div.
- **Resize handle**: Bottom-right `⤡` drag handle with `size` signal persisted to IndexedDB.
- **Auto-scroll**: `createEffect` watches message count, scrolls to bottom via `requestAnimationFrame`.
- **Stale Portal import**: Cleaned up unused `import { Portal }`.

## Per-Profile Actions
- **CONFIG button**: Each expanded profile card now has a CONFIG button that opens a YAML editor modal. Backend endpoints: `GET/PUT /api/hermes/profiles/config/raw?name={profile}` reads/writes `~/.hermes/profiles/{name}/config.yaml`.
- **CRON button**: Opens a CronPanel modal overlay routed through `/gp` proxy with `X-Hermes-Profile` header, so each profile sees only its own scheduled jobs.
- **Both buttons**: CRON and CONFIG removed from global sidebar — now accessible only per-profile from ProfileManager.

## Sidebar Cleanup
- Removed `CHAT` icon and entry from sidebar (SYSTEM is now first).
- Removed `CRON` and `HERMES` sidebar entries (now per-profile).
- Shortcuts renumbered: SYSTEM=1, CODE=2, SESSIONS=3, WIKI=4, PROFILES=5.
- Gateway status dot retained at bottom of sidebar.

## CronPanel
- Accepts `profile` prop that routes jobs API through `/gp` proxy with `X-Hermes-Profile` header.
- Shows profile badge in header when filtered.
- Refactored `fetchJobs`/`createJob`/`deleteJob` to use `cronUrl()` and `cronHeaders()` helpers.

## Docs
- `docs/packaging.md` — Full architecture plan for packaging frontend/backend as installable npm packages (`don-os-frontend`, `don-os-backend`) with PM2 deployment, install, upgrade, and uninstall procedures.
