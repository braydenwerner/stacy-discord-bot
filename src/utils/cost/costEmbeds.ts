import type { TotalCostReport } from "@/utils/cost/totalCostReport";
import { OPENAI_MODEL } from "@/utils/tokenTracker";
import { EmbedBuilder } from "discord.js";

const COST_COLOR = 0x1abc9c;

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Whole dollars when even ($20); otherwise two decimals ($114.25). */
export function usdShort(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.005) {
    return `$${Math.round(rounded)}`;
  }
  return `$${rounded.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function clampField(value: string, max = 1024): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function buildTotalCostEmbed(report: TotalCostReport): EmbedBuilder {
  const { aws, openAi } = report;

  const embed = new EmbedBuilder()
    .setColor(COST_COLOR)
    .setTitle("Cost breakdown")
    .setDescription(
      `**Combined total:** ${usd(report.combinedTotalUsd)} ` +
        `(Activate credits ${usd(aws.creditsUsedUsd)} + OpenAI ${usd(openAi.totalCost)})`,
    )
    .addFields(
      {
        name: "Activate credits used",
        value: `${usd(aws.creditsUsedUsd)}\n_${aws.periodStart} → ${aws.periodEnd}_`,
        inline: true,
      },
      {
        name: "OpenAI / Stacy",
        value: `${usd(openAi.totalCost)}\n_${OPENAI_MODEL}, lifetime est._`,
        inline: true,
      },
    )
    .setFooter({
      text: "AWS = Activate credits consumed · OpenAI from token counts × list pricing",
    })
    .setTimestamp();

  if (aws.promoCreditRemainingUsd != null) {
    embed.addFields({
      name: "Activate credits remaining (est.)",
      value: clampField(
        `${usd(aws.promoCreditRemainingUsd)}\n_Based on AWS_PROMO_CREDIT_USD minus credits used in this period._`,
      ),
      inline: true,
    });
  }

  if (aws.services.length > 0) {
    const serviceLines = aws.services
      .filter((row) => row.amountUsd >= 0.005)
      .map((row) => `• ${row.service}: ${usd(row.amountUsd)}`);

    if (serviceLines.length > 0) {
      embed.addFields({
        name: `Credits used by service (${aws.periodStart} → ${aws.periodEnd})`,
        value: clampField(serviceLines.join("\n")),
      });
    }
  }

  embed.addFields({
    name: "OpenAI usage (lifetime)",
    value: clampField(
      [
        `${formatTokens(openAi.totalInput)} input / ${formatTokens(openAi.totalOutput)} output tokens`,
        `${openAi.totalCalls} API calls · estimated ${usd(openAi.totalCost)}`,
      ].join("\n"),
    ),
  });

  return embed;
}

/** Short plain-text summary for tool/agent results. */
export function summarizeTotalCostReport(report: TotalCostReport): string {
  return (
    `Combined total ${usd(report.combinedTotalUsd)} ` +
    `(Activate credits ${usd(report.aws.creditsUsedUsd)}, OpenAI ${usd(report.openAi.totalCost)}).`
  );
}

const ALERT_COLOR = 0xed4245;

export function buildBudgetAlertEmbed(params: {
  creditsUsedUsd: number;
  thresholdUsd: number;
  windowDays: number;
  periodStart: string;
  periodEnd: string;
  promoRemainingUsd: number | null;
  alertTier: number;
}): EmbedBuilder {
  const markUsd = params.thresholdUsd * params.alertTier;
  const embed = new EmbedBuilder()
    .setColor(ALERT_COLOR)
    .setTitle("AWS budget alert")
    .setDescription(
      `Activate credits used in the last **${params.windowDays} days** crossed **${usdShort(markUsd)}** ` +
        `(alert every ${usdShort(params.thresholdUsd)}).`,
    )
    .addFields(
      {
        name: "Credits used",
        value: usdShort(params.creditsUsedUsd),
        inline: true,
      },
      {
        name: "Alert threshold",
        value: `${usdShort(params.thresholdUsd)} increments / ${params.windowDays} days`,
        inline: true,
      },
      {
        name: "Milestone",
        value: usdShort(markUsd),
        inline: true,
      },
      {
        name: "Period",
        value: `${params.periodStart} → ${params.periodEnd}`,
      },
    )
    .setFooter({ text: "AWS · Activate credits · Cost Explorer" })
    .setTimestamp();

  if (params.promoRemainingUsd != null) {
    embed.addFields({
      name: "Credits remaining (est.)",
      value: usdShort(params.promoRemainingUsd),
      inline: true,
    });
  }

  return embed;
}
