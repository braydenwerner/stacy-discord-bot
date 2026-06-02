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
        .setDescription("Add a track to a playlist")
        .addStringOption((opt) =>
          opt.setName("playlist").setDescription("Playlist name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("track")
            .setDescription("Short label for this track")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Song title"),
        )
        .addStringOption((opt) =>
          opt.setName("artist").setDescription("Artist (optional)"),
        )
        .addStringOption((opt) =>
          opt.setName("url").setDescription("Direct http(s) link"),
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
          content: `Created playlist **${name.trim()}**.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "delete") {
        const name = interaction.options.getString("name", true);
        const deleted = deletePlaylist(userId, name);
        await interaction.reply({
          content: deleted
            ? `Deleted playlist **${name.trim()}**.`
            : `You don't have a playlist named **${name.trim()}**.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "rename") {
        const name = interaction.options.getString("name", true);
        const newName = interaction.options.getString("new_name", true);
        const renamed = renamePlaylist(userId, name, newName);
        await interaction.reply({
          content: renamed
            ? `Renamed **${name.trim()}** → **${newName.trim()}**.`
            : `You don't have a playlist named **${name.trim()}**.`,
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
        const track = interaction.options.getString("track", true);
        const title = interaction.options.getString("title") ?? undefined;
        const artist = interaction.options.getString("artist") ?? undefined;
        const url = interaction.options.getString("url") ?? undefined;
        if (!title?.trim() && !url?.trim()) {
          await replyDenied(
            interaction,
            "Provide a **title** or **url** for the track.",
          );
          return;
        }
        addTrackToPlaylist(userId, playlist, track, { title, artist, url });
        await interaction.reply({
          content: `Added **${track.trim()}** to **${playlist.trim()}**.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "remove") {
        const playlist = interaction.options.getString("playlist", true);
        const track = interaction.options.getString("track", true);
        const removed = removeTrackFromPlaylist(userId, playlist, track);
        await interaction.reply({
          content: removed
            ? `Removed **${track.trim()}** from **${playlist.trim()}**.`
            : `**${track.trim()}** isn't on **${playlist.trim()}**.`,
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
          content: updated
            ? `Updated **${track.trim()}** on **${playlist.trim()}**.`
            : `**${track.trim()}** isn't on **${playlist.trim()}**.`,
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
            content: trackLabel?.trim()
              ? `**${trackLabel.trim()}** isn't on **${playlist.trim()}**.`
              : `**${playlist.trim()}** is empty or doesn't exist.`,
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
            content: truncateMessage(
              `Playing **${track.name}** from **${playlist.trim()}**.`,
            ),
          });
        }
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
