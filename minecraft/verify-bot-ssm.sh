#!/usr/bin/env bash
# Test whether stacy-mc-bot can run SSM on the Minecraft instance (uses bot.env keys).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${MINECRAFT_BOT_ENV:-$ROOT/minecraft/bot.env}"
INSTANCE_ENV="${MINECRAFT_INSTANCE_ENV:-$ROOT/minecraft/instance.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
# shellcheck disable=SC1090
[[ -f "${INSTANCE_ENV}" ]] && source "${INSTANCE_ENV}"
set +a

REGION="${AWS_REGION:-us-west-1}"
INSTANCE_ID="${MINECRAFT_INSTANCE_ID:-${INSTANCE_ID:-}}"

if [[ -z "${INSTANCE_ID}" ]]; then
  echo "MINECRAFT_INSTANCE_ID is not set." >&2
  exit 1
fi

echo "Caller:"
aws sts get-caller-identity --region "${REGION}"
echo ""
echo "Instance:"
aws ec2 describe-instances \
  --instance-ids "${INSTANCE_ID}" \
  --region "${REGION}" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Project:Tags[?Key==`Project`].Value|[0]}' \
  --output table
echo ""
echo "SSM SendCommand test:"
if aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["echo ssm-ok"]' \
  --region "${REGION}" \
  --output json; then
  echo ""
  echo "OK — bot IAM allows ssm:SendCommand."
else
  echo ""
  echo "FAILED — bot IAM still missing SSM (or instance SSM agent offline)." >&2
  echo "Re-run with admin credentials (not bot keys):" >&2
  echo "  AWS_PROFILE=admin pnpm run minecraft:update-bot-iam" >&2
  echo "Then run: pnpm run minecraft:verify-ssm" >&2
  exit 1
fi
