#!/usr/bin/env bash
# Push idle-shutdown.sh to the running Minecraft EC2 host via SSM (bot credentials OK).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${MINECRAFT_BOT_ENV:-$ROOT/minecraft/bot.env}"
INSTANCE_ENV="${MINECRAFT_INSTANCE_ENV:-$ROOT/minecraft/instance.env}"
SCRIPT="${ROOT}/minecraft/server/scripts/idle-shutdown.sh"

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

STATE="$(aws ec2 describe-instances \
  --instance-ids "${INSTANCE_ID}" \
  --region "${REGION}" \
  --query 'Reservations[0].Instances[0].State.Name' \
  --output text)"

if [[ "${STATE}" != "running" ]]; then
  echo "Instance ${INSTANCE_ID} is ${STATE}; start it first or patch after next boot." >&2
  exit 1
fi

B64="$(base64 -w0 "${SCRIPT}")"
# SSM parameters must be JSON; keep base64 on one line.
PARAMS="{\"commands\":[\"echo ${B64} | base64 -d > /opt/minecraft/scripts/idle-shutdown.sh\",\"chmod +x /opt/minecraft/scripts/idle-shutdown.sh\",\"grep -F 'There are' /opt/minecraft/scripts/idle-shutdown.sh | head -1\"]}"

CMD_ID="$(aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters "${PARAMS}" \
  --region "${REGION}" \
  --query Command.CommandId \
  --output text)"

echo "SSM command ${CMD_ID} — waiting..."
for _ in $(seq 1 30); do
  STATUS="$(aws ssm get-command-invocation \
    --command-id "${CMD_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --region "${REGION}" \
    --query Status \
    --output text 2>/dev/null || echo Pending)"
  if [[ "${STATUS}" == "Success" ]]; then
    aws ssm get-command-invocation \
      --command-id "${CMD_ID}" \
      --instance-id "${INSTANCE_ID}" \
      --region "${REGION}" \
      --query StandardOutputContent \
      --output text
    echo "OK — idle-shutdown.sh updated on ${INSTANCE_ID}."
    exit 0
  fi
  if [[ "${STATUS}" == "Failed" || "${STATUS}" == "Cancelled" || "${STATUS}" == "TimedOut" ]]; then
    aws ssm get-command-invocation \
      --command-id "${CMD_ID}" \
      --instance-id "${INSTANCE_ID}" \
      --region "${REGION}" \
      --query '{Status:Status,Out:StandardOutputContent,Err:StandardErrorContent}' \
      --output json >&2
    exit 1
  fi
  sleep 2
done

echo "Timed out waiting for SSM." >&2
exit 1
