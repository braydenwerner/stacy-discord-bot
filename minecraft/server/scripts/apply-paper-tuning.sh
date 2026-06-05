#!/bin/bash
# Tune Paper chunk I/O for high view distance (idempotent; safe every start).
set -euo pipefail

PAPER_GLOBAL="${MINECRAFT_DIR:-/opt/minecraft/server}/config/paper-global.yml"

if [[ ! -f "${PAPER_GLOBAL}" ]]; then
  exit 0
fi

cpus="$(nproc)"
workers=$((cpus - 1))
io=$((cpus / 2))
[[ "${workers}" -lt 2 ]] && workers=2
[[ "${io}" -lt 2 ]] && io=2
[[ "${workers}" -gt 8 ]] && workers=8

# -1.0 = unlimited send/load/generate rate in Paper.
sed -i \
  -e 's/^\([[:space:]]*player-max-chunk-send-rate:\).*/\1 -1.0/' \
  -e 's/^\([[:space:]]*player-max-chunk-load-rate:\).*/\1 -1.0/' \
  -e 's/^\([[:space:]]*player-max-chunk-generate-rate:\).*/\1 -1.0/' \
  -e 's/^\([[:space:]]*player-max-concurrent-chunk-loads:\).*/\1 16/' \
  -e 's/^\([[:space:]]*player-max-concurrent-chunk-generates:\).*/\1 8/' \
  -e '/^chunk-system:/,/^[^[:space:]]/ s/^\([[:space:]]*io-threads:\).*/\1 '"${io}"'/' \
  -e '/^chunk-system:/,/^[^[:space:]]/ s/^\([[:space:]]*worker-threads:\).*/\1 '"${workers}"'/' \
  "${PAPER_GLOBAL}"
