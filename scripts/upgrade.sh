#!/usr/bin/env bash
# scripts/upgrade.sh – don-hermes-os live upgrader
#
# Pipeline: read versions → build both → tgz → npm -g install → PM2 restart → verify
# Usage: ./scripts/upgrade.sh [--bump-patch | --bump-minor | --bump-major]
#
# Bump flags (optional):
#   --bump-patch   v0.1.0 → v0.1.1
#   --bump-minor   v0.1.0 → v0.2.0
#   --bump-major   v0.1.0 → v1.0.0

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PKG="$ROOT/backend"
FRONTEND_PKG="$ROOT/frontend"
BUILD_DIR="/tmp/don-os-build-$$"
TIMESTAMP="$(date +%Y-%m-%dT%H:%M:%S)"

# ─── Colours ───────────────────────────────────────────────────────────────
C_BLUE='\e[36m'; C_GREEN='\e[32m'; C_YELLOW='\e[33m'; C_RED='\e[31m'; C_RESET='\e[0m'
step() { echo -e "${C_BLUE}[STEP]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[OK]${C_RESET}  $*"; }
warn() { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
err()  { echo -e "${C_RED}[FAIL]${C_RESET} $*" >&2; exit 1; }

# ─── 0. Version helpers ────────────────────────────────────────────────────
version_of() { node -e "console.log(JSON.parse(require('fs').readFileSync('$1','utf8')).version)"; }
bump_v() {
  local v="$1"; local part="$2"; local IFS='.'
  read -ra a <<< "$v"
  case "$part" in
    patch) a[2]=$((a[2]+1)) ;;
    minor) a[1]=$((a[1]+1)); a[2]=0 ;;
    major) a[0]=$((a[0]+1)); a[1]=0; a[2]=0 ;;
  esac
  echo "${a[*]}"
}

# ─── 0b. Detect bump & apply ───────────────────────────────────────────────
BUMP_PART="${1:-}"
OLD_MAIN="$(version_of "$ROOT/package.json")"
NEW_MAIN="$OLD_MAIN"

if [[ -n "$BUMP_PART" ]]; then
  NEW_MAIN="$(bump_v "$OLD_MAIN" "$BUMP_PART")"
  for p in "$ROOT/package.json" "$BACKEND_PKG/package.json" "$FRONTEND_PKG/package.json"; do
    node -e "
      const fs=require('fs');
      const p=JSON.parse(fs.readFileSync('$p','utf8'));
      p.version='$NEW_MAIN';
      fs.writeFileSync('$p', JSON.stringify(p,null,2)+'\n');
    "
  done
  ok "Version bumped: v$OLD_MAIN → v$NEW_MAIN"
fi
BACK_VER="$(version_of "$BACKEND_PKG/package.json")"
FRONT_VER="$(version_of "$FRONTEND_PKG/package.json")"

# ─── Banner ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         don-hermes-os upgrade v${OLD_MAIN} → v${NEW_MAIN}         ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  %-54s║\n" "backend   v$BACK_VER  |  frontend   v$FRONT_VER"
printf "║  %-54s║\n" "$TIMESTAMP"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Clean ───────────────────────────────────────────────────────────────
step "Cleaning previous build artifacts…"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
touch "$BUILD_DIR/build.log"
ok "Ready"

# ─── 2. Build backend ───────────────────────────────────────────────────────
step "Building backend (bun build)…"
cd "$BACKEND_PKG"
bun build server.ts --outdir=dist --target=bun >> "$BUILD_DIR/build.log" 2>&1
BE_SIZE="$(du -sh "$BACKEND_PKG/dist/server.js" | cut -f1)"
ok "Don-OS Backend  v${BACK_VER}  →  ${BE_SIZE}"

# ─── 3. Build frontend ──────────────────────────────────────────────────────
step "Building frontend (vite build)…"
cd "$FRONTEND_PKG"
npx vite build >> "$BUILD_DIR/build.log" 2>&1
ok "Don-OS Frontend v${FRONT_VER}  →  $(du -sh "$FRONTEND_PKG/dist" | cut -f1)"

# ─── 4. Pack tgz ────────────────────────────────────────────────────────────
step "Packing…"
BE_TGZ="$(cd "$BACKEND_PKG" && npm pack --silent 2>/dev/null)"
FE_TGZ="$(cd "$FRONTEND_PKG" && npm pack --silent 2>/dev/null)"
cp "$BACKEND_PKG/$BE_TGZ" "$BUILD_DIR/"
cp "$FRONTEND_PKG/$FE_TGZ" "$BUILD_DIR/"
ok "$BE_TGZ  |  $FE_TGZ"

# ─── 5. npm install -g ─────────────────────────────────────────────────────
step "Installing globally…"
npm install -g "$BUILD_DIR/$BE_TGZ" "$BUILD_DIR/$FE_TGZ" 2>&1 | \
  grep -v "^npm notice\|^npm find\|^funding\|added\|audited" || true
ok "Global install done"

# ─── 6. PM2 restart ────────────────────────────────────────────────────────
step "Restarting PM2 services (--update-env)…"
pm2 restart don-os-backend don-os-dashboard --update-env 2>&1 | grep -v "Applying\|scanning" || true
sleep 2
B_PID="$(pm2 pid don-os-backend  2>/dev/null || echo '?')"
D_PID="$(pm2 pid don-os-dashboard 2>/dev/null || echo '?')"
pm2 list 2>/dev/null | grep -E "don-os|─" | grep -v namespace
ok "backend=$B_PID | dashboard=$D_PID"

# ─── 7. Verify ─────────────────────────────────────────────────────────────
step "Verifying production on :3001…"
PORT=3001
ALL_PASS=true

check() {
  local name="$1" code_exp="$2"
  shift 2
  local actual
  actual=$("$@")
  if [[ "$actual" == "$code_exp" ]]; then
    ok "$name → $actual"
  else
    err "$name → $actual (expected $code_exp)"
    ALL_PASS=false
  fi
}

check "GET /health"             "200" curl -sf "http://127.0.0.1:$PORT/health" -o /dev/null -w "%{http_code}"
check "GET /"                   "200" curl -sf "http://127.0.0.1:$PORT/"     -o /dev/null -w "%{http_code}"
check "GP (no Origin) → 202"    "202" curl -sf -X POST "http://127.0.0.1:$PORT/gp/v1/runs" \
  -H "Content-Type: application/json" -d '{"input":"upgrade-test","stream":false}' -o /dev/null -w "%{http_code}"
check "GP (Origin) → 202"       "202" curl -sf -X POST "http://127.0.0.1:$PORT/gp/v1/runs" \
  -H "Content-Type: application/json" \
  -H "Origin: http://192.168.1.141:5173" \
  -d '{"input":"upgrade-test","stream":false}' -o /dev/null -w "%{http_code}"

# profiles
PROFILES_COUNT=$(curl -sf "http://127.0.0.1:$PORT/api/hermes/profiles" 2>/dev/null | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0,'utf8')).profiles.length))")
ok "Profiles active: $PROFILES_COUNT"

# ─── 8．Version bump commit (if any) ────────────────────────────────────────
if [[ "$NEW_MAIN" != "$OLD_MAIN" ]]; then
  step "Committing version bump v$OLD_MAIN → v$NEW_MAIN…"
  cd "$ROOT"
  git add package.json backend/package.json frontend/package.json 2>/dev/null || true
  if git diff --cached --quiet 2>/dev/null; then
    warn "Nothing staged to commit"
  else
    git commit -m "chore: bump version to v${NEW_MAIN}" 2>&1 || warn "Commit failed"
    git push 2>&1 || warn "Push failed"
    ok "Committed"
  fi
fi

# ─── Diff summary ──────────────────────────────────────────────────────────
echo ""
cd "$ROOT"
echo "=== Changed files (last commit) ==="
git log -1 --format="%h %s%n" -- 2>/dev/null || echo "none"

# ─── Footer ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Upgrade done: v${NEW_MAIN}                      ║"
if [[ "$BUMP_PART" == "patch" ]]; then
  echo "║    type:  patch ($OLD_MAIN → $NEW_MAIN)                  ║"
elif [[ -n "$BUMP_PART" ]]; then
  echo "║    type:  $BUMP_PART ($OLD_MAIN → $NEW_MAIN)            ║"
else
  echo "║    build: manual (no version bump)                   ║"
fi
echo "║                                                      ║"
echo "║  scripts:                                             ║"
for s in build:fast deploy upgrade bump:patch bump:minor bump:major; do
  echo "║    npm run $s"
done
echo "║    ./scripts/upgrade.sh       (alias for build)       ║"
echo "║    ./scripts/upgrade.sh --bump-patch/minor/major      ║"
echo "║                                                      ║"
echo "║  rollback (patch):                                   ║"
echo "║    git checkout HEAD~1 -- package.json backend/…\     ║"
echo "║         cd backend && npm install -g don-os-backend-*.tgz\   ║"
echo "║     pm2 restart don-os-backend don-os-dashboard       ║"
echo "╚══════════════════════════════════════════════════════╝"
rm -rf "$BUILD_DIR"
