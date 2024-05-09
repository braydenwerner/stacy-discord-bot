import { __dirname } from "@/constants/constants";
import { QueryType, useMainPlayer } from "discord-player";
import { Message } from "discord.js";
import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";

export const comeSayHelloTool = new DynamicStructuredTool({
  name: "comeSayHello",
  description: "Stacy join the channel and say hello to you.",
  schema: z.object({
    message: z.custom<Message>(),
  }),
  func: async ({ message }) => {
    try {
      const voiceChannel = message.member?.voice.channel;
      if (!voiceChannel) {
        message.reply(
          "Hello! It's nice to meet you. How can I help you today?",
        );
        return "";
      }

      if (!message.guildId) throw new Error("Guild ID not found.");
      if (!message.guild?.voiceAdapterCreator)
        throw new Error("Voice adapter creator not found.");
      if (!message.member?.voice.channelId)
        throw new Error("Channel ID not found.");

      const player = useMainPlayer();
      player?.play(voiceChannel, "audio/hey_boys.mp3", {
        searchEngine: QueryType.FILE,
        nodeOptions: {
          metadata: {
            // this is important for the event listeners
            channel: message.channel,
            member: message.member,
            disableEmbeds: true,
          },
        },
      });
    } catch (error) {
      console.error(`Error: ${error}`);
      message.reply(`Failed to say hello. ${error}`);
    }

    return "";
  },
});
