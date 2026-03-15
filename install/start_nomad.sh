#!/bin/bash

NOMAD_DIR="/opt/project-nomad"
MANAGEMENT_COMPOSE_FILE="${NOMAD_DIR}/compose.yml"

# Management containers are owned by the compose stack and must be
# started/recreated via compose, not via docker start.
MANAGEMENT_CONTAINERS=("nomad_admin" "nomad_mysql" "nomad_redis" "nomad_dozzle" "nomad_updater")

is_management_container() {
    local name="$1"
    for mc in "${MANAGEMENT_CONTAINERS[@]}"; do
        [[ "$mc" == "$name" ]] && return 0
    done
    return 1
}

has_stale_network() {
    local container="$1"
    while IFS= read -r net_id; do
        [[ -z "$net_id" ]] && continue
        if ! docker network inspect "$net_id" > /dev/null 2>&1; then
            return 0
        fi
    done < <(docker inspect "$container" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$v.NetworkID}}{{"\n"}}{{end}}' 2>/dev/null)
    return 1
}

# ── Step 1: bring up the management stack via compose ─────────────────────────
# compose up -d handles network (re)creation automatically, so management
# containers always come up cleanly regardless of stale network state.
if [[ -f "$MANAGEMENT_COMPOSE_FILE" ]]; then
    echo "Starting management containers via compose..."
    if docker compose -p project-nomad -f "$MANAGEMENT_COMPOSE_FILE" up -d; then
        echo "✓ Management containers started."
    else
        echo "✗ Failed to start management containers."
    fi
else
    echo "⚠ Management compose file not found at $MANAGEMENT_COMPOSE_FILE — skipping."
fi

echo ""

# ── Step 2: start remaining service containers (e.g. nomad_ollama) ────────────
service_containers=$(docker ps -a --filter "name=^nomad_" --format "{{.Names}}")

started_any=false
for container in $service_containers; do
    is_management_container "$container" && continue

    started_any=true
    echo "Starting service container: $container"

    if has_stale_network "$container"; then
        echo "  ⚠ Stale network reference detected — removing so it can be reinstalled."
        docker rm "$container"
        echo "✗ Removed stale $container (reinstall the service through the UI to recreate it)"
    elif docker start "$container"; then
        echo "✓ Successfully started $container"
    else
        echo "✗ Failed to start $container"
    fi
    echo ""
done

if ! $started_any; then
    echo "No additional service containers found."
fi

echo "Finished starting Project N.O.M.A.D containers."
