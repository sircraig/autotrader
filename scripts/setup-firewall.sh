#!/usr/bin/env bash
set -euo pipefail

# Allow Docker bridge guests to reach host-published reverse proxy ports.
# Defaults are tuned for this host/network, but HOST_IP can be overridden.
HOST_IP="${1:-192.168.20.20}"
LAN_CIDR="${LAN_CIDR:-192.168.1.0/24}"
DOCKER_CIDR="${DOCKER_CIDR:-172.18.0.0/16}"
WEB_PORT="${WEB_PORT:-3000}"
SERVER_PORT="${SERVER_PORT:-3001}"

if ! command -v ufw >/dev/null 2>&1; then
  echo "error: ufw is not installed or not in PATH" >&2
  exit 1
fi

ensure_rule() {
  local source_cidr="$1"
  local port="$2"
  local proto="$3"
  local comment="$4"
  local needle
  local status
  needle="${port}/${proto} on ${HOST_IP} ALLOW IN ${source_cidr}"
  status="$(sudo ufw status numbered | tr -s ' ')"

  if printf '%s\n' "${status}" | grep -Fq "${needle}"; then
    echo "rule exists: ${source_cidr} -> ${HOST_IP}:${port}/${proto}"
    return 0
  fi

  sudo ufw allow proto "${proto}" from "${source_cidr}" to "${HOST_IP}" port "${port}" comment "${comment}"
}

for source_cidr in "${LAN_CIDR}" "${DOCKER_CIDR}"; do
  ensure_rule "${source_cidr}" "${WEB_PORT}" tcp "btc-tui2 frontend"
  ensure_rule "${source_cidr}" "${SERVER_PORT}" tcp "btc-tui2 backend"
done

sudo ufw reload
sudo ufw status numbered
