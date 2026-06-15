#!/usr/bin/env bash
# Create the Stacy AWS cost budget. Requires admin/root credentials (not stacy-mc-bot).
set -euo pipefail

ACCOUNT_ID="${AWS_ACCOUNT_ID:-842962535048}"
BUDGET_NAME="${AWS_BUDGET_NAME:-stacy-mc-credits}"
LIMIT="${AWS_BUDGET_LIMIT_USD:-1000}"

BUDGET_JSON="$(cat <<EOF
{
  "BudgetName": "${BUDGET_NAME}",
  "BudgetLimit": { "Amount": "${LIMIT}", "Unit": "USD" },
  "BudgetType": "COST",
  "TimeUnit": "ANNUALLY",
  "CostTypes": {
    "IncludeCredit": true,
    "IncludeRefund": true,
    "IncludeTax": true,
    "IncludeSubscription": true,
    "UseBlended": false
  }
}
EOF
)"

echo "Creating budget ${BUDGET_NAME} (\$${LIMIT}/year) on account ${ACCOUNT_ID}..."

if aws budgets describe-budget \
  --account-id "${ACCOUNT_ID}" \
  --budget-name "${BUDGET_NAME}" \
  --region us-east-1 >/dev/null 2>&1; then
  echo "Budget exists — updating limit to \$${LIMIT}..."
  aws budgets update-budget \
    --account-id "${ACCOUNT_ID}" \
    --new-budget "${BUDGET_JSON}" \
    --region us-east-1
else
  aws budgets create-budget \
    --account-id "${ACCOUNT_ID}" \
    --budget "${BUDGET_JSON}" \
    --region us-east-1
fi

echo "Done. Set on the Pi in minecraft/bot.env:"
echo "  AWS_BUDGET_NAME=${BUDGET_NAME}"
echo "  AWS_PROMO_CREDIT_USD=${LIMIT}"
echo "  AWS_ACCOUNT_ID=${ACCOUNT_ID}"
