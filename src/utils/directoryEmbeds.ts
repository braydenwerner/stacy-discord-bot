import type { Contact } from "@/db/contacts";
import type { UserGroupSummary } from "@/db/userGroups";
import { displayNameForUserId } from "@/constants/people";
import { EMBED_DESCRIPTION_MAX_LENGTH } from "@/constants/constants";
import { EmbedBuilder, type Guild } from "discord.js";

const DIRECTORY_COLOR = 0x1abc9c;

function guildAuthor(guild: Guild | null | undefined) {
  if (!guild) return undefined;
  return {
    name: guild.name,
    iconURL: guild.iconURL() ?? undefined,
  };
}

function clampFieldValue(value: string, max = 1024): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function buildContactsEmbed(
  contacts: Contact[],
  guild?: Guild | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(DIRECTORY_COLOR)
    .setTitle("👥 Known People")
    .setTimestamp();

  const author = guildAuthor(guild);
  if (author) embed.setAuthor(author);

  if (contacts.length === 0) {
    embed.setDescription(
      "No contacts stored yet.\nUse `/contact add` or ask Stacy to add someone.",
    );
    return embed;
  }

  embed.setDescription(`**${contacts.length}** contact${contacts.length === 1 ? "" : "s"} on this server.`);

  const lines = contacts.map(
    (c) => `**${c.name}** — <@${c.userId}>\n\`${c.userId}\``,
  );
  const body = lines.join("\n\n");

  if (body.length <= EMBED_DESCRIPTION_MAX_LENGTH) {
    embed.setDescription(
      `**${contacts.length}** contact${contacts.length === 1 ? "" : "s"}\n\n${body}`,
    );
    return embed;
  }

  const fields = contacts.slice(0, 25).map((c) => ({
    name: c.name,
    value: `<@${c.userId}>\n\`${c.userId}\``,
    inline: true,
  }));
  embed.addFields(fields);
  if (contacts.length > 25) {
    embed.setFooter({ text: `Showing 25 of ${contacts.length} contacts` });
  }
  return embed;
}

export function buildGroupsEmbed(
  groups: UserGroupSummary[],
  guildId: string | null,
  guild?: Guild | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(DIRECTORY_COLOR)
    .setTitle("📋 User Groups")
    .setTimestamp();

  const author = guildAuthor(guild);
  if (author) embed.setAuthor(author);

  if (groups.length === 0) {
    embed.setDescription(
      "No groups yet.\nUse `/group create` or ask Stacy to create one.",
    );
    return embed;
  }

  embed.setDescription(
    `**${groups.length}** group${groups.length === 1 ? "" : "s"} on this server.`,
  );

  const fields = groups.slice(0, 25).map((group) => {
    const members =
      group.memberIds.length === 0
        ? "*(empty)*"
        : group.memberIds
            .map((id) => {
              const label = displayNameForUserId(id, guildId);
              return label.startsWith("<@") ? label : `**${label}**`;
            })
            .join(", ");
    return {
      name: group.name,
      value: clampFieldValue(members || "*(empty)*"),
      inline: false,
    };
  });

  embed.addFields(fields);
  if (groups.length > 25) {
    embed.setFooter({ text: `Showing 25 of ${groups.length} groups` });
  }
  return embed;
}

export function contactsSummaryForModel(count: number): string {
  if (count === 0) return "No contacts on this server.";
  return `Listed ${count} contact${count === 1 ? "" : "s"} in an embed.`;
}

export function groupsSummaryForModel(count: number): string {
  if (count === 0) return "No user groups on this server.";
  return `Listed ${count} group${count === 1 ? "" : "s"} in an embed.`;
}
