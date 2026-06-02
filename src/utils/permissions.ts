import { Message } from "discord.js";

export function hasEqualityRole(message: Message): boolean {
  if (!message.member) return false;
  return message.member.roles.cache.some(
    (role) => role.name.toLowerCase() === "equality",
  );
}

export function extractUserIdFromMention(mention: string): string | null {
  const match = mention.match(/^<@!?(\d+)>$/);
  return match ? match[1] : null;
}
