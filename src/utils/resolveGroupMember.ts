import { resolveUserId } from "@/constants/people";
import type { Message, User } from "discord.js";

export type MemberResolveContext = {
  authorId: string;
  guildId: string | null;
  mentions: Iterable<User>;
};

export function messageToMemberContext(message: Message): MemberResolveContext {
  return {
    authorId: message.author.id,
    guildId: message.guildId,
    mentions: message.mentions.users.values(),
  };
}

export function resolveGroupMemberFromContext(
  ctx: MemberResolveContext,
  userHint: string,
): string | undefined {
  const hint = userHint.trim();
  const mentionMatch = hint.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];

  const stripped = hint.replace(/^@+/, "").trim();
  const lower = stripped.toLowerCase();
  if (lower === "me" || lower === "myself" || lower === "i") {
    return ctx.authorId;
  }

  if (/^\d{17,20}$/.test(stripped)) return stripped;

  const fromContacts = resolveUserId(stripped, ctx.guildId);
  if (fromContacts) return fromContacts;

  for (const user of ctx.mentions) {
    if (
      user.username.toLowerCase() === lower ||
      user.displayName?.toLowerCase() === lower
    ) {
      return user.id;
    }
  }

  return undefined;
}

export function resolveGroupMemberId(
  message: Message,
  userHint: string,
): string | undefined {
  return resolveGroupMemberFromContext(messageToMemberContext(message), userHint);
}
