import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  listPlaylistTracks,
  listPlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
  updateTrackInPlaylist,
} from "@/db/playlists";
import {
  buildPlaylistTracksEmbed,
  buildPlaylistsEmbed,
  playlistTracksSummaryForModel,
  playlistsSummaryForModel,
} from "@/utils/directoryEmbeds";
import { getToolMessage } from "@/utils/getToolMessage";
import {
  defaultTrackLabelFromTitle,
  resolveTrackAddFromInput,
} from "@/utils/music/currentTrack";
import { toolError, toolOk } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const managePlaylistsTool = new DynamicStructuredTool({
  name: "managePlaylists",
  description:
    "Manage the message author's personal music playlists and tracks. Each user only their own data. " +
    "Playlists are named collections; each track has a short label plus a saved URL for exact replay. " +
    "For add_track when the user says add this song / currently playing: set playlist only (optional trackName) " +
    "and omit title/url — saves the guild's now-playing track using its URL. " +
    "Use create_playlist, delete_playlist, rename_playlist, list_playlists; " +
    "add_track, remove_track, update_track, list_tracks for tracks.",
  schema: z.object({
    action: z
      .enum([
        "create_playlist",
        "delete_playlist",
        "rename_playlist",
        "list_playlists",
        "add_track",
        "remove_track",
        "update_track",
        "list_tracks",
      ])
      .describe("Playlist or track operation."),
    playlist: z
      .string()
      .optional()
      .describe("Playlist name (required for most track actions)."),
    trackName: z
      .string()
      .optional()
      .describe("Short label for a track within the playlist."),
    newPlaylistName: z
      .string()
      .optional()
      .describe("New playlist name when renaming."),
    title: z
      .string()
      .optional()
      .describe("Display title when url is set. Omit with url to use now playing."),
    artist: z.string().optional().describe("Artist (optional)."),
    url: z
      .string()
      .optional()
      .describe(
        "http(s) URL for replay. Omit title and url to save now playing (uses its URL).",
      ),
    newName: z
      .string()
      .optional()
      .describe("New track label when updating."),
  }),
  func: async (input, _runManager, config) => {
    const message = getToolMessage(config);
    const userId = message.author.id;
    const {
      action,
      playlist,
      trackName,
      newPlaylistName,
      title,
      artist,
      url,
      newName,
    } = input;

    try {
      if (action === "list_playlists") {
        const playlists = listPlaylists(userId);
        await message.reply({
          embeds: [buildPlaylistsEmbed(playlists, message.author.tag)],
        });
        return toolOk(playlistsSummaryForModel(playlists.length));
      }

      if (action === "create_playlist") {
        if (!playlist?.trim()) {
          const text = "Playlist name is required.";
          await message.reply(text);
          return toolError(text);
        }
        createPlaylist(userId, playlist);
        await message.reply(`Created playlist **${playlist.trim()}**.`);
        return toolOk(`Created playlist "${playlist.trim()}".`);
      }

      if (action === "delete_playlist") {
        if (!playlist?.trim()) {
          const text = "Playlist name is required.";
          await message.reply(text);
          return toolError(text);
        }
        const deleted = deletePlaylist(userId, playlist);
        const text = deleted
          ? `Deleted playlist **${playlist.trim()}**.`
          : `You don't have a playlist named **${playlist.trim()}**.`;
        await message.reply(text);
        return deleted ? toolOk(text) : toolError(text);
      }

      if (action === "rename_playlist") {
        if (!playlist?.trim() || !newPlaylistName?.trim()) {
          const text = "Current and new playlist names are required.";
          await message.reply(text);
          return toolError(text);
        }
        const renamed = renamePlaylist(userId, playlist, newPlaylistName);
        const text = renamed
          ? `Renamed playlist **${playlist.trim()}** → **${newPlaylistName.trim()}**.`
          : `You don't have a playlist named **${playlist.trim()}**.`;
        await message.reply(text);
        return renamed ? toolOk(text) : toolError(text);
      }

      if (!playlist?.trim()) {
        const text = "Playlist name is required for track actions.";
        await message.reply(text);
        return toolError(text);
      }

      if (action === "list_tracks") {
        const tracks = listPlaylistTracks(userId, playlist);
        await message.reply({
          embeds: [
            buildPlaylistTracksEmbed(playlist.trim(), tracks, message.author.tag),
          ],
        });
        return toolOk(
          playlistTracksSummaryForModel(playlist.trim(), tracks.length),
        );
      }

      if (action === "add_track") {
        const resolved = resolveTrackAddFromInput(message.guildId, {
          title,
          artist,
          url,
        });
        const label =
          trackName?.trim() || defaultTrackLabelFromTitle(resolved.title);
        addTrackToPlaylist(userId, playlist, label, {
          title: resolved.title,
          artist: resolved.artist,
          url: resolved.url,
        });
        await message.reply(
          `Added **${label}** to **${playlist.trim()}** — [${resolved.title}](${resolved.url})`,
        );
        return toolOk(
          `Added "${label}" to playlist "${playlist.trim()}" with URL.`,
        );
      }

      if (!trackName?.trim()) {
        const text = "Track name is required.";
        await message.reply(text);
        return toolError(text);
      }

      if (action === "remove_track") {
        const removed = removeTrackFromPlaylist(userId, playlist, trackName);
        const text = removed
          ? `Removed **${trackName.trim()}** from **${playlist.trim()}**.`
          : `**${trackName.trim()}** isn't on **${playlist.trim()}**.`;
        await message.reply(text);
        return removed ? toolOk(text) : toolError(text);
      }

      const updated = updateTrackInPlaylist(userId, playlist, trackName, {
        newName,
        title,
        artist,
        url,
      });
      const text = updated
        ? `Updated **${trackName.trim()}** on **${playlist.trim()}**.`
        : `**${trackName.trim()}** isn't on **${playlist.trim()}**.`;
      await message.reply(text);
      return updated ? toolOk(text) : toolError(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(text);
      return toolError(text);
    }
  },
});
