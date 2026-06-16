import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getTrackFromPlaylist,
  listPlaylistTracks,
  listPlaylists,
  pickRandomTrackFromPlaylist,
  removeTrackFromPlaylist,
  renamePlaylist,
  updateTrackInPlaylist,
} from "@/db/playlists";
import {
  buildPlaylistTracksEmbed,
  buildPlaylistsEmbed,
} from "@/utils/directoryEmbeds";
import { ACTION_COLORS, buildActionEmbed } from "@/utils/actionEmbeds";
import {
  defaultTrackLabelFromTitle,
  resolveTrackAddFromInput,
} from "@/utils/music/currentTrack";
import {
  playTargetFromPlaylistTrack,
  playTrack,
} from "@/utils/music/playTrack";
import { replyDenied, replyError } from "@/utils/slashReply";
import { truncateMessage } from "@/utils/truncateMessage";
import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Manage your personal music playlists")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new playlist")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a playlist and all its tracks")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("rename")
        .setDescription("Rename a playlist")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Current playlist name")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("new_name")
            .setDescription("New playlist name")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all your playlists"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("tracks")
        .setDescription("List tracks in a playlist")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Playlist name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription(
          "Add a track (omit title/url to save now playing with its URL)",
        )
        .addStringOption((opt) =>
          opt.setName("playlist").setDescription("Playlist name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("track")
            .setDescription("Short label (defaults to song title if omitted)"),
        )
        .addStringOption((opt) =>
          opt
            .setName("title")
            .setDescription("Display title when url is set"),
        )
        .addStringOption((opt) =>
          opt.setName("artist").setDescription("Artist (optional)"),
        )
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("http(s) URL — omit with title to use now playing"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a track from a playlist")
        .addStringOption((opt) =>
          opt.setName("playlist").setDescription("Playlist name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("track").setDescription("Track label").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("update")
        .setDescription("Update a track on a playlist")
        .addStringOption((opt) =>
          opt.setName("playlist").setDescription("Playlist name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("track")
            .setDescription("Current track label")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("new_track").setDescription("New track label"),
        )
        .addStringOption((opt) =>
          opt.setName("title").setDescription("New song title"),
        )
        .addStringOption((opt) =>
          opt.setName("artist").setDescription("New artist"),
        )
        .addStringOption((opt) =>
          opt.setName("url").setDescription("New http(s) URL"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Play a track from a playlist (random if no track)")
        .addStringOption((opt) =>
          opt.setName("playlist").setDescription("Playlist name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("track")
            .setDescription("Track label — omit for a random song"),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "create") {
        const name = interaction.options.getString("name", true);
        createPlaylist(userId, name);
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: "Playlist created",
              description: `Created playlist **${name.trim()}**.`,
              color: ACTION_COLORS.success,
              footer: "Playlists",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "delete") {
        const name = interaction.options.getString("name", true);
        const deleted = deletePlaylist(userId, name);
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: deleted ? "Playlist deleted" : "Playlist not found",
              description: deleted
                ? `Deleted playlist **${name.trim()}**.`
                : `You don't have a playlist named **${name.trim()}**.`,
              color: deleted ? ACTION_COLORS.success : ACTION_COLORS.warning,
              footer: "Playlists",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "rename") {
        const name = interaction.options.getString("name", true);
        const newName = interaction.options.getString("new_name", true);
        const renamed = renamePlaylist(userId, name, newName);
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: renamed ? "Playlist renamed" : "Playlist not found",
              description: renamed
                ? `Renamed **${name.trim()}** → **${newName.trim()}**.`
                : `You don't have a playlist named **${name.trim()}**.`,
              color: renamed ? ACTION_COLORS.success : ACTION_COLORS.warning,
              footer: "Playlists",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "list") {
        const playlists = listPlaylists(userId);
        await interaction.reply({
          embeds: [buildPlaylistsEmbed(playlists, interaction.user.tag)],
          ephemeral: true,
        });
        return;
      }

      if (sub === "tracks") {
        const name = interaction.options.getString("name", true);
        const tracks = listPlaylistTracks(userId, name);
        await interaction.reply({
          embeds: [
            buildPlaylistTracksEmbed(name.trim(), tracks, interaction.user.tag),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "add") {
        const playlist = interaction.options.getString("playlist", true);
        const track = interaction.options.getString("track") ?? undefined;
        const title = interaction.options.getString("title") ?? undefined;
        const artist = interaction.options.getString("artist") ?? undefined;
        const url = interaction.options.getString("url") ?? undefined;
        const resolved = resolveTrackAddFromInput(interaction.guildId, {
          title,
          artist,
          url,
        });
        const label =
          track?.trim() || defaultTrackLabelFromTitle(resolved.title);
        addTrackToPlaylist(userId, playlist, label, {
          title: resolved.title,
          artist: resolved.artist,
          url: resolved.url,
        });
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: "Track added",
              description: `Added **${label}** to **${playlist.trim()}** — [${resolved.title}](${resolved.url})`,
              color: ACTION_COLORS.success,
              footer: "Playlists",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "remove") {
        const playlist = interaction.options.getString("playlist", true);
        const track = interaction.options.getString("track", true);
        const removed = removeTrackFromPlaylist(userId, playlist, track);
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: removed ? "Track removed" : "Track not found",
              description: removed
                ? `Removed **${track.trim()}** from **${playlist.trim()}**.`
                : `**${track.trim()}** isn't on **${playlist.trim()}**.`,
              color: removed ? ACTION_COLORS.success : ACTION_COLORS.warning,
              footer: "Playlists",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "update") {
        const playlist = interaction.options.getString("playlist", true);
        const track = interaction.options.getString("track", true);
        const newTrack = interaction.options.getString("new_track") ?? undefined;
        const title = interaction.options.getString("title");
        const artist = interaction.options.getString("artist");
        const url = interaction.options.getString("url");
        if (
          !newTrack?.trim() &&
          title === null &&
          artist === null &&
          url === null
        ) {
          await replyDenied(
            interaction,
            "Provide a new track name, title, artist, and/or URL.",
          );
          return;
        }
        const updated = updateTrackInPlaylist(userId, playlist, track, {
          newName: newTrack,
          title: title ?? undefined,
          artist: artist ?? undefined,
          url: url ?? undefined,
        });
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: updated ? "Track updated" : "Track not found",
              description: updated
                ? `Updated **${track.trim()}** on **${playlist.trim()}**.`
                : `**${track.trim()}** isn't on **${playlist.trim()}**.`,
              color: updated ? ACTION_COLORS.success : ACTION_COLORS.warning,
              footer: "Playlists",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (sub === "play") {
        const playlist = interaction.options.getString("playlist", true);
        const trackLabel = interaction.options.getString("track");
        const track = trackLabel?.trim()
          ? getTrackFromPlaylist(userId, playlist, trackLabel)
          : pickRandomTrackFromPlaylist(userId, playlist);

        if (!track) {
          await interaction.reply({
            embeds: [
              buildActionEmbed({
                title: "Can't play",
                description: trackLabel?.trim()
                  ? `**${trackLabel.trim()}** isn't on **${playlist.trim()}**.`
                  : `**${playlist.trim()}** is empty or doesn't exist.`,
                color: ACTION_COLORS.warning,
                footer: "Playlists",
              }),
            ],
            ephemeral: true,
          });
          return;
        }

        if (!interaction.channel?.isSendable()) {
          await replyDenied(interaction, "Can't play music in this channel.");
          return;
        }

        await interaction.deferReply();

        const member = interaction.member as GuildMember | null;
        const ok = await playTrack(
          {
            channel: interaction.channel,
            member,
            user: interaction.user,
            reply: async (text) => {
              await interaction.editReply({ content: truncateMessage(text) });
            },
          },
          playTargetFromPlaylistTrack(track),
        );

        if (ok) {
          await interaction.editReply({
            embeds: [
              buildActionEmbed({
                title: "Now playing",
                description: `Playing **${track.name}** from **${playlist.trim()}**.`,
                color: ACTION_COLORS.success,
                footer: "Playlists",
              }),
            ],
          });
        }
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
