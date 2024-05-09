import { EMBED_DESCRIPTION_MAX_LENGTH, emojis } from "@/constants/constants";
import { lyricsExtractor as lyricsExtractorSuper } from "@discord-player/extractor";
import { useMainPlayer, usePlayer, useQueue } from "discord-player";
import { EmbedBuilder, Message } from "discord.js";
import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";

import { queueEmbedResponse } from "../utils/music/musicUtil";

const lyricsExtractor = lyricsExtractorSuper();

const playMusicSchema = z.object({
  songName: z.string().describe("The name of the song to play."),
  artist: z.string().optional().describe("The artist of the song."),
  url: z.string().optional().describe("The URL of the song."),
  message: z.custom<Message>(),
});

export const playSongTool = new DynamicStructuredTool({
  name: "playSong",
  description: "Plays a song.",
  schema: playMusicSchema,
  func: async ({ songName, artist, url, message }) => {
    try {
      const player = useMainPlayer();
      const voiceChannel = message.member?.voice.channel;

      if (!voiceChannel) {
        message.reply("You need to be in a voice channel to play music!");
        return "";
      }

      const query = `${songName} ${artist ? `by ${artist}` : ""}`;
      const searchResult = await player.search(url ?? query, {
        requestedBy: message.member.user,
      });

      if (!searchResult?.hasTracks()) {
        message.reply("No tracks found.");
        return "";
      }

      const { track } = await player.play(voiceChannel, query, {
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
      console.error(`Error: ${error}`);
      message.reply(`Failed to play song. ${error}`);
    }

    return "";
  },
});

export const pauseOrResumeSongTool = new DynamicStructuredTool({
  name: "pauseOrResumeSong",
  description: "Pauses or resumes the current song.",
  schema: z.object({
    message: z.custom<Message>(),
  }),
  func: async ({ message }) => {
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply(
          "You need to be in a voice channel to pause/resume music!",
        );
        return "";
      }

      const guildPlayerNode = usePlayer(message.guild.id);
      if (!guildPlayerNode) throw new Error("No player node found.");

      const newPauseState = !guildPlayerNode.isPaused();
      guildPlayerNode.setPaused(newPauseState);

      await message.reply(
        `${emojis.success} ${message.member}, ${newPauseState ? "paused" : "resumed"} playback`,
      );
    } catch (error) {
      console.error(`Error: ${error}`);
      message.reply(`Failed to pause/resume song. ${error}`);
    }

    return "";
  },
});

export const skipSongTool = new DynamicStructuredTool({
  name: "skipSong",
  description: "Skips the current song.",
  schema: z.object({
    message: z.custom<Message>(),
  }),
  func: async ({ message }) => {
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply("You need to be in a voice channel to skip music!");
        return "";
      }

      const guildPlayerNode = usePlayer(message.guild.id);
      if (!guildPlayerNode) throw new Error("No player node found.");
      guildPlayerNode.skip();
      await message.reply(
        `${emojis.success} ${message.member}, skipped the current song`,
      );
    } catch (error) {
      console.error(`Error: ${error}`);
      message.reply(`Failed to skip song. ${error}`);
    }

    return "";
  },
});

export const viewSongQueueTool = new DynamicStructuredTool({
  name: "viewSongQueue",
  description: "Views the current song queue.",
  schema: z.object({
    message: z.custom<Message>(),
  }),
  func: async ({ message }) => {
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply(
          "You need to be in a voice channel to view the song queue!",
        );
        return "";
      }

      const queue = useQueue(message.guild.id);
      if (!queue) {
        message.reply({
          content: `${emojis.error} ${message.member}, queue is currently empty.`,
        });
        return "";
      }

      // Show queue, interactive
      queueEmbedResponse(message, queue);
    } catch (error) {
      console.error(`Error: ${error}`);
      message.reply(`Failed to view song queue. ${error}`);
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
    message: z.custom<Message>(),
  }),
  func: async ({ songName, artist, message }) => {
    try {
      if (!message?.guild?.id) throw new Error("No guild found.");

      const query =
        useQueue(message.guild.id)?.currentTrack?.title ??
        `${songName} ${artist ? `by ${artist}` : ""}`;
      if (!query) {
        message.reply(
          `${emojis.error} ${message.member}, please provide a query, currently playing song can only be used when playback is active - this command has been cancelled`,
        );
        return "";
      }

      const res = await lyricsExtractor.search(query).catch(() => null);
      if (!res) {
        message.reply(
          `${emojis.error} ${message.member}, could not find lyrics for **\`${query}\`**, please try a different query`,
        );
        return "";
      }

      const {
        title,
        fullTitle,
        thumbnail,
        image,
        url,
        artist: resolvedArtist,
        lyrics,
      } = res;

      let description = lyrics;
      if (description && description.length > EMBED_DESCRIPTION_MAX_LENGTH)
        description =
          description.slice(0, EMBED_DESCRIPTION_MAX_LENGTH - 3) + "...";

      const lyricsEmbed = new EmbedBuilder()
        .setColor(1752220)
        .setTitle(title ?? "Unknown")
        .setAuthor({
          name: resolvedArtist.name ?? "Unknown",
          url: resolvedArtist.url ?? null,
          iconURL: resolvedArtist.image ?? null,
        })
        .setDescription(description ?? "Instrumental")
        .setURL(url);

      if (image || thumbnail) lyricsEmbed.setImage(image ?? thumbnail);
      if (fullTitle) lyricsEmbed.setFooter({ text: fullTitle });

      await message.reply({ embeds: [lyricsEmbed] });
    } catch (error) {
      console.error(`Error: ${error}`);
      message.reply(`Failed to get lyrics. ${error}`);
    }

    return "";
  },
});
