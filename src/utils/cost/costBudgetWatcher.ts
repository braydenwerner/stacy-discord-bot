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
import { buildBudgetAlertEmbed, usdShort } from "@/utils/cost/costEmbeds";
import { getStacyOwnerId } from "@/utils/stacyOwner";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 6 * MS_IN_ONE_HOUR;
const LAST_ALERT_TIER_KEY = "cost_budget_alert_last_tier";
/** @deprecated migrated to tier key */
const LEGACY_LAST_ALERT_AMOUNT_KEY = "cost_budget_alert_last_amount";

let timer: NodeJS.Timeout | null = null;

function clearAlertState(): void {
  setMinecraftWatchValue(LAST_ALERT_TIER_KEY, "");
  setMinecraftWatchValue(LEGACY_LAST_ALERT_AMOUNT_KEY, "");
}

/** Each full thresholdUsd of spend in the window is one alert tier ($20, $40, …). */
function spendTier(creditsUsedUsd: number, thresholdUsd: number): number {
  if (creditsUsedUsd < thresholdUsd) return 0;
  return Math.floor(creditsUsedUsd / thresholdUsd);
}

function lastAlertedTier(thresholdUsd: number): number {
  const tierRaw = getMinecraftWatchValue(LAST_ALERT_TIER_KEY);
  if (tierRaw) {
    const tier = Number.parseInt(tierRaw, 10);
    if (Number.isFinite(tier) && tier >= 0) return tier;
  }

  const legacyAmount = getMinecraftWatchValue(LEGACY_LAST_ALERT_AMOUNT_KEY);
  if (legacyAmount) {
    const amount = Number.parseFloat(legacyAmount);
    if (Number.isFinite(amount)) {
      const tier = spendTier(amount, thresholdUsd);
      if (tier > 0) {
        setMinecraftWatchValue(LAST_ALERT_TIER_KEY, String(tier));
        setMinecraftWatchValue(LEGACY_LAST_ALERT_AMOUNT_KEY, "");
      }
      return tier;
    }
  }

  return 0;
}

function shouldSendAlert(creditsUsedUsd: number, thresholdUsd: number): number | null {
  const tier = spendTier(creditsUsedUsd, thresholdUsd);
  if (tier === 0) {
    if (getMinecraftWatchValue(LAST_ALERT_TIER_KEY)) clearAlertState();
    return null;
  }

  const lastTier = lastAlertedTier(thresholdUsd);
  if (tier <= lastTier) return null;
  return tier;
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

    const alertTier = shouldSendAlert(creditsUsedUsd, thresholdUsd);
    if (alertTier == null) return;

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
      alertTier,
    });

    const channel = await resolveAlertChannel(client);
    if (!channel) return;

    const ownerId = getStacyOwnerId();
    const markUsd = thresholdUsd * alertTier;
    await channel.send({
      content:
        `<@${ownerId}> AWS Activate credits reached **${usdShort(markUsd)}** ` +
        `in the last ${windowDays} days (${usdShort(creditsUsedUsd)} used).`,
      embeds: [embed],
    });

    setMinecraftWatchValue(LAST_ALERT_TIER_KEY, String(alertTier));

    console.warn(
      `[cost] budget alert sent: tier ${alertTier} (${usdShort(markUsd)}) — ` +
        `${usdShort(creditsUsedUsd)} used in ${windowDays}d`,
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
      `${usdShort(awsBudgetAlertUsd()!)} increments / ${awsBudgetAlertDays()} days)`,
  );
}

export function stopCostBudgetWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
