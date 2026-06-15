#!/bin/bash
# Check player count via RCON; if empty for IDLE_MINUTES, backup world and shut down EC2.
set -euo pipefail

SERVER_DIR="${MINECRAFT_DIR:-/opt/minecraft/server}"
RCON_HOST="${RCON_HOST:-127.0.0.1}"
RCON_PORT="${RCON_PORT:-25575}"
RCON_PASSWORD_FILE="${RCON_PASSWORD_FILE:-/opt/minecraft/rcon.password}"
IDLE_MINUTES="${IDLE_SHUTDOWN_MINUTES:-30}"
STATE_FILE="/var/lib/minecraft-idle/idle_since"

mkdir -p "$(dirname "${STATE_FILE}")"

if [[ ! -f "${RCON_PASSWORD_FILE}" ]]; then
  echo "RCON password file missing; skipping idle check."
  exit 0
fi

RCON_PASS="$(cat "${RCON_PASSWORD_FILE}")"

player_count() {
  mcrcon -H "${RCON_HOST}" -P "${RCON_PORT}" -p "${RCON_PASS}" "list" 2>/dev/null \
    | sed -n 's/.*: \([0-9][0-9]*\) of.*/\1/p' \
    | head -1
}

COUNT="$(player_count || echo "")"
if [[ -z "${COUNT}" ]]; then
  # Fallback: parse latest.log for "There are N of"
  LOG="${SERVER_DIR}/logs/latest.log"
  if [[ -f "${LOG}" ]]; then
    COUNT="$(grep -E 'There are [0-9]+ of' "${LOG}" | tail -1 | sed -n 's/.*There are \([0-9][0-9]*\) of.*/\1/p')"
  fi
fi

COUNT="${COUNT:-0}"

if [[ "${COUNT}" -gt 0 ]]; then
  rm -f "${STATE_FILE}"
  exit 0
fi

NOW="$(date +%s)"
if [[ ! -f "${STATE_FILE}" ]]; then
  echo "${NOW}" > "${STATE_FILE}"
  exit 0
fi

IDLE_SINCE="$(cat "${STATE_FILE}")"
ELAPSED=$(( (NOW - IDLE_SINCE) / 60 ))

if [[ "${ELAPSED}" -lt "${IDLE_MINUTES}" ]]; then
  exit 0
fi

echo "No players for ${ELAPSED} minutes (threshold ${IDLE_MINUTES}). Shutting down."

# Notify Stacy via S3 event marker (polled by the Discord bot).
if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  IDLE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  printf '{"type":"idle-shutdown","idleMinutes":%s,"elapsedMinutes":%s,"at":"%s"}\n' \
    "${IDLE_MINUTES}" "${ELAPSED}" "${IDLE_STAMP}" \
    | aws s3 cp - "s3://${BACKUP_BUCKET}/events/idle-shutdown-${IDLE_STAMP}.json" \
      --region "${AWS_REGION:-us-east-1}" || true
fi

# Graceful stop via RCON
mcrcon -H "${RCON_HOST}" -P "${RCON_PORT}" -p "${RCON_PASS}" "stop" 2>/dev/null || true

# Wait up to 120s for the Java process to exit
for _ in $(seq 1 24); do
  if ! pgrep -f 'paper.*jar' >/dev/null 2>&1 && ! pgrep -f 'server.jar' >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

# Backup before halt (systemd ExecStopPost also runs backup; this is a safety net)
if [[ -x /opt/minecraft/scripts/backup-world.sh ]]; then
  env BACKUP_SOURCE=idle /opt/minecraft/scripts/backup-world.sh "${BACKUP_BUCKET:-}" "${AWS_REGION:-us-east-1}" || true
fi

sudo shutdown -h now
