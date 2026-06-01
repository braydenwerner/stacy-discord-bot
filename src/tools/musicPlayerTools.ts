import { EMBED_DESCRIPTION_MAX_LENGTH, emojis } from "@/constants/constants";
// import { lyricsExtractor as lyricsExtractorSuper } from "@discord-player/extractor";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { useMainPlayer, usePlayer, useQueue } from "discord-player";
import { EmbedBuilder, Message } from "discord.js";
import { z } from "zod";

import { queueEmbedResponse } from "../utils/music/musicUtil";

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
});

export const playSongTool = new DynamicStructuredTool({
  name: "playSong",
  description: "Plays a song. ONLY PROVIDE A URL IF GIVEN.",
  schema: playMusicSchema,
  func: async ({ songName, artist, url }, _runManager, config) => {
    const message = getMessage(config);
    try {
      const player = useMainPlayer();
      const voiceChannel = message.member?.voice.channel;

      if (!voiceChannel) {
        message.reply(truncateMessage("You need to be in a voice channel to play music!"));
        return "";
      }

      const query = `${songName} ${artist ? `by ${artist}` : ""}`;
      console.log("query: ", url || query);
      const searchResult = await player.search(url || query, {
        // searchEngine: "YOUTUBE_SEARCH",
        requestedBy: message.member.user,
      });
      console.log("searchResult: ", searchResult);

      const { track } = await player.play(voiceChannel, searchResult, {
        nodeOptions: {
          metadata: {
            // this is important for the event listeners
            channel: message.channel,
            member: message.member,
          },
        },
      });

      if (!track) throw new Error("Failed to play song.");
    } catch (error) {
      message.reply(truncateMessage(`Failed to play song. ${error}`));
      throw error;
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
      message.reply(truncateMessage(`Failed to pause/resume song. ${error}`));
      throw error;
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
      message.reply(truncateMessage(`Failed to skip song. ${error}`));
      throw error;
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

      // Show queue, interactive
      queueEmbedResponse(message, queue);
    } catch (error) {
      message.reply(truncateMessage(`Failed to view song queue. ${error}`));
      throw error;
    }

    return "";
  },
});

export const lyricsTool = new DynamicStructuredTool({
  name: "lyrics",
  description: "Gets the lyrics for a song.",
  schema: z.object({
    songName: z
      .string()
      .optional()
      .describe("The name of the song to get lyrics for."),
    artist: z.string().optional().describe("The artist of the song."),
  }),
  func: async ({ songName, artist }, _runManager, config) => {
    const message = getMessage(config);
    try {
      const player = useMainPlayer();

      if (!message?.guild?.id) throw new Error("No guild found.");

      const query =
        useQueue(message.guild.id)?.currentTrack?.title ??
        `${songName} ${artist ? `by ${artist}` : ""}`;
      if (!query) {
        message.reply(
          truncateMessage(`${emojis.error} ${message.member}, please provide a query, currently playing song can only be used when playback is active - this command has been cancelled`),
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

      let description = plainLyrics;
      if (description && description.length > EMBED_DESCRIPTION_MAX_LENGTH)
        description =
          description.slice(0, EMBED_DESCRIPTION_MAX_LENGTH - 3) + "...";

      const lyricsEmbed = new EmbedBuilder()
        .setColor(1752220)
        .setTitle(name ?? "Unknown")
        .setAuthor({
          name: artistName ?? "Unknown",
          // url: url ?? null,
          // iconURL: image ?? null,
        })
        .setDescription(description ?? "Instrumental");
      // .setURL(url);

      // if (image || thumbnail) lyricsEmbed.setImage(image ?? thumbnail);
      if (name) lyricsEmbed.setFooter({ text: name });

      await message.reply({ embeds: [lyricsEmbed] });
    } catch (error) {
      message.reply(truncateMessage(`Failed to get lyrics. ${error}`));
      throw error;
    }

    return "";
  },
});

export const musicTools = [
  playSongTool,
  pauseOrResumeSongTool,
  skipSongTool,
  viewSongQueueTool,
  lyricsTool,
];
