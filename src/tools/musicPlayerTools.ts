import { EMBED_DESCRIPTION_MAX_LENGTH, emojis } from "@/constants/constants";
// import { lyricsExtractor as lyricsExtractorSuper } from "@discord-player/extractor";
import { truncateMessage } from "@/utils/truncateMessage";
import { formatErrorForUser } from "@/utils/formatError";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { QueryType, useMainPlayer, usePlayer, useQueue } from "discord-player";
import { EmbedBuilder, Message } from "discord.js";
import { z } from "zod";

import {
  getTrackFromPlaylist,
  pickRandomTrackFromPlaylist,
} from "@/db/playlists";
import { buildLyricsSearchQuery } from "@/utils/music/currentTrack";
import { queueEmbedResponse } from "../utils/music/musicUtil";
import { createOrUpdateContextPanel } from "../utils/music/musicContextPanel";
import {
  playContextFromMessage,
  playTargetFromPlaylistTrack,
  playTrack,
  type PlayTarget,
} from "../utils/music/playTrack";

// const lyricsExtractor = lyricsExtractorSuper();

// The Discord message is injected by our own code at invoke time, never by the LLM.
// We pass it through the tool's runtime config (not its schema) so it never appears
// in the JSON Schema sent to the model — saving tokens and avoiding confusing the LLM.
function getMessage(config?: RunnableConfig): Message {
  const message = (config?.configurable as { message?: Message } | undefined)
    ?.message;
  if (!message) throw new Error("No Discord message provided to tool.");
  return message;
}

const playMusicSchema = z.object({
  songName: z.string().optional().describe("The name of the song to play."),
  artist: z.string().optional().describe("The artist of the song."),
  url: z.string().optional().describe("The URL of the song."),
  playlist: z
    .string()
    .optional()
    .describe(
      "Name of one of the requester's personal playlists to play from.",
    ),
  trackName: z
    .string()
    .optional()
    .describe(
      "Short label of a track on that playlist. Omit with playlist set to pick a random track.",
    ),
});

export const playSongTool = new DynamicStructuredTool({
  name: "playSong",
  description:
    "Plays a song. ONLY PROVIDE A URL IF GIVEN. " +
    "Use playlist (+ optional trackName) to play from the requester's saved playlists; random if trackName omitted.",
  schema: playMusicSchema,
  func: async (
    { songName, artist, url, playlist, trackName },
    _runManager,
    config,
  ) => {
    const message = getMessage(config);
    try {
      const ctx = playContextFromMessage(message);
      let target: PlayTarget = { url, songName, artist };
      let playLabel: string | undefined;
      let playPlaylist: string | undefined;

      if (playlist?.trim()) {
        const playlistLabel = playlist.trim();
        playPlaylist = playlistLabel;
        const track = trackName?.trim()
          ? getTrackFromPlaylist(
              message.author.id,
              playlistLabel,
              trackName,
            )
          : pickRandomTrackFromPlaylist(message.author.id, playlistLabel);

        if (!track) {
          await ctx.reply(
            trackName?.trim()
              ? `**${trackName.trim()}** isn't on playlist **${playlistLabel}**.`
              : `Playlist **${playlistLabel}** is empty or doesn't exist.`,
          );
          return "";
        }
        target = playTargetFromPlaylistTrack(track);
        playLabel = track.name;
      }

      const query = target.url || `${target.songName ?? ""} ${target.artist ? `by ${target.artist}` : ""}`.trim();
      console.log("query: ", query);

      const ok = await playTrack(ctx, target);
      if (ok && playLabel && playPlaylist) {
        await message.reply(
          truncateMessage(
            `Playing **${playLabel}** from playlist **${playPlaylist}**.`,
          ),
        );
      }
    } catch (error) {
      message.reply(truncateMessage(`Failed to play song. ${formatErrorForUser(error)}`));
    }

    return "";
  },
});

export const pauseOrResumeSongTool = new DynamicStructuredTool({
  name: "pauseOrResumeSong",
  description: "Pauses or resumes the current song.",
  schema: z.object({}),
  func: async (_input, _runManager, config) => {
    const message = getMessage(config);
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply(
          truncateMessage("You need to be in a voice channel to pause/resume music!"),
        );
        return "";
      }

      const guildPlayerNode = usePlayer(message.guild.id);
      if (!guildPlayerNode) throw new Error("No player node found.");

      const newPauseState = !guildPlayerNode.isPaused();
      guildPlayerNode.setPaused(newPauseState);

      await message.reply(
        truncateMessage(`${emojis.success} ${message.member}, ${newPauseState ? "paused" : "resumed"} playback`),
      );
    } catch (error) {
      message.reply(truncateMessage(`Failed to pause/resume song. ${formatErrorForUser(error)}`));
    }

    return "";
  },
});

export const skipSongTool = new DynamicStructuredTool({
  name: "skipSong",
  description: "Skips the current song.",
  schema: z.object({}),
  func: async (_input, _runManager, config) => {
    const message = getMessage(config);
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply(truncateMessage("You need to be in a voice channel to skip music!"));
        return "";
      }

      const guildPlayerNode = usePlayer(message.guild.id);
      if (!guildPlayerNode) throw new Error("No player node found.");
      guildPlayerNode.skip();
      await message.reply(
        truncateMessage(`${emojis.success} ${message.member}, skipped the current song`),
      );
    } catch (error) {
      message.reply(truncateMessage(`Failed to skip song. ${formatErrorForUser(error)}`));
    }

    return "";
  },
});

export const viewSongQueueTool = new DynamicStructuredTool({
  name: "viewSongQueue",
  description: "Views the current song queue.",
  schema: z.object({}),
  func: async (_input, _runManager, config) => {
    const message = getMessage(config);
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply(
          truncateMessage("You need to be in a voice channel to view the song queue!"),
        );
        return "";
      }

      const queue = useQueue(message.guild.id);
      if (!queue) {
        message.reply({
          content: truncateMessage(`${emojis.error} ${message.member}, queue is currently empty.`),
        });
        return "";
      }

      // Show queue in unified context panel
      await createOrUpdateContextPanel(message, queue, "queue");
    } catch (error) {
      message.reply(truncateMessage(`Failed to view song queue. ${formatErrorForUser(error)}`));
    }

    return "";
  },
});

export const lyricsTool = new DynamicStructuredTool({
  name: "lyrics",
  description:
    "Gets lyrics for a song. Omit songName and artist to use the track currently playing in this server.",
  schema: z.object({
    songName: z
      .string()
      .optional()
      .describe(
        "Song title. Omit when the user wants lyrics for whatever is playing now.",
      ),
    artist: z
      .string()
      .optional()
      .describe("Artist name. Omit with songName to default to now playing."),
  }),
  func: async ({ songName, artist }, _runManager, config) => {
    const message = getMessage(config);
    try {
      const player = useMainPlayer();

      if (!message?.guild?.id) throw new Error("No guild found.");

      const query = buildLyricsSearchQuery(message.guild.id, {
        songName,
        artist,
      });
      if (!query) {
        message.reply(
          truncateMessage(
            `${emojis.error} ${message.member}, nothing is playing right now — name a song or start playback first.`,
          ),
        );
        return "";
      }

      const res = await player.lyrics.search({ q: query }).catch(() => null);
      if (!res?.length) {
        message.reply(
          truncateMessage(`${emojis.error} ${message.member}, could not find lyrics for **\`${query}\`**, please try a different query`),
        );
        return "";
      }

      const { name, artistName, plainLyrics } = res[0];

      // Show lyrics in unified context panel
      const queue = useQueue(message.guild.id);
      if (queue) {
        await createOrUpdateContextPanel(
          message,
          queue,
          "lyrics",
          { name, artistName, plainLyrics }
        );
      } else {
        // Fallback if no queue (shouldn't happen but just in case)
        let description = plainLyrics;
        if (description && description.length > EMBED_DESCRIPTION_MAX_LENGTH)
          description =
            description.slice(0, EMBED_DESCRIPTION_MAX_LENGTH - 3) + "...";

        const lyricsEmbed = new EmbedBuilder()
          .setColor(1752220)
          .setTitle(name ?? "Unknown")
          .setAuthor({
            name: artistName ?? "Unknown",
          })
          .setDescription(description ?? "Instrumental");

        if (name) lyricsEmbed.setFooter({ text: name });

        await message.reply({ embeds: [lyricsEmbed] });
      }
    } catch (error) {
      message.reply(truncateMessage(`Failed to get lyrics. ${formatErrorForUser(error)}`));
    }

    return "";
  },
});

import { nowPlayingTool } from "./nowPlayingTool";

export const musicTools = [
  playSongTool,
  pauseOrResumeSongTool,
  skipSongTool,
  viewSongQueueTool,
  lyricsTool,
  nowPlayingTool,
];
