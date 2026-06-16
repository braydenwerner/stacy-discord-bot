/** Cost Explorer and Budgets APIs are served from us-east-1. */
export const AWS_BILLING_REGION = "us-east-1";

export function getAwsCredentialError(): string | null {
  if (!process.env.AWS_REGION) {
    return "AWS_REGION is not set (add it to minecraft/bot.env or .env).";
  }
  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  ) {
    return (
      "AWS credentials are missing. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY " +
      "to minecraft/bot.env, then run pnpm run minecraft:sync-env."
    );
  }
  return null;
}

export function isAwsConfigured(): boolean {
  return getAwsCredentialError() === null;
}

export function monthlyBudgetUsd(): number | null {
  const raw = process.env.AWS_MONTHLY_BUDGET_USD?.trim();
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function awsBudgetName(): string | null {
  const name = process.env.AWS_BUDGET_NAME?.trim();
  return name || null;
}

/** Optional manual promo-credit pool for “remaining credit” estimates. */
export function promoCreditPoolUsd(): number | null {
  const raw = process.env.AWS_PROMO_CREDIT_USD?.trim();
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Rolling-window Activate credit spend that triggers a Discord alert (default $20). */
export function awsBudgetAlertUsd(): number | null {
  const raw = process.env.AWS_BUDGET_ALERT_USD?.trim();
  if (raw === "0" || raw?.toLowerCase() === "false") return null;
  if (!raw) return 20;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 20;
}

/** Rolling window length for budget alerts in days (default 30). */
export function awsBudgetAlertDays(): number {
  const raw = process.env.AWS_BUDGET_ALERT_DAYS?.trim();
  if (!raw) return 30;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export function awsBudgetAlertChannelId(): string {
  return (
    process.env.AWS_BUDGET_ALERT_CHANNEL_ID?.trim() ||
    process.env.MINECRAFT_NOTIFY_CHANNEL_ID?.trim() ||
    "1511949691858718771"
  );
}
