#!/bin/bash
# Gracefully stop the Minecraft server via RCON.
set -euo pipefail

RCON_PASSWORD_FILE="${RCON_PASSWORD_FILE:-/opt/minecraft/rcon.password}"
if [[ ! -f "${RCON_PASSWORD_FILE}" ]]; then
  exit 0
fi

RCON_PASS="$(cat "${RCON_PASSWORD_FILE}")"
mcrcon -H 127.0.0.1 -P 25575 -p "${RCON_PASS}" "stop" 2>/dev/null || true
