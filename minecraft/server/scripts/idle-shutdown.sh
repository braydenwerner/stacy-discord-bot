#!/bin/bash
# Check player count via RCON; if empty for IDLE_MINUTES, backup world and shut down EC2.
set -euo pipefail

SERVER_DIR="${MINECRAFT_DIR:-/opt/minecraft/server}"
RCON_HOST="${RCON_HOST:-127.0.0.1}"
RCON_PORT="${RCON_PORT:-25575}"
RCON_PASSWORD_FILE="${RCON_PASSWORD_FILE:-/opt/minecraft/rcon.password}"
IDLE_MINUTES="${IDLE_SHUTDOWN_MINUTES:-30}"
STATE_FILE="/var/lib/minecraft-idle/idle_since"
LOG_FILE="/var/log/minecraft-idle.log"

log() {
  echo "$(date -Is) $*" | tee -a "${LOG_FILE}"
}

mkdir -p "$(dirname "${STATE_FILE}")"

# Paper RCON "list" looks like: "There are 0 of a max of 5 players online."
player_count() {
  local raw
  raw="$(mcrcon -H "${RCON_HOST}" -P "${RCON_PORT}" -p "${RCON_PASS}" "list" 2>/dev/null || true)"
  if [[ -z "${raw}" ]]; then
    return 1
  fi
  echo "${raw}" | sed -n 's/.*There are \([0-9][0-9]*\) of.*/\1/p' | head -1
}

resolve_player_count() {
  if ! systemctl is-active --quiet minecraft 2>/dev/null; then
    log "minecraft.service not active; treating as 0 players."
    echo 0
    return
  fi

  if [[ ! -f "${RCON_PASSWORD_FILE}" ]]; then
    log "RCON password missing while minecraft is running; treating as 0 players."
    echo 0
    return
  fi

  RCON_PASS="$(cat "${RCON_PASSWORD_FILE}")"
  local count
  count="$(player_count || true)"
  if [[ -z "${count}" ]]; then
    log "RCON list failed; treating as 0 players (not using stale latest.log)."
    echo 0
    return
  fi

  echo "${count}"
}

COUNT="$(resolve_player_count)"
COUNT="${COUNT:-0}"

if [[ "${COUNT}" -gt 0 ]]; then
  rm -f "${STATE_FILE}"
  exit 0
fi

NOW="$(date +%s)"
if [[ ! -f "${STATE_FILE}" ]]; then
  echo "${NOW}" > "${STATE_FILE}"
  log "No players online; idle timer started (${IDLE_MINUTES} min threshold)."
  exit 0
fi

IDLE_SINCE="$(cat "${STATE_FILE}")"
ELAPSED=$(( (NOW - IDLE_SINCE) / 60 ))

if [[ "${ELAPSED}" -lt "${IDLE_MINUTES}" ]]; then
  exit 0
fi

log "No players for ${ELAPSED} minutes (threshold ${IDLE_MINUTES}). Shutting down."

# Notify Stacy via S3 event marker (polled by the Discord bot).
if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  IDLE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  printf '{"type":"idle-shutdown","idleMinutes":%s,"elapsedMinutes":%s,"at":"%s"}\n' \
    "${IDLE_MINUTES}" "${ELAPSED}" "${IDLE_STAMP}" \
    | aws s3 cp - "s3://${BACKUP_BUCKET}/events/idle-shutdown-${IDLE_STAMP}.json" \
      --region "${AWS_REGION:-us-east-1}" || true
fi

if [[ -f "${RCON_PASSWORD_FILE}" ]]; then
  RCON_PASS="$(cat "${RCON_PASSWORD_FILE}")"
  mcrcon -H "${RCON_HOST}" -P "${RCON_PORT}" -p "${RCON_PASS}" "stop" 2>/dev/null || true
fi

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
