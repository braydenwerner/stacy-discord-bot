import {
  getMinecraftWatchValue,
  setMinecraftWatchValue,
} from "@/db/minecraftWatchState";
import { MS_IN_ONE_MINUTE } from "@/constants/constants";
import {
  getMinecraftServerState,
  isMinecraftConfigured,
  type MinecraftServerState,
} from "@/utils/minecraft/minecraftClient";
import { recentIdleShutdownMs } from "@/utils/minecraft/minecraftEventWatcher";
import { notifyMinecraftChannel } from "@/utils/minecraft/minecraftNotify";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 2 * MS_IN_ONE_MINUTE;
const WATCH_KEY = "last_instance_state";

let timer: NodeJS.Timeout | null = null;

function formatStateMessage(
  state: MinecraftServerState,
  previous: string | null,
): string | null {
  const { state: current, connectAddress } = state;

  if (!previous) return null;

  if (previous !== "pending" && current === "pending") {
    return "**Minecraft EC2** is starting…";
  }

  if (previous !== "running" && current === "running") {
    return connectAddress
      ? `**Minecraft server is online** — connect at \`${connectAddress}\``
      : "**Minecraft server is online**";
  }

  if (previous !== "stopping" && current === "stopping") {
    if (recentIdleShutdownMs()) {
      return null;
    }
    return "**Minecraft EC2** is shutting down…";
  }

  if (previous !== "stopped" && current === "stopped") {
    if (recentIdleShutdownMs()) {
      return "**Minecraft idle shutdown complete** — EC2 halted; compute billing paused until the next start.";
    }
    return "**Minecraft EC2 stopped** — compute billing paused until the next start.";
  }

  return null;
}

async function pollInstance(client: Client): Promise<void> {
  try {
    const current = await getMinecraftServerState();
    const previous = getMinecraftWatchValue(WATCH_KEY);

    if (!previous) {
      setMinecraftWatchValue(WATCH_KEY, current.state);
      console.log(`[minecraft] instance watch baseline: ${current.state}`);
      return;
    }

    const message = formatStateMessage(current, previous);
    setMinecraftWatchValue(WATCH_KEY, current.state);

    if (message) {
      await notifyMinecraftChannel(client, message);
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
