#!/bin/bash
# Tar the Minecraft world, upload to S3, and prune to a rolling window of recent backups.
set -euo pipefail

source /etc/sysconfig/minecraft-idle 2>/dev/null || true

BACKUP_BUCKET="${1:-}"
AWS_REGION="${2:-us-east-1}"
SERVER_DIR="${MINECRAFT_DIR:-/opt/minecraft/server}"
WORLD_DIR="${SERVER_DIR}/world"
KEEP_COUNT="${BACKUP_KEEP_COUNT:-30}"
ARCHIVE_PREFIX="archives/data-"

if [[ -z "${BACKUP_BUCKET}" ]]; then
  echo "Usage: backup-world.sh <s3-bucket> [aws-region]" >&2
  exit 1
fi

if [[ ! -d "${WORLD_DIR}" ]]; then
  echo "World directory not found: ${WORLD_DIR}" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="/tmp/mc-data-${STAMP}.tar.gz"
S3_KEY="${ARCHIVE_PREFIX}${STAMP}.tar.gz"

tar -czf "${ARCHIVE}" -C "${SERVER_DIR}" world world_nether world_the_end 2>/dev/null \
  || tar -czf "${ARCHIVE}" -C "${SERVER_DIR}" world

aws s3 cp "${ARCHIVE}" "s3://${BACKUP_BUCKET}/${S3_KEY}" --region "${AWS_REGION}"
rm -f "${ARCHIVE}"
echo "Backed up data to s3://${BACKUP_BUCKET}/${S3_KEY}"

prune_old_backups() {
  local keys_json to_delete key
  keys_json="$(aws s3api list-objects-v2 \
    --bucket "${BACKUP_BUCKET}" \
    --prefix "${ARCHIVE_PREFIX}" \
    --region "${AWS_REGION}" \
    --output json)"

  to_delete="$(echo "${keys_json}" | jq -r --argjson keep "${KEEP_COUNT}" '
    (.Contents // []) | sort_by(.Key)
    | if length > $keep then .[0:(length - $keep)] | .[].Key else empty end
  ')"

  if [[ -z "${to_delete}" ]]; then
    return 0
  fi

  while IFS= read -r key; do
    [[ -z "${key}" ]] && continue
    aws s3 rm "s3://${BACKUP_BUCKET}/${key}" --region "${AWS_REGION}"
    echo "Pruned old backup: s3://${BACKUP_BUCKET}/${key}"
  done <<< "${to_delete}"
}

prune_old_backups
