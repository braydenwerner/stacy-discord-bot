import { EQUALITY_ROLE_NAME } from "@/constants/constants";
import {
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction,
  type Guild,
  GuildMember,
  type Message,
} from "discord.js";

async function memberHasEquality(
  guild: Guild,
  member: GuildMember | APIInteractionGuildMember,
): Promise<boolean> {
  const roleName = EQUALITY_ROLE_NAME.toLowerCase();

  if (member instanceof GuildMember) {
    const resolved = member.partial ? await member.fetch() : member;
    return resolved.roles.cache.some(
      (role) => role.name.toLowerCase() === roleName,
    );
  }

  return guild.roles.cache.some(
    (role) =>
      member.roles.includes(role.id) &&
      role.name.toLowerCase() === roleName,
  );
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
  return memberHasEquality(message.guild, message.member);
}

export async function requireEquality(
  message: Message,
): Promise<string | null> {
  if (!message.guild) {
    return "This only works in a server channel.";
  }
  if (!(await hasEqualityRole(message))) {
    return `You need the **${EQUALITY_ROLE_NAME}** role to use this.`;
  }
  return null;
}

export async function requireEqualityInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  if (!interaction.guild) {
    return "This only works in a server.";
  }
  if (!(await hasEqualityRoleForMember(interaction.guild, interaction.member))) {
    return `You need the **${EQUALITY_ROLE_NAME}** role to use this command.`;
  }
  return null;
}
