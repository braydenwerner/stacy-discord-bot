import {
  formatMinecraftBackups,
  formatMinecraftHealth,
  formatMinecraftLogs,
  formatMinecraftMetrics,
} from "@/utils/minecraft/formatObservability";
import { isMinecraftBackupConfigured } from "@/utils/minecraft/minecraftBackups";
import {
  getMinecraftBackupReport,
  getMinecraftHealth,
  getMinecraftLogs,
  getMinecraftMetrics,
} from "@/utils/minecraft/minecraftObservability";

export type MinecraftObserveAction = "health" | "logs" | "backups" | "metrics";

export async function runMinecraftObserve(
  action: MinecraftObserveAction,
  options?: { logLines?: number },
): Promise<string> {
  switch (action) {
    case "health": {
      const health = await getMinecraftHealth();
      return formatMinecraftHealth(health);
    }
    case "logs": {
      const raw = await getMinecraftLogs(options?.logLines ?? 25);
      return formatMinecraftLogs(raw);
    }
    case "backups": {
      if (!isMinecraftBackupConfigured()) {
        throw new Error("MINECRAFT_BACKUP_BUCKET is not set.");
      }
      const { bucket, backups } = await getMinecraftBackupReport(8);
      return formatMinecraftBackups(bucket, backups);
    }
    case "metrics": {
      const metrics = await getMinecraftMetrics();
      return formatMinecraftMetrics(metrics);
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
  return (
    value === "health" ||
    value === "logs" ||
    value === "backups" ||
    value === "metrics"
  );
}
