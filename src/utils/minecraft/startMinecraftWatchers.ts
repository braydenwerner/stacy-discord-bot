import { startMinecraftBackupWatcher } from "@/utils/minecraft/minecraftBackupWatcher";
import { startMinecraftInstanceWatcher } from "@/utils/minecraft/minecraftInstanceWatcher";
import { getMinecraftNotifyChannelId } from "@/utils/minecraft/minecraftNotify";
import type { Client } from "discord.js";

export function startMinecraftWatchers(client: Client): void {
  console.log(
    `[minecraft] notifications will post to channel ${getMinecraftNotifyChannelId()}`,
  );
  startMinecraftInstanceWatcher(client);
  startMinecraftBackupWatcher(client);
}
