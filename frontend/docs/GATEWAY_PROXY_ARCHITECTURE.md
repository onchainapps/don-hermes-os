# Gateway Proxy Architecture

## Problem

Each Hermes profile runs its own isolated gateway process on a unique port (e.g., `don-researcher` on `:8650`, `don-developer` on `:8651`). Each gateway has its own API key stored in the profile's `.env` file. The browser cannot:

- Talk to these gateways directly (CORS — different origins from the Vite dev server)
- Know the per-profile API keys (stored server-side in `.env` files)
- Route requests dynamically based on `X-Hermes-Profile` header (Vite proxy config is static)

## Solution: Backend Gateway Proxy

A three-hop proxy that routes through the existing backend (Bun server on port 3001):

```
Browser → /gp/* → Vite proxy → Backend (localhost:3001) → Profile Gateway (192.168.1.141:XXXX)
```

### Request Flow

1. **Browser** sends request to `/gp/v1/runs` with `X-Hermes-Profile: don-researcher` header
2. **Vite proxy** (vite.config.ts) forwards `/gp/*` to `http://localhost:3001` (the backend)
3. **Backend** (server.ts `handleGatewayProxy`) reads the `X-Hermes-Profile` header
4. **Backend** looks up the profile's `.env` for `API_SERVER_PORT` and `API_SERVER_KEY`:
   - Default profile (`name=default`): `~/.hermes/.env`  
   - Named profiles: `~/.hermes/profiles/{profileName}/.env`
5. **Backend** proxies the request to `http://192.168.1.141:{port}/{path}` with `Authorization: Bearer {key}`
6. **Response** (including SSE streaming) is piped back through all three layers

### Key Files

| File | Role |
|------|------|
| `don-os-frontend/vite.config.ts` | Vite proxy — routes `/gp` to backend |
| `don-os-frontend/src/components/ProfileChat.tsx` | Frontend chat component — uses `/gp` base, sends `X-Hermes-Profile` header |
| `don-os-backend/server.ts` | Backend — `handleGatewayProxy()` + `readProfileEnv()` functions |

### Backend Implementation

**`readProfileEnv(profileName)`** reads the profile's `.env` file line by line, taking the last occurrence of `API_SERVER_PORT` and `API_SERVER_KEY` (supports env files with override ordering).

**`handleGatewayProxy(req, pathname)`** handles all requests under `/gp/*`:
1. Strips `/gp` prefix from the path
2. Reads `X-Hermes-Profile` header
3. If profile name is present, looks up the profile's `.env` for port + key
4. If no profile name or no port found, falls back to the main gateway (`GATEWAY_HOST:GATEWAY_PORT`)
5. Builds proxied headers — strips routing headers (`X-Hermes-Profile`, `host`), adds `Authorization: Bearer`
6. Forwards the request using Bun's native `fetch()`
7. Returns the response as-is — SSE streaming is handled transparently because Bun's `Response` pipes `ReadableStream` natively

### Profile .env Format

Each profile must have an `.env` file with these keys:
- **Default profile**: `~/.hermes/.env` 
- **Named profiles**: `~/.hermes/profiles/{name}/.env`

```env
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8650
API_SERVER_KEY=afa8ff85...
API_SERVER_CORS_ORIGINS=http://192.168.1.141:5173,http://localhost:5173,http://127.0.0.1:5173
```

### Why Not Direct Connections?

- **CORS**: Browsers block cross-origin requests to `192.168.1.141:8650` from `192.168.1.141:5173`
- **Auth**: Per-profile API keys are stored server-side, not accessible to the client
- **Dynamic routing**: Vite proxy config is static — can't add new profile routes at runtime

### Why Not a Separate Proxy Server?

The existing backend (Bun, port 3001) already serves the dashboard API. Adding the gateway proxy handler there requires zero new infrastructure — just a small function and a Vite config change.
