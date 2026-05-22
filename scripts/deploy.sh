#!/usr/bin/env bash
# scripts/deploy.sh – Production deploy (build → tgz → install → PM2 restart → verify)
#
# Uses the EXISTING .tgz files (no build, no version bump).
# Pipeline: pack → npm install -g → PM2 restart → verify
# Usage: ./scripts/deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PKG="$ROOT/backend"
FRONTEND_PKG="$ROOT/frontend"
PORT=3001
TIMESTAMP="$(date +%Y-%m-%dT%H:%M:%S)"

C_BLUE='\e[36m'; C_GREEN='\e[32m'; C_YELLOW='\e[33m'; C_RED='\e[31m'; C_RESET='\e[0m'
step() { echo -e "${C_BLUE}[STEP]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[OK]${C_RESET}  $*"; }
warn() { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
err()  { echo -e "${C_RED}[FAIL]${C_RESET} $*" >&2; exit 1; }

step "Starting deploy — $TIMESTAMP"

# ─── 1. Build & pack ────────────────────────────────────────────────────────
step "Building + packing…"
cd "$BACKEND_PKG"
bun build server.ts --outdir=dist --target=bun > /dev/null 2>&1
BE_TGZ="$(npm pack --silent 2>/dev/null)"
cp "$BE_TGZ" "$ROOT/"

cd "$FRONTEND_PKG"
npx vite build > /dev/null 2>&1
FE_TGZ="$(npm pack --silent 2>/dev/null)"
cp "$FE_TGZ" "$ROOT/"

ok "Built: $BE_TGZ | $FE_TGZ"
cd "$ROOT"

# ─── 2. npm install -g ──────────────────────────────────────────────────────
step "Installing globally…"
npm install -g "$BE_TGZ" "$FE_TGZ" 2>&1 | \
  grep -v "^npm notice\|^npm find\|^funding\|added\|audited\|^npm warn" 2>/dev/null || true
rm -f "$BE_TGZ" "$FE_TGZ"
ok "Installed"

# ─── 3. PM2 restart ────────────────────────────────────────────────────────
step "Restarting PM2 (--update-env)…"
pm2 restart don-os-backend don-os-dashboard --update-env 2>&1 | grep -Evi "Applying|scanning|^[[:space:]]*([│├└─]|PM2)" || true
sleep 3

B_PID="$(cat ~/.pm2/pids/don-os-backend-*.pid 2>/dev/null | head -1 || echo '?')"
D_PID="$(cat ~/.pm2/pids/don-os-dashboard-*.pid 2>/dev/null | head -1 || echo '?')"
ok "backend=$B_PID | dashboard=$D_PID"

# ─── 4. Verify ─────────────────────────────────────────────────────────────
step "Verifying production :3001…"
check() {
  local name="$1"; shift
  local expected="$1"; shift
  local code="$("$@")"
  if [[ "$code" == "$expected" ]]; then
    ok "$name → $code"
  else
    err "$name → $code (expected $expected)"
  fi
}

check "GET /health"  "200" curl -sf "http://127.0.0.1:$PORT/health" -o /dev/null -w "%{http_code}"
check "GET /"        "200" curl -sf "http://127.0.0.1:$PORT/" -o /dev/null -w "%{http_code}"
check "GP no Origin" "202" curl -sf -X POST "http://127.0.0.1:$PORT/gp/v1/runs" \
  -H "Content-Type: application/json" -d '{"input":"upgrade-test","stream":false}' \
  -o /dev/null -w "%{http_code}"
check "GP + Origin"  "202" curl -sf -X POST "http://127.0.0.1:$PORT/gp/v1/runs" \
  -H "Content-Type: application/json" \
  -H "Origin: http://192.168.1.141:5173" \
  -d '{"input":"upgrade-test","stream":false}' \
  -o /dev/null -w "%{http_code}"

NPROF=$(curl -sf "http://127.0.0.1:$PORT/api/hermes/profiles" 2>/dev/null \
  | node -e "try{console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).profiles.length)}catch(e){console.log('?')}")
ok "Active profiles: $NPROF"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║            Deploy completed ($TIMESTAMP)             ║"
echo "║  backend=$B_PID  dashboard=$D_PID                     ║"
echo "╚══════════════════════════════════════════════════════╝"
