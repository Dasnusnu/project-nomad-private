#!/usr/bin/env bash
# =============================================================================
# dev-update.sh — Build from source and hot-swap the admin container.
#
# Use this to test local code changes without a full reinstall or image push.
# MySQL, Redis, Dozzle, and the updater sidecar are left running; only the
# admin container is replaced.
#
# Usage:
#   bash install/dev-update.sh
#   NOMAD_COMPOSE_FILE=/path/to/compose.yml bash install/dev-update.sh
#
# =============================================================================
# WHAT REQUIRES A REBUILD?
#
# YES — rebuild required (changes compiled into the image at build time):
#   admin/**/*.ts       Backend TypeScript (controllers, services, routes, etc.)
#   admin/**/*.tsx      Frontend React components (bundled by Vite)
#   admin/**/*.css      Stylesheets (processed by Tailwind/Vite)
#   admin/docs/**       Docs files (copied into image separately)
#   admin/package.json  Dependency changes (run npm ci during build)
#
# NO — no rebuild needed (sourced or fetched at runtime):
#   install/entrypoint.sh   Mounted from /opt/project-nomad/ at runtime
#   install/wait-for-it.sh  Same
#   collections/*.json      Fetched from GitHub at runtime and cached in DB
#   BACKLOG.md / README.md  Not used at runtime
#
# =============================================================================

set -euo pipefail

RESET='\033[0m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
CYAN='\033[0;36m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${NOMAD_COMPOSE_FILE:-/opt/project-nomad/compose.yml}"
OVERRIDE_FILE="$REPO_ROOT/install/dev-compose-override.yaml"
DEV_IMAGE="project-nomad:dev"
PROJECT_NAME="project-nomad"

info() { echo -e "${GREEN}  ✓${RESET}  $*"; }
warn() { echo -e "${YELLOW}  !${RESET}  $*"; }
step() { echo -e "${CYAN}  →${RESET}  $*"; }
die()  { echo -e "${RED}  ✗${RESET}  $*" >&2; exit 1; }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${CYAN}  Project N.O.M.A.D. — Dev Update${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

[[ -f "$REPO_ROOT/Dockerfile" ]] \
  || die "Run this script from the project repo root. Dockerfile not found at: $REPO_ROOT"

[[ -f "$COMPOSE_FILE" ]] \
  || die "Compose file not found at: $COMPOSE_FILE\n     Set NOMAD_COMPOSE_FILE env var if your install is in a non-standard location."

[[ -f "$OVERRIDE_FILE" ]] \
  || die "Dev compose override not found at: $OVERRIDE_FILE"

command -v docker &>/dev/null \
  || die "Docker is not installed."

docker info &>/dev/null 2>&1 \
  || die "Docker daemon is not running. Start it and try again."

info "Repo root:    $REPO_ROOT"
info "Compose file: $COMPOSE_FILE"
info "Dev image:    $DEV_IMAGE"
echo ""

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

step "Building image from source..."
BUILD_START=$(date +%s)

docker build -t "$DEV_IMAGE" "$REPO_ROOT"

BUILD_END=$(date +%s)
info "Build complete in $((BUILD_END - BUILD_START))s."
echo ""

# ---------------------------------------------------------------------------
# Hot-swap just the admin container (leaves DB/Redis/etc. untouched)
# ---------------------------------------------------------------------------

step "Recreating admin container with local build..."

docker compose \
  -p "$PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  -f "$OVERRIDE_FILE" \
  up -d admin \
  --force-recreate \
  --no-deps

echo ""
info "Admin container replaced. Waiting for startup..."
echo ""

# Give the entrypoint a moment to run migrations + seeding before tailing
sleep 3

# ---------------------------------------------------------------------------
# Tail startup logs (Ctrl-C to stop following — container keeps running)
# ---------------------------------------------------------------------------

echo -e "${CYAN}  ── Startup logs (Ctrl-C to stop tailing) ──────────────────────${RESET}"
echo ""
docker logs -f nomad_admin --tail 50 2>/dev/null || true

echo ""
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
info "Dev build running at http://localhost:8080  |  http://${LOCAL_IP}:8080"
info "To follow logs: docker logs -f nomad_admin"
echo ""
