import type { Contact } from "@/db/contacts";
import {
  type PlaylistSummary,
  type PlaylistTrack,
  describePlaylistTrack,
} from "@/db/playlists";
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

export function buildNiceListEmbed(userIds: string[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("😊 Nice list")
    .setTimestamp();

  if (userIds.length === 0) {
    embed.setDescription(
      "No one is on the nice list. Stacy uses the **snarky** tone for everyone.",
    );
    return embed;
  }

  const lines = userIds.map((id) => `<@${id}> (\`${id}\`)`).join("\n");
  embed.setDescription(
    `**${userIds.length}** user${userIds.length === 1 ? "" : "s"} get the **nice** tone.\n\n${lines}`,
  );
  embed.setFooter({ text: "Everyone else gets the snarky tone." });
  return embed;
}

export function niceListSummaryForModel(count: number): string {
  if (count === 0) return "Nice list is empty; everyone gets snarky tone.";
  return `Listed ${count} user${count === 1 ? "" : "s"} on the nice list.`;
}

export function buildPlaylistsEmbed(
  playlists: PlaylistSummary[],
  userTag?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle("📁 Your Playlists")
    .setTimestamp();

  if (userTag) embed.setAuthor({ name: userTag });

  if (playlists.length === 0) {
    embed.setDescription(
      "No playlists yet.\nUse `/playlist create` or ask Stacy to create one.",
    );
    return embed;
  }

  const lines = playlists.map(
    (p) =>
      `**${p.name}** — ${p.trackCount} track${p.trackCount === 1 ? "" : "s"}`,
  );
  embed.setDescription(
    `**${playlists.length}** playlist${playlists.length === 1 ? "" : "s"} (only you can edit them)\n\n${lines.join("\n")}`,
  );
  embed.setFooter({ text: "Use /playlist tracks <name> to see songs" });
  return embed;
}

export function buildPlaylistTracksEmbed(
  playlistName: string,
  tracks: PlaylistTrack[],
  userTag?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle(`🎵 ${playlistName}`)
    .setTimestamp();

  if (userTag) embed.setAuthor({ name: userTag });

  if (tracks.length === 0) {
    embed.setDescription(
      "This playlist is empty.\nUse `/playlist add` to save a track.",
    );
    return embed;
  }

  const lines = tracks.map(
    (t) => `**${t.name}**\n${describePlaylistTrack(t)}`,
  );
  const body = lines.join("\n\n");

  if (body.length <= EMBED_DESCRIPTION_MAX_LENGTH) {
    embed.setDescription(
      `**${tracks.length}** track${tracks.length === 1 ? "" : "s"}\n\n${body}`,
    );
    return embed;
  }

  const fields = tracks.slice(0, 25).map((t) => ({
    name: t.name,
    value: clampFieldValue(describePlaylistTrack(t)),
    inline: false,
  }));
  embed.addFields(fields);
  if (tracks.length > 25) {
    embed.setFooter({ text: `Showing 25 of ${tracks.length} tracks` });
  }
  return embed;
}

export function playlistsSummaryForModel(count: number): string {
  if (count === 0) return "You have no playlists.";
  return `Listed ${count} playlist${count === 1 ? "" : "s"} in an embed.`;
}

export function playlistTracksSummaryForModel(
  playlistName: string,
  count: number,
): string {
  if (count === 0) return `Playlist "${playlistName}" is empty.`;
  return `Listed ${count} track${count === 1 ? "" : "s"} in playlist "${playlistName}".`;
}
