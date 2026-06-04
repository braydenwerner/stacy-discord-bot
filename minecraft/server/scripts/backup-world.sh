#!/bin/bash
# Tar the Minecraft world and upload to S3 (periodic cron and pre-shutdown).
set -euo pipefail

BACKUP_BUCKET="${1:-}"
AWS_REGION="${2:-us-east-1}"
SERVER_DIR="${MINECRAFT_DIR:-/opt/minecraft/server}"
WORLD_DIR="${SERVER_DIR}/world"

if [[ -z "${BACKUP_BUCKET}" ]]; then
  echo "Usage: backup-world.sh <s3-bucket> [aws-region]" >&2
  exit 1
fi

if [[ ! -d "${WORLD_DIR}" ]]; then
  echo "World directory not found: ${WORLD_DIR}" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="/tmp/minecraft-world-${STAMP}.tar.gz"

tar -czf "${ARCHIVE}" -C "${SERVER_DIR}" world world_nether world_the_end 2>/dev/null \
  || tar -czf "${ARCHIVE}" -C "${SERVER_DIR}" world

aws s3 cp "${ARCHIVE}" "s3://${BACKUP_BUCKET}/worlds/world-${STAMP}.tar.gz" --region "${AWS_REGION}"
rm -f "${ARCHIVE}"
echo "Backed up world to s3://${BACKUP_BUCKET}/worlds/world-${STAMP}.tar.gz"
