import {
  getMinecraftWatchValue,
  setMinecraftWatchValue,
} from "@/db/minecraftWatchState";
import { MS_IN_ONE_MINUTE } from "@/constants/constants";
import { getMinecraftServerState, isMinecraftConfigured } from "@/utils/minecraft/minecraftClient";
import { buildIdleOverdueEmbed } from "@/utils/minecraft/minecraftEmbeds";
import { minecraftIdleShutdownMinutes } from "@/utils/minecraft/minecraftConfig";
import { notifyMinecraftEmbed } from "@/utils/minecraft/minecraftNotify";
import {
  getMinecraftHealth,
  parseMinecraftPlayerCount,
} from "@/utils/minecraft/minecraftObservability";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 2 * MS_IN_ONE_MINUTE;
/** Host idle cron runs every 5 min — warn only after that grace window. */
const CRON_GRACE_MINUTES = 5;
/** Re-notify if still overdue after this interval. */
const REMIND_INTERVAL_MS = 60 * MS_IN_ONE_MINUTE;

const EMPTY_SINCE_KEY = "idle_empty_since";
const OVERDUE_NOTIFIED_KEY = "idle_overdue_notified_at";

let timer: NodeJS.Timeout | null = null;

function clearIdleWatchState(): void {
  setMinecraftWatchValue(EMPTY_SINCE_KEY, "");
  setMinecraftWatchValue(OVERDUE_NOTIFIED_KEY, "");
}

function elapsedMinutesSince(iso: string): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.floor((Date.now() - ts) / MS_IN_ONE_MINUTE);
}

function shouldNotifyAgain(): boolean {
  const last = getMinecraftWatchValue(OVERDUE_NOTIFIED_KEY);
  if (!last) return true;
  const ts = Date.parse(last);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts >= REMIND_INTERVAL_MS;
}

async function pollIdleOverdue(client: Client): Promise<void> {
  try {
    const state = await getMinecraftServerState();
    if (state.state !== "running") {
      clearIdleWatchState();
      return;
    }

    const health = await getMinecraftHealth();
    if (health.portOpen !== true) {
      // Still booting or MC not listening — do not start the empty timer yet.
      return;
    }

    const playerCount = parseMinecraftPlayerCount(health.playerSummary);
    if (playerCount == null) {
      // RCON unavailable — cannot confirm zero players.
      return;
    }

    if (playerCount > 0) {
      clearIdleWatchState();
      return;
    }

    const threshold = minecraftIdleShutdownMinutes();
    const overdueAfter = threshold + CRON_GRACE_MINUTES;

    let emptySince = getMinecraftWatchValue(EMPTY_SINCE_KEY);
    if (!emptySince) {
      emptySince = new Date().toISOString();
      setMinecraftWatchValue(EMPTY_SINCE_KEY, emptySince);
      console.log(
        `[minecraft] idle watchdog: 0 players, timer started (threshold ${threshold} min)`,
      );
      return;
    }

    const emptyMinutes = elapsedMinutesSince(emptySince);
    if (emptyMinutes < overdueAfter) return;
    if (!shouldNotifyAgain()) return;

    const embed = buildIdleOverdueEmbed({
      emptyMinutes,
      idleThresholdMinutes: threshold,
      playerSummary: health.playerSummary,
      connectAddress: health.connectAddress,
    });
    await notifyMinecraftEmbed(client, embed);
    setMinecraftWatchValue(OVERDUE_NOTIFIED_KEY, new Date().toISOString());
    console.warn(
      `[minecraft] idle shutdown overdue: ${emptyMinutes} min empty (threshold ${threshold} min)`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[minecraft] idle overdue watch failed: ${reason}`);
  }
}

export function startMinecraftIdleOverdueWatcher(client: Client): void {
  if (!isMinecraftConfigured()) return;
  if (timer) return;

  void pollIdleOverdue(client);
  timer = setInterval(() => {
    void pollIdleOverdue(client);
  }, POLL_INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[minecraft] idle overdue watcher started (every ${POLL_INTERVAL_MS / MS_IN_ONE_MINUTE}m, threshold ${minecraftIdleShutdownMinutes()} min)`,
  );
}

export function stopMinecraftIdleOverdueWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
