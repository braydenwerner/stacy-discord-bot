import { EQUALITY_ROLE_NAME } from "@/constants/constants";
import { isStacyOwner } from "@/utils/stacyOwner";
import {
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction,
  type Guild,
  GuildMember,
  type Message,
  PermissionFlagsBits,
} from "discord.js";

const DENY_MESSAGE = `You need the **${EQUALITY_ROLE_NAME}** role, **Administrator**, or **Manage Server** to use this.`;

function guildMemberHasEquality(member: GuildMember): boolean {
  const roleName = EQUALITY_ROLE_NAME.toLowerCase();
  return member.roles.cache.some(
    (role) => role.name.toLowerCase() === roleName,
  );
}

/** Load roles from the API — message.member often has an empty role cache without GuildMembers intent. */
async function fetchGuildMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

async function memberHasEquality(
  guild: Guild,
  member: GuildMember | APIInteractionGuildMember,
): Promise<boolean> {
  if (member instanceof GuildMember) {
    let resolved = member.partial ? await member.fetch() : member;
    if (resolved.roles.cache.size <= 1) {
      const fresh = await fetchGuildMember(guild, resolved.id);
      if (fresh) resolved = fresh;
    }
    return guildMemberHasEquality(resolved);
  }

  const roleName = EQUALITY_ROLE_NAME.toLowerCase();
  return guild.roles.cache.some(
    (role) =>
      member.roles.includes(role.id) &&
      role.name.toLowerCase() === roleName,
  );
}

function memberHasAdminPerms(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

/** Contacts, groups, and /people — Equality role, server admin, or bot owner. */
export async function canManageServerDirectory(
  guild: Guild | null,
  member: GuildMember | APIInteractionGuildMember | null,
  userId: string,
): Promise<boolean> {
  if (!guild || !member) return false;
  if (isStacyOwner(userId)) return true;

  if (member instanceof GuildMember) {
    const resolved =
      (await fetchGuildMember(guild, userId)) ??
      (member.partial ? await member.fetch() : member);
    if (memberHasAdminPerms(resolved)) return true;
    return guildMemberHasEquality(resolved);
  }

  const fetched = await fetchGuildMember(guild, userId);
  if (fetched) {
    if (memberHasAdminPerms(fetched)) return true;
    return guildMemberHasEquality(fetched);
  }

  return memberHasEquality(guild, member);
}

export async function hasEqualityRoleForMember(
  guild: Guild | null,
  member: GuildMember | APIInteractionGuildMember | null,
): Promise<boolean> {
  if (!guild || !member) return false;
  return memberHasEquality(guild, member);
}

export async function hasEqualityRole(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;
  return canManageServerDirectory(
    message.guild,
    message.member,
    message.author.id,
  );
}

export async function requireEquality(
  message: Message,
): Promise<string | null> {
  if (!message.guild) {
    return "This only works in a server channel.";
  }
  if (!(await canManageServerDirectory(
    message.guild,
    message.member,
    message.author.id,
  ))) {
    if (process.env.DEBUG_ENABLED === "true") {
      const member = await fetchGuildMember(message.guild, message.author.id);
      const roles = member?.roles.cache.map((r) => r.name).join(", ") ?? "unknown";
      console.log(
        `[access] denied user=${message.author.id} roles=[${roles}] guild=${message.guild.id}`,
      );
    }
    return DENY_MESSAGE;
  }
  return null;
}

export async function requireEqualityInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  if (!interaction.guild) {
    return "This only works in a server.";
  }

  if (isStacyOwner(interaction.user.id)) return null;

  const perms = interaction.memberPermissions;
  if (
    perms?.has(PermissionFlagsBits.Administrator) ||
    perms?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return null;
  }

  if (await hasEqualityRoleForMember(interaction.guild, interaction.member)) {
    return null;
  }

  return DENY_MESSAGE;
}
