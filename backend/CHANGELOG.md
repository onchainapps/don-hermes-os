# Changelog

## [Unreleased]

### Added
- **Dynamic Gateway Proxy**: New `/gp/*` handler in `handleRequest()` that reads `X-Hermes-Profile` header, looks up the profile's `.env` for `API_SERVER_PORT` and `API_SERVER_KEY`, and proxies requests to the correct profile gateway.
  - `handleGatewayProxy(req, pathname)` — proxies any HTTP method, pipes SSE streaming transparently
  - `readProfileEnv(profileName)` — line-by-line `.env` parser, last occurrence wins
  - Falls back to main gateway (`GATEWAY_HOST:GATEWAY_PORT`) when no profile name or port found
  - Strips routing headers (`X-Hermes-Profile`, `host`) before forwarding, adds `Authorization: Bearer`
  - 502 response with error details if upstream gateway is unreachable
