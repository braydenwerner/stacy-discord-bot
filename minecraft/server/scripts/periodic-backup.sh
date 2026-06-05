#!/bin/bash
# Periodic S3 backup while the server is running (cron). Flushes world data first.
set -euo pipefail

source /etc/sysconfig/minecraft-idle 2>/dev/null || true

if [[ -z "${BACKUP_BUCKET:-}" ]]; then
  echo "BACKUP_BUCKET not configured; skipping periodic backup." >&2
  exit 0
fi

if ! systemctl is-active --quiet minecraft; then
  echo "Minecraft service not running; skipping periodic backup."
  exit 0
fi

RCON_PASSWORD_FILE="${RCON_PASSWORD_FILE:-/opt/minecraft/rcon.password}"
if [[ -f "${RCON_PASSWORD_FILE}" ]]; then
  RCON_PASS="$(cat "${RCON_PASSWORD_FILE}")"
  mcrcon -H 127.0.0.1 -P 25575 -p "${RCON_PASS}" "save-all flush" 2>/dev/null || true
  sleep 5
fi

exec env BACKUP_SOURCE=periodic /opt/minecraft/scripts/backup-world.sh "${BACKUP_BUCKET}" "${AWS_REGION:-us-east-1}"
