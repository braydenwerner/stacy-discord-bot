import type { AwsUsageReport } from "@/utils/aws/awsUsage";

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function signedUsd(amount: number): string {
  if (amount < 0) return `-${usd(Math.abs(amount))}`;
  return usd(amount);
}

export function formatAwsUsageReport(report: AwsUsageReport): string {
  const lines: string[] = [
    `**AWS usage (${report.periodLabel})**`,
    "",
    `**Month to date:** ${usd(report.monthToDateUsd)}`,
    `**Last month:** ${usd(report.lastMonthUsd)}`,
    `**Last 12 months:** ${usd(report.trailingTwelveMonthsUsd)}`,
  ];

  if (report.creditsMonthToDateUsd !== 0) {
    lines.push(
      `**Credits applied (MTD):** ${signedUsd(report.creditsMonthToDateUsd)}`,
    );
  }

  if (report.projectedMonthTotalUsd != null) {
    lines.push(
      `**Projected month total:** ${usd(report.projectedMonthTotalUsd)}`,
    );
  }

  if (report.budget) {
    lines.push("");
    lines.push(`**Budget \`${report.budget.name}\` (${report.budget.period})**`);
    lines.push(`Limit: ${usd(report.budget.limitUsd)}`);
    lines.push(`Spent: ${usd(report.budget.spentUsd)}`);
    lines.push(`**Remaining:** ${usd(report.budget.remainingUsd)}`);
  } else if (report.manualBudgetRemainingUsd != null) {
    const limit = report.manualBudgetRemainingUsd + report.monthToDateUsd;
    lines.push("");
    lines.push(`**Monthly budget (configured):** ${usd(limit)}`);
    lines.push(`**Remaining this month:** ${usd(report.manualBudgetRemainingUsd)}`);
  }

  if (report.promoCreditRemainingUsd != null) {
    lines.push("");
    lines.push(
      `**Promo credit remaining (est.):** ${usd(report.promoCreditRemainingUsd)}`,
    );
    lines.push("_Based on AWS_PROMO_CREDIT_USD minus trailing 12-month spend._");
  }

  if (report.topServices.length > 0) {
    lines.push("");
    lines.push("**Top services (MTD):**");
    for (const row of report.topServices) {
      if (row.amountUsd < 0.005) continue;
      lines.push(`• ${row.service}: ${usd(row.amountUsd)}`);
    }
  }

  if (
    !report.budget &&
    report.manualBudgetRemainingUsd == null &&
    report.promoCreditRemainingUsd == null
  ) {
    lines.push("");
    lines.push(
      "_AWS postpaid accounts bill monthly on your card — there is no cash “balance” API. " +
        "Set `AWS_BUDGET_NAME` + `AWS_ACCOUNT_ID`, or `AWS_MONTHLY_BUDGET_USD`, " +
        "or `AWS_PROMO_CREDIT_USD` for remaining-budget tracking._",
    );
  }

  return lines.join("\n");
}
