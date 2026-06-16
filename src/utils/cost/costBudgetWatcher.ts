import {
  getMinecraftWatchValue,
  setMinecraftWatchValue,
} from "@/db/minecraftWatchState";
import { MS_IN_ONE_HOUR } from "@/constants/constants";
import {
  awsBudgetAlertChannelId,
  awsBudgetAlertDays,
  awsBudgetAlertUsd,
  getAwsCredentialError,
  promoCreditPoolUsd,
} from "@/utils/aws/awsConfig";
import { getAwsCreditsUsedForDays, getAwsCostSummary } from "@/utils/aws/awsCostSummary";
import { buildBudgetAlertEmbed } from "@/utils/cost/costEmbeds";
import { getStacyOwnerId } from "@/utils/stacyOwner";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 6 * MS_IN_ONE_HOUR;
const LAST_ALERT_AT_KEY = "cost_budget_alert_last_at";
const LAST_ALERT_AMOUNT_KEY = "cost_budget_alert_last_amount";

let timer: NodeJS.Timeout | null = null;

function clearAlertState(): void {
  setMinecraftWatchValue(LAST_ALERT_AT_KEY, "");
  setMinecraftWatchValue(LAST_ALERT_AMOUNT_KEY, "");
}

function shouldSendAlert(
  creditsUsedUsd: number,
  thresholdUsd: number,
  windowDays: number,
): boolean {
  const lastAtRaw = getMinecraftWatchValue(LAST_ALERT_AT_KEY);
  const lastAmountRaw = getMinecraftWatchValue(LAST_ALERT_AMOUNT_KEY);

  if (creditsUsedUsd < thresholdUsd) {
    if (lastAtRaw || lastAmountRaw) clearAlertState();
    return false;
  }

  if (!lastAtRaw) return true;

  const lastAmount = Number.parseFloat(lastAmountRaw ?? "0");
  if (
    Number.isFinite(lastAmount) &&
    creditsUsedUsd >= lastAmount + thresholdUsd
  ) {
    return true;
  }

  const lastAt = Date.parse(lastAtRaw);
  if (Number.isNaN(lastAt)) return true;

  const remindAfterMs = windowDays * 24 * MS_IN_ONE_HOUR;
  return Date.now() - lastAt >= remindAfterMs;
}

async function resolveAlertChannel(client: Client) {
  const channel = await client.channels.fetch(awsBudgetAlertChannelId());
  if (!channel?.isSendable()) {
    console.warn(
      `[cost] budget alert channel ${awsBudgetAlertChannelId()} is missing or not sendable`,
    );
    return null;
  }
  return channel;
}

async function pollBudgetAlert(client: Client): Promise<void> {
  const thresholdUsd = awsBudgetAlertUsd();
  if (thresholdUsd == null) return;

  const windowDays = awsBudgetAlertDays();

  try {
    const { creditsUsedUsd, periodStart, periodEnd } =
      await getAwsCreditsUsedForDays(windowDays);

    if (!shouldSendAlert(creditsUsedUsd, thresholdUsd, windowDays)) return;

    const promoRemainingUsd = promoCreditPoolUsd()
      ? (await getAwsCostSummary()).promoCreditRemainingUsd
      : null;

    const embed = buildBudgetAlertEmbed({
      creditsUsedUsd,
      thresholdUsd,
      windowDays,
      periodStart,
      periodEnd,
      promoRemainingUsd,
    });

    const channel = await resolveAlertChannel(client);
    if (!channel) return;

    const ownerId = getStacyOwnerId();
    await channel.send({
      content: `<@${ownerId}> AWS Activate credits passed ${thresholdUsd.toFixed(0)} USD in the last ${windowDays} days.`,
      embeds: [embed],
    });

    setMinecraftWatchValue(LAST_ALERT_AT_KEY, new Date().toISOString());
    setMinecraftWatchValue(
      LAST_ALERT_AMOUNT_KEY,
      creditsUsedUsd.toFixed(2),
    );

    console.warn(
      `[cost] budget alert sent: ${creditsUsedUsd.toFixed(2)} USD used in ${windowDays}d (threshold ${thresholdUsd})`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[cost] budget alert poll failed: ${reason}`);
  }
}

export function startCostBudgetWatcher(client: Client): void {
  if (getAwsCredentialError()) return;
  if (awsBudgetAlertUsd() == null) return;
  if (timer) return;

  void pollBudgetAlert(client);
  timer = setInterval(() => {
    void pollBudgetAlert(client);
  }, POLL_INTERVAL_MS);
  timer.unref?.();

  console.log(
    `[cost] budget alert watcher started (every ${POLL_INTERVAL_MS / MS_IN_ONE_HOUR}h, ` +
      `threshold $${awsBudgetAlertUsd()} / ${awsBudgetAlertDays()} days)`,
  );
}

export function stopCostBudgetWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
