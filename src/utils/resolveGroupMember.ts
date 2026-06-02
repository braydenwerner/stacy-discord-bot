import { resolveUserId } from "@/constants/people";
import type { Message } from "discord.js";

export function resolveGroupMemberId(
  message: Message,
  userHint: string,
): string | undefined {
  const hint = userHint.trim();
  const mentionMatch = hint.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];

  if (!hint && message.mentions.users.size > 0) {
    return message.mentions.users.first()!.id;
  }

  const stripped = hint.replace(/^@+/, "").trim();
  if (/^\d{17,20}$/.test(stripped)) return stripped;

  const fromContacts = resolveUserId(stripped, message.guildId);
  if (fromContacts) return fromContacts;

  for (const [, user] of message.mentions.users) {
    if (
      user.username.toLowerCase() === stripped.toLowerCase() ||
      user.displayName?.toLowerCase() === stripped.toLowerCase()
    ) {
      return user.id;
    }
  }

  return undefined;
}
