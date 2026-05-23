# Agent Setup Runbook — don-hermes-os

> Canonical one-shot sequence for automated agents (CI/CD, fresh clones, recovery).

## Prerequisites

| Tool | Minimum | Notes |
|------|---------|-------|
| Node.js | 20+ | for `openssl rand` fallback in `generateApiKey()` |
| bun | 1.3+ | primary runtime |
| git | any | clone checked out at `CLONE_ROOT` |

Detected automatically by `scripts/setup.mjs`.

---

## One-Shot Install

```bash
cd <path-to-don-hermes-os>
node scripts/setup.mjs --ci --regenerate
```

Flags:

| Flag | Effect |
|------|--------|
| `--ci` | non-interactive; auto-creates default profile; skips prompts |
| `--regenerate` | overwrites existing profile `.env` in-place (safe idempotent) |

Both flags together = fully headless, fully repeatable.

---

## What the Script Does (step by step)

1. **Detect** — local IP, GPU(s), toolchain (bun / node / pm2 / nginx / hermes / openssl)
2. **Rewrite PM2 ecosystem paths** — always runs; patches `ecosystem.config.js` and `ecosystem.packaged.config.js` to replace any hardcoded absolute `cwd:` that does not live under the current clone root. Idempotent: no-op if paths already point here.
3. **Generate/regenerate profile**  
   - No existing profiles → creates `~/.hermes/profiles/default/.env` (and copies `../SOUL.md` if present)  
   - Existing profiles + `--regenerate` → rewrites `.env` in-place, keeps profile directory  
   - Existing profiles, no flag → skips
4. **Print next steps** — `pm2 start ecosystem.config.js`, browser URL, etc.

---

## Profile .env Fields (generated)

| Variable | Source |
|----------|--------|
| `GATEWAY_HOST` | `127.0.0.1` |
| `GATEWAY_PORT` | `8650` |
| `GATEWAY_AUTH` | `openssl rand -hex 32` (or `crypto.randomBytes`) |
| `API_SERVER_CORS_ORIGINS` | `http://<local-ip>:5173,http://<local-ip>:3002` |
| `GATEWAY_PROXY_PORT` | `8650` |

---

## Troubleshooting

**`ENOENT` on `pm2 start`**  
Run the setup script first — it rewrites `ecosystem.config.js` paths from the hardcoded
`/home/don/dev/git/don-hermes-os/…` in the committed file to the actual clone path.

**"Profiles already exist — skipping creation."**  
Pass `--regenerate` to force a fresh `.env` write:
`node scripts/setup.mjs --ci --regenerate`

**`hermes` CLI not found**  
Install separately. The setup script detects it but does not install it.

**Changing CORS ports**  
Edit `corsPortsDefault` in `scripts/setup.mjs` (line ~239). Defaults: `['3001', '3002']`
for prod ports. Dev ports are `5173` (frontend) and `3003` (backend); add them
explicitly if you run both stacks.

---

## Idempotence

Running `node scripts/setup.mjs --ci --regenerate` repeatedly is safe:
- Ecosystem paths are only rewritten when a mismatch is found.
- `.env` is overwritten each time.
- No duplicate profiles are created.
