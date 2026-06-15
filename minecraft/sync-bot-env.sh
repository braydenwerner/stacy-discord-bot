#!/usr/bin/env bash
# Merge minecraft/bot.env (and instance.env mappings) into the project .env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"
BOT_ENV="${ROOT}/minecraft/bot.env"
INSTANCE_ENV="${ROOT}/minecraft/instance.env"

merge_env_file() {
  local source="$1"
  [[ -f "${source}" ]] || return 0

  touch "${ENV_FILE}"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line//[[:space:]]/}" || "${line}" =~ ^# ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
    else
      printf '\n%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
    fi
  done < "${source}"
}

if [[ ! -f "${BOT_ENV}" ]]; then
  echo "Missing ${BOT_ENV}" >&2
  echo "Copy minecraft/bot.env.example to bot.env and fill in AWS keys from CloudFormation." >&2
  echo "Or run: pnpm run minecraft:fetch-env" >&2
  exit 1
fi

merge_env_file "${BOT_ENV}"

if [[ -f "${INSTANCE_ENV}" ]]; then
  # shellcheck disable=SC1090
  source "${INSTANCE_ENV}"
  tmp="$(mktemp)"
  {
    echo "AWS_REGION=${AWS_REGION:-}"
    echo "MINECRAFT_INSTANCE_ID=${INSTANCE_ID:-}"
    echo "MINECRAFT_SERVER_HOST=${MC_HOST:-}"
    echo "MINECRAFT_PORT=${MC_PORT:-25565}"
  } > "${tmp}"
  merge_env_file "${tmp}"
  rm -f "${tmp}"
fi

echo "Merged Minecraft config into ${ENV_FILE}"
