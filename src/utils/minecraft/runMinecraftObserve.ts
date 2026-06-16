import { buildMinecraftLogsEmbed, buildMinecraftMetricsEmbed } from "@/utils/minecraft/minecraftEmbeds";
import {
  getMinecraftLogs,
  getMinecraftMetrics,
} from "@/utils/minecraft/minecraftObservability";
import type { EmbedBuilder } from "discord.js";

export type MinecraftObserveAction = "logs" | "metrics";

export async function getMinecraftObserveEmbed(
  action: MinecraftObserveAction,
  options?: { logLines?: number },
): Promise<EmbedBuilder> {
  switch (action) {
    case "logs": {
      const raw = await getMinecraftLogs(options?.logLines ?? 25);
      return buildMinecraftLogsEmbed(raw, options?.logLines ?? 25);
    }
    case "metrics": {
      const metrics = await getMinecraftMetrics();
      return buildMinecraftMetricsEmbed(metrics);
    }
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown observe action: ${_exhaustive}`);
    }
  }
}

export function isMinecraftObserveAction(
  value: string,
): value is MinecraftObserveAction {
  return value === "logs" || value === "metrics";
}
