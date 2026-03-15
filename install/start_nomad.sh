#!/bin/bash

echo "Finding Project N.O.M.A.D containers..."

# -a to include all containers (running and stopped)
containers=$(docker ps -a --filter "name=^nomad_" --format "{{.Names}}")

if [ -z "$containers" ]; then
    echo "No containers found for Project N.O.M.A.D. Is it installed?"
    exit 0
fi

echo "Found the following containers:"
echo "$containers"
echo ""

for container in $containers; do
    echo "Starting container: $container"

    # Check if any network the container is connected to no longer exists.
    # This happens when the project-nomad compose stack was recreated (compose
    # down + up), which gives the default network a new ID while stopped
    # service containers still reference the old ID.
    stale_network=false
    while IFS= read -r net_id; do
        if ! docker network inspect "$net_id" > /dev/null 2>&1; then
            echo "  ⚠ Container references missing network $net_id — removing stale container so it can be recreated."
            docker rm "$container"
            stale_network=true
            break
        fi
    done < <(docker inspect "$container" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$v.NetworkID}}{{"\n"}}{{end}}' 2>/dev/null)

    if $stale_network; then
        echo "✗ Removed stale $container (reinstall the service through the UI to recreate it)"
        echo ""
        continue
    fi

    if docker start "$container"; then
        echo "✓ Successfully started $container"
    else
        echo "✗ Failed to start $container"
    fi
    echo ""
done

echo "Finished initiating start of all Project N.O.M.A.D containers."
