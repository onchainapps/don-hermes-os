# Changelog

## [Unreleased]

### Fixed
- **Default Profile Path Handling**: Corrected all backend and frontend code to handle the Hermes Agent default profile correctly:
  - Default profile lives in `~/.hermes/` (root), NOT `~/.hermes/profiles/default/`
  - `readProfileEnv()` now handles `name=default` case correctly
  - Profile creation with `template=default` now reads from correct location
  - Port scanning includes default profile when assigning new ports
  - Setup script creates default profile in correct location
  - Frontend displays correct storage paths for default vs named profiles
  - Documentation updated to reflect correct profile structure

### Added
- **Dynamic Gateway Proxy**: New `/gp/*` handler in `handleRequest()` that reads `X-Hermes-Profile` header, looks up the profile's `.env` for `API_SERVER_PORT` and `API_SERVER_KEY`, and proxies requests to the correct profile gateway.
  - `handleGatewayProxy(req, pathname)` — proxies any HTTP method, pipes SSE streaming transparently
  - `readProfileEnv(profileName)` — line-by-line `.env` parser, last occurrence wins
  - Falls back to main gateway (`GATEWAY_HOST:GATEWAY_PORT`) when no profile name or port found
  - Strips routing headers (`X-Hermes-Profile`, `host`) before forwarding, adds `Authorization: Bearer`
  - 502 response with error details if upstream gateway is unreachable
