import { type CustomClient } from "@/index";
import { EmbedBuilder } from "@discordjs/builders";
import { useMainPlayer } from "discord-player";
import { Message } from "discord.js";
import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";

export const MUSIC_PLAYER = "musicPlayer";

const playMusicSchema = z.object({
  songName: z.string().describe("The name of the song to play."),
  artist: z.string().optional().describe("The artist of the song."),
  url: z.string().optional().describe("The URL of the song."),
  client: z.custom<CustomClient>(),
  message: z.custom<Message>(),
});

export const musicPlayerTool = new DynamicStructuredTool({
  name: MUSIC_PLAYER,
  description: "Can play music.",
  schema: playMusicSchema,
  func: async ({ songName, artist, url, client, message }) => {
    const player = useMainPlayer();

    const voiceChannel = message.member?.voice.channel;

    if (!songName) throw new Error("No song provided.");
    if (!voiceChannel) {
      message.reply("You need to be in a voice channel to play music!");
      return "";
    }
    if (!message.guild) throw new Error("No guild found.");
    if (!message.member.user) throw new Error("No interaction found.");

    try {
      const query = `${songName} ${artist ? `by ${artist}` : ""}`;
      const searchResult = await player.search(url ?? query, {
        requestedBy: message.member.user,
      });

      console.log(searchResult);

      if (!searchResult?.hasTracks()) {
        console.error("No tracks found.");
        message.reply("No tracks found.");
        return "";
      }

      const result = await player.play(voiceChannel, searchResult, {
        nodeOptions: {
          leaveOnEnd: true,
          metadata: {
            channel: message.channel,
            member: message.member,
            timestamp: new Date(),
          },
        },
      });
      // The logs below look fine
      console.log(result.track.author);

      if (result === null || !result.track) {
        throw new Error("Failed to play song.");
      }

      message.reply(
        `Now playing: ${songName} by ${artist ?? "unknown artist"}`,
      );
    } catch (error) {
      console.error(`Error: ${error}`);
      message.reply("Failed to play song.");
    }

    return "";
  },
});
