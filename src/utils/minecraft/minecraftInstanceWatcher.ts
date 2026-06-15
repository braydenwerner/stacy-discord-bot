import {
  getMinecraftWatchValue,
  setMinecraftWatchValue,
} from "@/db/minecraftWatchState";
import { MS_IN_ONE_MINUTE } from "@/constants/constants";
import {
  getMinecraftServerState,
  isMinecraftConfigured,
} from "@/utils/minecraft/minecraftClient";
import { recentIdleShutdownMs } from "@/utils/minecraft/minecraftEventWatcher";
import { buildInstanceStateEmbed } from "@/utils/minecraft/minecraftEmbeds";
import { notifyMinecraftEmbed } from "@/utils/minecraft/minecraftNotify";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 2 * MS_IN_ONE_MINUTE;
const WATCH_KEY = "last_instance_state";

let timer: NodeJS.Timeout | null = null;

async function pollInstance(client: Client): Promise<void> {
  try {
    const current = await getMinecraftServerState();
    const previous = getMinecraftWatchValue(WATCH_KEY);

    if (!previous) {
      setMinecraftWatchValue(WATCH_KEY, current.state);
      console.log(`[minecraft] instance watch baseline: ${current.state}`);
      return;
    }

    const embed = buildInstanceStateEmbed(current, previous, {
      idleShutdownRecent: recentIdleShutdownMs(),
    });
    setMinecraftWatchValue(WATCH_KEY, current.state);

    if (embed) {
      await notifyMinecraftEmbed(client, embed);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[minecraft] instance watch failed: ${reason}`);
  }
}

export function startMinecraftInstanceWatcher(client: Client): void {
  if (!isMinecraftConfigured()) return;
  if (timer) return;

  void pollInstance(client);
  timer = setInterval(() => {
    void pollInstance(client);
  }, POLL_INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[minecraft] instance watcher started (every ${POLL_INTERVAL_MS / MS_IN_ONE_MINUTE}m)`,
  );
}

export function stopMinecraftInstanceWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
