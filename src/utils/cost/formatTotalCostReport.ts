import type { TotalCostReport } from "@/utils/cost/totalCostReport";
import { OPENAI_MODEL } from "@/utils/tokenTracker";

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function signedUsd(amount: number): string {
  if (amount < 0) return `-${usd(Math.abs(amount))}`;
  return usd(amount);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatTotalCostReport(report: TotalCostReport): string {
  const { aws, openAi } = report;
  const lines: string[] = [
    "**Total cost breakdown**",
    "",
    `**Combined total:** ${usd(report.combinedTotalUsd)}`,
    `• AWS (${aws.periodStart} → ${aws.periodEnd}): ${usd(aws.totalUsd)}`,
    `• OpenAI / Stacy (${OPENAI_MODEL}, lifetime est.): ${usd(openAi.totalCost)}`,
  ];

  if (aws.services.length > 0) {
    lines.push("");
    lines.push(`**AWS by service (${aws.periodStart} → ${aws.periodEnd}):**`);
    for (const row of aws.services) {
      if (Math.abs(row.amountUsd) < 0.005) continue;
      lines.push(`• ${row.service}: ${signedUsd(row.amountUsd)}`);
    }
  }

  lines.push("");
  lines.push("**OpenAI (Stacy bot, lifetime):**");
  lines.push(
    `• ${formatTokens(openAi.totalInput)} input / ${formatTokens(openAi.totalOutput)} output tokens`,
  );
  lines.push(`• ${openAi.totalCalls} API calls · estimated ${usd(openAi.totalCost)}`);

  if (aws.creditsUsd !== 0) {
    lines.push("");
    lines.push(`**AWS credits applied:** ${signedUsd(aws.creditsUsd)}`);
  }

  if (aws.budget) {
    lines.push("");
    lines.push(`**AWS budget \`${aws.budget.name}\` (${aws.budget.period})**`);
    lines.push(`Limit: ${usd(aws.budget.limitUsd)}`);
    lines.push(`Spent: ${usd(aws.budget.spentUsd)}`);
    lines.push(`**Remaining:** ${usd(aws.budget.remainingUsd)}`);
  }

  if (aws.promoCreditRemainingUsd != null) {
    lines.push("");
    lines.push(
      `**AWS promo credit remaining (est.):** ${usd(aws.promoCreditRemainingUsd)}`,
    );
    lines.push("_Based on AWS_PROMO_CREDIT_USD minus AWS spend in this period._");
  }

  lines.push("");
  lines.push(
    "_OpenAI cost is estimated from token counts × gpt-4.1 list pricing; AWS from Cost Explorer._",
  );

  return lines.join("\n");
}
