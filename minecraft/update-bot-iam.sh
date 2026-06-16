#!/usr/bin/env bash
# Update stacy-mc-bot inline IAM policy (ec2-and-s3-read). Requires admin credentials.
# Fixes StartInstances/StopInstances when the EC2 instance ID changed but the bot user
# policy still pointed at the old instance.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${MINECRAFT_BOT_ENV:-$ROOT/minecraft/bot.env}"
INSTANCE_ENV="${MINECRAFT_INSTANCE_ENV:-$ROOT/minecraft/instance.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi
if [[ -f "$INSTANCE_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$INSTANCE_ENV" && set +a
fi

PROJECT_NAME="${PROJECT_NAME:-stacy-mc}"
BOT_USER="${BOT_IAM_USER:-${PROJECT_NAME}-bot}"
REGION="${AWS_REGION:-us-west-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
BUCKET="${MINECRAFT_BACKUP_BUCKET:-${PROJECT_NAME}-data-backups-${REGION}-${ACCOUNT_ID}}"

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
      "Resource": [
        "arn:aws:ec2:${REGION}:${ACCOUNT_ID}:instance/*",
        "arn:aws:ssm:${REGION}::document/AWS-RunShellScript"
      ],
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Project": "${PROJECT_NAME}"
        }
      }
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
