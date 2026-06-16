#!/usr/bin/env bash
# Update stacy-mc-bot inline IAM policy (ec2-and-s3-read). Requires admin credentials.
# Fixes StartInstances/StopInstances when the EC2 instance ID changed but the bot user
# policy still pointed at the old instance.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${MINECRAFT_BOT_ENV:-$ROOT/minecraft/bot.env}"
INSTANCE_ENV="${MINECRAFT_INSTANCE_ENV:-$ROOT/minecraft/instance.env}"

# bot.env holds the bot user's keys — never use them for iam:PutUserPolicy.
load_env_file() {
  local source="$1"
  [[ -f "$source" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "${line//[[:space:]]/}" || "$line" =~ ^# ]] && continue
    local key="${line%%=*}"
    case "$key" in
      AWS_ACCESS_KEY_ID | AWS_SECRET_ACCESS_KEY | AWS_SESSION_TOKEN) continue ;;
    esac
    export "${key}=${line#*=}"
  done < "$source"
}

if [[ -z "${AWS_PROFILE:-}" ]]; then
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
fi

load_env_file "$ENV_FILE"
load_env_file "$INSTANCE_ENV"

PROJECT_NAME="${PROJECT_NAME:-stacy-mc}"
BOT_USER="${BOT_IAM_USER:-${PROJECT_NAME}-bot}"
REGION="${AWS_REGION:-us-west-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
BUCKET="${MINECRAFT_BACKUP_BUCKET:-${PROJECT_NAME}-data-backups-${REGION}-${ACCOUNT_ID}}"

CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
if [[ "$CALLER_ARN" == *":user/${BOT_USER}" ]]; then
  echo "Error: current AWS credentials are for ${BOT_USER}, which cannot update its own IAM policy." >&2
  echo "Run with admin credentials, e.g.:" >&2
  echo "  AWS_PROFILE=your-admin-profile pnpm run minecraft:update-bot-iam" >&2
  echo "Or unset AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY so the default admin profile is used." >&2
  exit 1
fi

POLICY_DOC="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ec2:StartInstances", "ec2:StopInstances"],
      "Resource": "arn:aws:ec2:${REGION}:${ACCOUNT_ID}:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Project": "${PROJECT_NAME}"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:DescribeVolumes"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:GetMetricData"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:SendCommand"],
      "Resource": "arn:aws:ec2:${REGION}:${ACCOUNT_ID}:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Project": "${PROJECT_NAME}"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:SendCommand"],
      "Resource": "arn:aws:ssm:${REGION}::document/AWS-RunShellScript"
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::${BUCKET}"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::${BUCKET}/*"
    },
    {
      "Effect": "Allow",
      "Action": ["ce:GetCostAndUsage", "ce:GetCostForecast"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["budgets:ViewBudget"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity"],
      "Resource": "*"
    }
  ]
}
EOF
)"

echo "Updating IAM user ${BOT_USER} policy ec2-and-s3-read (region=${REGION}, project=${PROJECT_NAME})..."

aws iam put-user-policy \
  --user-name "${BOT_USER}" \
  --policy-name ec2-and-s3-read \
  --policy-document "${POLICY_DOC}"

echo "Done. Bot can start/stop any EC2 instance tagged Project=${PROJECT_NAME}."
