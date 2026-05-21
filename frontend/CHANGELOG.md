# Changelog

## [Unreleased]

### Added
- **Gateway Proxy Architecture**: Dynamic per-profile gateway routing through the backend.
  - `vite.config.ts`: Added `/gp` Vite proxy route → `localhost:3001`
  - `server.ts`: Added `handleGatewayProxy()` + `readProfileEnv()` — reads profile `.env` for port + API key, proxies requests with proper auth
  - `ProfileChat.tsx`: Full rewrite matching `ModalChat.tsx` patterns:
    - Two-phase Runs API streaming (`POST /v1/runs` → `GET /v1/runs/{runId}/events`)
    - SSE reader with `message.delta` event parsing
    - Thinking animation (rotating phrases + bounce dots)
    - `MessageContent` component for markdown/shiki rendering
    - `<Index>` instead of `<For>` (correct SolidJS reactivity)
    - Proper drag with boundary clamping and cleanup
    - Escape key to close, Enter with `preventDefault()`
    - Auth handled by backend proxy — no API keys in the browser
    - Debug footer showing port + profile routing info
  - Added `docs/GATEWAY_PROXY_ARCHITECTURE.md` — full system documentation

### Fixed
- **ProfileChat.tsx**: Three crash bugs fixed (`API_BASE` undefined, `isOpen`/`setIsOpen` never declared, missing `createMemo` imports)
- **Drag cleanup**: Proper `removeEventListener` in `onCleanup` — no memory leaks
- **Auth fallback**: Removed `VITE_GATEWAY_AUTH` fallback — uses per-profile key from `.env`
- **Close button**: Now properly removes ProfileChat from parent's state via `profile-chat-close` event
- **App.tsx**: Added `profile-chat-close` event listener with cleanup
- **Backend**: `.env` parser now takes last occurrence (fixes duplicate `API_SERVER_PORT` issue)

### Technical Debt
- `profileChatStore.ts` is dead code — wraps deprecated `GatewayClient` (WebSocket). No HTTP Runs API support. Should be deleted or rewritten.
