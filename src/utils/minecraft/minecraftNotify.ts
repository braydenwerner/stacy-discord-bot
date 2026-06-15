import { MINECRAFT_NOTIFY_CHANNEL_ID } from "@/constants/constants";
import type { Client, SendableChannels } from "discord.js";

export function getMinecraftNotifyChannelId(): string {
  return MINECRAFT_NOTIFY_CHANNEL_ID;
}

export async function resolveMinecraftNotifyChannel(
  client: Client,
): Promise<SendableChannels | null> {
  const channel = await client.channels.fetch(getMinecraftNotifyChannelId());
  if (!channel?.isSendable()) {
    console.warn(
      `[minecraft] notify channel ${getMinecraftNotifyChannelId()} is missing or not sendable`,
    );
    return null;
  }
  return channel;
}

export async function notifyMinecraftChannel(
  client: Client,
  content: string,
): Promise<boolean> {
  const channel = await resolveMinecraftNotifyChannel(client);
  if (!channel) return false;
  await channel.send(content);
  return true;
}
