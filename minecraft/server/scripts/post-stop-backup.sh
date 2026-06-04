#!/bin/bash
# Post-stop S3 backup hook for systemd.
set -euo pipefail

source /etc/sysconfig/minecraft-idle 2>/dev/null || true

if [[ -n "${BACKUP_BUCKET:-}" ]] && [[ -x /opt/minecraft/scripts/backup-world.sh ]]; then
  /opt/minecraft/scripts/backup-world.sh "${BACKUP_BUCKET}" "${AWS_REGION:-us-east-1}" || true
fi
