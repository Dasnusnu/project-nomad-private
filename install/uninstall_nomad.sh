#!/bin/bash

# Project N.O.M.A.D. Uninstall Script

###################################################################################################################################################################################################

# Script                | Project N.O.M.A.D. Uninstall Script
# Version               | 2.0.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                  Constants & Variables                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[1;32m'
RESET='\033[0m'

NOMAD_DIR="/opt/project-nomad"
MANAGEMENT_COMPOSE_FILE="${NOMAD_DIR}/compose.yml"
COLLECT_DISK_INFO_PID="${NOMAD_DIR}/nomad-collect-disk-info.pid"
DISK_INFO_FILE="/tmp/nomad-disk-info.json"

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                     Functions                                                                                                   #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

check_has_sudo() {
  if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}✓${RESET} Running with sudo permissions."
  else
    echo -e "${RED}✗${RESET} This script requires sudo. Please run: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_current_directory() {
  if [ "$(pwd)" == "${NOMAD_DIR}" ]; then
    echo -e "${RED}✗${RESET} Please run this script from a directory other than ${NOMAD_DIR}."
    exit 1
  fi
}

ensure_docker_installed() {
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗${RESET} Docker not found. Cannot remove containers."
    exit 1
  fi
}

check_docker_compose() {
  # Check if 'docker compose' (v2 plugin) is available
  if ! docker compose version &>/dev/null; then
    echo -e "${RED}#${RESET} Docker Compose v2 is not installed or not available as a Docker plugin."
    echo -e "${YELLOW}#${RESET} This script requires 'docker compose' (v2), not 'docker-compose' (v1)."
    echo -e "${YELLOW}#${RESET} Please read the Docker documentation at https://docs.docker.com/compose/install/ for instructions on how to install Docker Compose v2."
    exit 1
  fi
}

get_uninstall_confirmation() {
  echo ""
  echo -e "${RED}WARNING:${RESET} This will permanently remove all Project N.O.M.A.D. containers,"
  echo "         networks, volumes, and service data. This cannot be undone."
  echo ""
  read -rp "Type 'yes' to confirm: " choice
  if [ "$choice" != "yes" ]; then
    echo "Uninstall cancelled."
    exit 0
  fi
  echo ""
}

stop_management_containers() {
  if [ -f "${MANAGEMENT_COMPOSE_FILE}" ]; then
    echo -e "${YELLOW}→${RESET} Stopping management containers..."
    docker compose -p project-nomad -f "${MANAGEMENT_COMPOSE_FILE}" down 2>/dev/null
    echo -e "${GREEN}✓${RESET} Management containers stopped."
  else
    echo -e "${YELLOW}!${RESET} Management compose file not found — skipping compose down."
  fi
}

remove_service_containers() {
  echo -e "${YELLOW}→${RESET} Removing service containers (nomad_*)..."
  local containers
  containers=$(docker ps -a --filter "name=^nomad_" --format "{{.Names}}" 2>/dev/null)
  if [ -n "$containers" ]; then
    echo "$containers" | xargs docker rm -f
    echo -e "${GREEN}✓${RESET} Service containers removed."
  else
    echo "  No service containers found."
  fi
}

remove_networks() {
  echo -e "${YELLOW}→${RESET} Removing project-nomad networks..."
  local removed=false
  while IFS= read -r net; do
    docker network rm "$net" 2>/dev/null && echo "  Removed network: $net" && removed=true
  done < <(docker network ls --filter "name=project-nomad" --format "{{.Name}}")
  $removed || echo "  No project-nomad networks found."
  echo -e "${GREEN}✓${RESET} Networks cleaned up."
}

remove_volumes() {
  echo -e "${YELLOW}→${RESET} Removing project-nomad volumes..."
  local removed=false
  while IFS= read -r vol; do
    docker volume rm "$vol" 2>/dev/null && echo "  Removed volume: $vol" && removed=true
  done < <(docker volume ls --filter "name=project-nomad" --format "{{.Name}}")
  $removed || echo "  No project-nomad volumes found."
  echo -e "${GREEN}✓${RESET} Volumes cleaned up."
}

stop_disk_info_collector() {
  if [ -f "$COLLECT_DISK_INFO_PID" ]; then
    local pid
    pid=$(cat "$COLLECT_DISK_INFO_PID")
    echo -e "${YELLOW}→${RESET} Stopping disk info collector (PID $pid)..."
    kill "$pid" 2>/dev/null && echo -e "${GREEN}✓${RESET} Collector stopped." || echo "  Process already stopped."
    rm -f "$COLLECT_DISK_INFO_PID"
  fi
  rm -f "$DISK_INFO_FILE"
}

storage_cleanup() {
  echo ""
  read -rp "Delete the Project N.O.M.A.D. data directory (${NOMAD_DIR})? This removes all stored data and cannot be undone. (y/N): " choice
  case "$choice" in
    y|Y)
      echo -e "${YELLOW}→${RESET} Removing ${NOMAD_DIR}..."
      if rm -rf "${NOMAD_DIR}"; then
        echo -e "${GREEN}✓${RESET} ${NOMAD_DIR} removed."
      else
        echo -e "${RED}✗${RESET} Failed to remove ${NOMAD_DIR}. You may need to remove it manually."
      fi
      ;;
    *)
      echo "  Skipping — ${NOMAD_DIR} left in place."
      ;;
  esac
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                       Main                                                                                                      #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

check_has_sudo
check_current_directory
ensure_docker_installed
check_docker_compose
get_uninstall_confirmation

stop_disk_info_collector
stop_management_containers
remove_service_containers
remove_networks
remove_volumes
storage_cleanup

echo ""
echo -e "${GREEN}✓ Project N.O.M.A.D. has been uninstalled. We hope to see you again soon!${RESET}"
