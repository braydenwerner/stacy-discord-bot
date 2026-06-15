#!/usr/bin/env bash
# Start, stop, or check the AWS Minecraft EC2 instance (no Discord bot required).
set -euo pipefail

MC_ROOT="$(cd "$(dirname "$0")" && pwd)"
STACK_NAME="${STACK_NAME:-stacy-mc}"
PARAMS="${MC_ROOT}/cloudformation/parameters.json"
INSTANCE_ENV="${MC_ROOT}/instance.env"

if [[ -f "${INSTANCE_ENV}" ]]; then
  # shellcheck disable=SC1090
  source "${INSTANCE_ENV}"
fi

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|status|health|ssh|logs>

Controls the Minecraft EC2 instance (EC2 start/stop only — no Discord bot).

  ssh   SSH to the instance (requires KeyName on the stack + stacy-mc key)
  logs  Tail Minecraft service + install logs over SSH

Config (first match wins):
  1. minecraft/instance.env  — copy from instance.env.example
  2. Environment variables   — INSTANCE_ID, AWS_REGION, MC_HOST, MC_PORT
  3. CloudFormation stack    — STACK_NAME (needs cloudformation:DescribeStacks)

Environment:
  AWS_REGION    AWS region
  INSTANCE_ID   EC2 instance ID
  MC_HOST       Player connect hostname (ConnectHost in parameters.json)
  MC_PORT       Minecraft port (default 25565)
  STACK_NAME    CloudFormation stack (default: stacy-mc)
  SSH_KEY       Path to private key (default: minecraft/stacy-mc)
  SSH_TARGET    SSH config Host alias (default: stacy-mc)
EOF
}

connect_host() {
  if [[ -n "${MC_HOST:-}" ]]; then
    echo "${MC_HOST}"
    return
  fi
  local host
  host="$(stack_output McHost)"
  if [[ -n "${host}" && "${host}" != "None" ]]; then
    echo "${host}"
    return
  fi
  describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin).get('PublicIpAddress') or '')"
}

ssh_uses_config() {
  local alias="${SSH_TARGET:-stacy-mc}"
  [[ -f "${HOME}/.ssh/config" ]] || return 1
  awk '/^[Hh]ost / { for (i=2; i<=NF; i++) if ($i == "'"${alias}"'") found=1 } END { exit !found }' "${HOME}/.ssh/config"
}

ssh_key() {
  local key="${SSH_KEY:-${MC_ROOT}/stacy-mc}"
  if [[ ! -f "${key}" ]]; then
    echo "SSH key not found: ${key}" >&2
    exit 1
  fi
  echo "${key}"
}

ssh_host() {
  connect_host
}

cmd_ssh() {
  local STATE
  STATE="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin)['State']['Name'])")"
  if [[ "${STATE}" != "running" ]]; then
    echo "Instance is ${STATE}. Start it first: $(basename "$0") start" >&2
    exit 1
  fi
  if ssh_uses_config; then
    exec ssh "${SSH_TARGET:-stacy-mc}" "$@"
  fi
  exec ssh -i "$(ssh_key)" -o StrictHostKeyChecking=accept-new "ec2-user@$(connect_host)" "$@"
}

cmd_logs() {
  cmd_ssh bash -s <<'REMOTE'
set -euo pipefail
echo "=== minecraft.service ==="
sudo systemctl status minecraft --no-pager -l 2>/dev/null || echo "(service not found or not running)"
echo ""
echo "=== journalctl (last 40) ==="
sudo journalctl -u minecraft -n 40 --no-pager 2>/dev/null || true
echo ""
echo "=== user-data install log (last 30) ==="
sudo tail -30 /var/log/minecraft-user-data.log 2>/dev/null || echo "(no user-data log)"
echo ""
echo "=== latest.log (last 20) ==="
sudo tail -20 /opt/minecraft/server/logs/latest.log 2>/dev/null || echo "(no server log yet)"
REMOTE
}

region() {
  if [[ -n "${AWS_REGION:-}" ]]; then
    echo "${AWS_REGION}"
    return
  fi
  if [[ -f "${PARAMS}" ]]; then
    local from_params
    from_params="$(python3 - <<'PY' "${PARAMS}"
import json, sys
for p in json.load(open(sys.argv[1])):
    if p.get("ParameterKey") == "AwsRegion" and p.get("ParameterValue"):
        print(p["ParameterValue"])
        break
PY
)"
    if [[ -n "${from_params}" ]]; then
      echo "${from_params}"
      return
    fi
  fi
  aws configure get region 2>/dev/null || echo "us-east-1"
}

instance_id() {
  if [[ -n "${INSTANCE_ID:-}" ]]; then
    echo "${INSTANCE_ID}"
    return
  fi
  local id
  id="$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "$(region)" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" \
    --output text 2>/dev/null || true)"
  if [[ -z "${id}" || "${id}" == "None" ]]; then
    echo "Set INSTANCE_ID in minecraft/instance.env (see instance.env.example)." >&2
    exit 1
  fi
  echo "${id}"
}

stack_output() {
  local key="$1"
  if [[ "${key}" == "McHost" && -n "${MC_HOST:-}" ]]; then
    echo "${MC_HOST}"
    return
  fi
  if [[ "${key}" == "McPort" && -n "${MC_PORT:-}" ]]; then
    echo "${MC_PORT}"
    return
  fi
  aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "$(region)" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" \
    --output text 2>/dev/null || true
}

describe_instance() {
  aws ec2 describe-instances \
    --region "$(region)" \
    --instance-ids "$(instance_id)" \
    --query "Reservations[0].Instances[0]" \
    --output json
}

cmd_status() {
  local REGION INSTANCE STATE IP HOST PORT
  REGION="$(region)"
  INSTANCE="$(instance_id)"
  STATE="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin)['State']['Name'])")"
  IP="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin).get('PublicIpAddress') or '')")"
  HOST="$(connect_host)"
  if [[ -z "${HOST}" || "${HOST}" == "None" ]]; then
    HOST="${IP}"
  fi
  PORT="$(stack_output McPort)"
  if [[ -z "${PORT}" || "${PORT}" == "None" ]]; then
    PORT="25565"
  fi

  echo "Stack:      ${STACK_NAME}"
  echo "Region:     ${REGION}"
  echo "Instance:   ${INSTANCE}"
  echo "State:      ${STATE}"
  if [[ -n "${HOST}" && "${HOST}" != "None" ]]; then
    echo "Connect:    ${HOST}:${PORT}"
  else
    echo "Connect:    (no public IP yet — wait for running)"
  fi
}

cmd_health() {
  local REGION INSTANCE STATE HOST PORT
  REGION="$(region)"
  INSTANCE="$(instance_id)"
  STATE="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin)['State']['Name'])")"
  HOST="$(connect_host)"
  if [[ -z "${HOST}" || "${HOST}" == "None" ]]; then
    HOST="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin).get('PublicIpAddress') or '')")"
  fi
  PORT="$(stack_output McPort)"
  if [[ -z "${PORT}" || "${PORT}" == "None" ]]; then
    PORT="25565"
  fi

  cmd_status
  echo ""

  if [[ "${STATE}" != "running" ]]; then
    echo "Health: EC2 is not running — start with: $(basename "$0") start"
    return 1
  fi

  if nc -z -w 5 "${HOST}" "${PORT}" 2>/dev/null; then
    echo "Health: OK — port ${PORT} is open (Paper is accepting connections)."
    echo "Join in Minecraft Java Edition: ${HOST}"
    return 0
  fi

  echo "Health: FAIL — EC2 is running but nothing is listening on ${HOST}:${PORT}."
  echo ""
  echo "Common causes:"
  echo "  • First-boot install still running (wait 2–5 min after a new instance)"
  echo "  • user-data / install-server.sh failed (check logs on the instance)"
  echo "  • Same instance restarted without redeploy — user-data does not re-run"
  echo ""
  echo "Logs on the instance (SSH required):"
  echo "  sudo tail -100 /var/log/minecraft-user-data.log"
  echo "  sudo journalctl -u minecraft -n 100 --no-pager"
  echo "  sudo tail -50 /opt/minecraft/server/logs/latest.log"
  return 1
}

cmd_start() {
  local STATE
  STATE="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin)['State']['Name'])")"
  case "${STATE}" in
    running)
      echo "Instance already running."
      cmd_status
      return 0
      ;;
    pending)
      echo "Instance is already starting."
      cmd_status
      return 0
      ;;
  esac

  echo "Starting $(instance_id) in $(region)..."
  aws ec2 start-instances \
    --region "$(region)" \
    --instance-ids "$(instance_id)" \
    --output text >/dev/null

  echo "Start requested. Paper usually takes ~1–2 min after EC2 is running."
  cmd_status
}

cmd_stop() {
  local STATE
  STATE="$(describe_instance | python3 -c "import json,sys; print(json.load(sys.stdin)['State']['Name'])")"
  case "${STATE}" in
    stopped)
      echo "Instance already stopped."
      cmd_status
      return 0
      ;;
    stopping)
      echo "Instance is already stopping."
      cmd_status
      return 0
      ;;
  esac

  echo "Stopping $(instance_id) in $(region)..."
  echo "(World backup runs on the instance before halt.)"
  aws ec2 stop-instances \
    --region "$(region)" \
    --instance-ids "$(instance_id)" \
    --output text >/dev/null

  cmd_status
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

case "$1" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  health) cmd_health ;;
  ssh) shift; cmd_ssh "$@" ;;
  logs) cmd_logs ;;
  -h|--help|help) usage ;;
  *)
    echo "Unknown command: $1" >&2
    usage >&2
    exit 1
    ;;
esac
