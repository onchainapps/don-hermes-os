# Don Hermes OS — Packaging & PM2 Installation Plan

## Problem Statement
Currently the frontend and backend are run from source via `pm2 start` with workdir/script paths. This means:
- Every environment needs a full git checkout + `npm install`
- No version pinning between dev and deploy
- PM2 configs reference local paths that break on other machines
- No clean uninstall/upgrade path

## Goal
Package `don-os-frontend` and `don-os-backend` as installable npm packages, install them globally or to a prefix, and run them through PM2 without needing a source checkout.

## Architecture

```
don-hermes-os/
├── packages/              # ← NEW: installable packages
│   ├── don-os-frontend/   # SolidJS+Vite frontend
│   └── don-os-backend/    # Bun+Elysia backend
├── frontend/              # ← LEGACY: keep as source (dev link to package)
├── backend/               # ← LEGACY: keep as source (dev link to package)
├── ecosystem.config.js   # PM2 config updated to use installed binaries
└── docs/
    └── packaging.md       # Full install/upgrade/uninstall docs
```

## Frontend Package (`packages/don-os-frontend`)

### `package.json`
```json
{
  "name": "don-os-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "pm2": "vite build && vite preview --host 0.0.0.0 --port 3101"
  },
  "bin": {
    "don-os-frontend": "scripts/run.mjs"
  },
  "files": ["dist", "scripts/run.mjs"],
  "engines": { "bun": ">=1.3.12" },
  "dependencies": { ... }
}
```

### `scripts/run.mjs`
```js
#!/usr/bin/env node
// Entry point for `don-os-frontend` command
// Runs `vite preview` from the installed dist directory
import { preview } from 'vite';
const server = await preview({ root: new URL('.', import.meta.url), port: 3101, host: true });
```

### `vite.config.ts`
- Must use **relative `base: './'`** for SPA routing to work when installed anywhere
- Output to `dist/` (already standard)
- Environment variables injected at build time via Vite define

### `ecosystem.frontend.config.js` (moved from root)
```js
module.exports = {
  apps: [{
    name: 'don-os-dashboard',
    script: 'node',            // ← node runs the bin shim
    args: ['don-os-frontend'], // ← installed package name
    cwd: '/usr/local/lib/don-os-frontend', // ← install prefix
    env: { NODE_ENV: 'production', PORT: 3101 },
    exec_mode: 'fork',
  }]
}
```

## Backend Package (`packages/don-os-backend`)

### `package.json`
```json
{
  "name": "don-os-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun build src/server.ts --outdir=dist --target=bun",
    "preview": "bun run dist/server.js",
    "typecheck": "tsc --noEmit",
    "pm2": "bun run dist/server.js"
  },
  "bin": {
    "don-os-backend": "scripts/run.mjs"
  },
  "files": ["dist", "scripts/run.mjs", "config"],
  "engines": { "bun": ">=1.3.12" },
  "dependencies": { ... }
}
```

### `config/` directory
- Must carry `.env`, `config.yaml`, `nginx.conf` as **unlisted** files (not in `files[]`)
- Ship a `config.example.env` and `config.example.yaml` as templates
- On first run, `run.mjs` checks for config and prints a setup message if missing

### `scripts/run.mjs`
```js
#!/usr/bin/env node
import path from 'path';
import { readdir, readFile } from 'fs/promises';

// Check config exists before starting
const pkgDir = new URL('.', import.meta.url);
const cfgDir = path.join(pkgDir, '..', 'config');
try { await readdir(cfgDir); } catch {
  console.error('[don-os-backend] Config directory not found.');
  console.error('  Install config: cp config.example.env config/.env && cp config.example.yaml config/config.yaml');
  process.exit(1);
}
import('./dist/server.js');
```

## PM2 Integration

### `ecosystem.packaged.config.js` (new, at repo root)
```js
// For deployments using installed packages
module.exports = {
  apps: [
    {
      name: 'don-os-backend',
      script: '/usr/local/lib/don-os-backend/node_modules/.bin/don-os-backend',
      cwd: '/usr/local/lib/don-os-backend',
      env: { NODE_ENV: 'production' },
      exec_mode: 'fork',
      error_file: '/var/log/don-os-backend.err.log',
      out_file: '/var/log/don-os-backend.out.log',
    },
    {
      name: 'don-os-dashboard',
      script: 'node',
      args: ['don-os-frontend'],
      cwd: '/usr/local/lib/don-os-frontend',
      env: { NODE_ENV: 'production', PORT: 3101 },
      exec_mode: 'fork',
      error_file: '/var/log/don-os-dashboard.err.log',
      out_file: '/var/log/don-os-dashboard.out.log',
      env_file: '/etc/don-os/dashboard.env',
    }
  ]
};
```

### Dev workflow (unchanged)
`ecosystem.config.js` still points at local `../frontend` / `../backend` workdirs. PM2 `--env dev` picks the right file.

## Install Procedure

```bash
# On any machine:
bun add -g don-os-frontend don-os-backend    # or: npm i -g ...

# Deploy configs (one-time):
sudo mkdir -p /etc/don-os
sudo cp ~/.bun/packages/don-os-frontend/config.example.env /etc/don-os/dashboard.env
sudo nano /etc/don-os/dashboard.env              # fill in HMAC etc.

# PM2:
pm2 deploy ecosystem.packaged.config.js
pm2 save
```

## Upgrade Procedure

```bash
bun update -g don-os-frontend don-os-backend
pm2 restart don-os-backend don-os-dashboard
pm2 save
```

## Uninstall

```bash
pm2 delete don-os-backend don-os-dashboard
bun remove -g don-os-frontend don-os-backend
```

## npx / direct run (no PM2)

```bash
npx don-os-backend               # temp backend on port 3001
npx don-os-frontend              # temp dashboard on port 3101
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Build-time env vars baked into dist | Use relative paths, load runtime configs from `/etc/don-os/` |
| PM2 cwd still points at source | Use `ecosystem.packaged.config.js` for deploys |
| Breaking changes bump major versions | Semantic versioning, test install before bump |
| Path in browser console logs | Use relative import paths in Vite config |
