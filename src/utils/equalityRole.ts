import { EQUALITY_ROLE_NAME } from "@/constants/constants";
import { isStacyOwner } from "@/utils/stacyOwner";
import {
  type ChatInputCommandInteraction,
  type Guild,
  GuildMember,
  type Message,
  PermissionFlagsBits,
} from "discord.js";

export const DENY_DIRECTORY_MESSAGE = `You need the **${EQUALITY_ROLE_NAME}** role, **Administrator**, or **Manage Server** to use this.`;

function guildMemberHasEquality(member: GuildMember): boolean {
  const roleName = EQUALITY_ROLE_NAME.toLowerCase();
  return member.roles.cache.some(
    (role) => role.name.toLowerCase() === roleName,
  );
}

function memberHasAdminPerms(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

/** Load roles from the API (reliable; message.member cache is often empty). */
async function fetchGuildMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[access] fetch failed user=${userId} guild=${guild.id}: ${reason}`);
    return null;
  }
}

/** Contacts, groups, and /people — Equality role, server admin, or bot owner. */
export async function canManageServerDirectory(
  guild: Guild | null,
  userId: string,
): Promise<boolean> {
  if (!guild || !userId) return false;
  if (isStacyOwner(userId)) return true;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return false;

  if (memberHasAdminPerms(member)) return true;
  if (guildMemberHasEquality(member)) return true;

  const roleNames = member.roles.cache.map((r) => r.name).join(", ") || "(none)";
  console.warn(
    `[access] denied user=${userId} tag=${member.user.tag} guild=${guild.id} roles=[${roleNames}]`,
  );
  return false;
}

export async function hasEqualityRole(message: Message): Promise<boolean> {
  if (!message.guild) return false;
  return canManageServerDirectory(message.guild, message.author.id);
}

export async function requireEquality(
  message: Message,
): Promise<string | null> {
  if (!message.guild) {
    return "This only works in a server channel.";
  }
  if (await canManageServerDirectory(message.guild, message.author.id)) {
    return null;
  }
  return DENY_DIRECTORY_MESSAGE;
}

export async function requireEqualityInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  if (!interaction.guild) {
    return "This only works in a server.";
  }
  if (await canManageServerDirectory(interaction.guild, interaction.user.id)) {
    return null;
  }
  return DENY_DIRECTORY_MESSAGE;
}
