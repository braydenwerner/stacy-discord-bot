import { __dirname } from "@/constants/constants";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { QueryType, useMainPlayer } from "discord-player";
import { Message } from "discord.js";
import { z } from "zod";

// See note in musicPlayerTools.ts: zod v4 cannot serialize `z.custom` to JSON Schema,
// so we use an unconstrained schema while preserving the `Message` type.
const messageSchema = z.any() as unknown as z.ZodType<Message>;

export const comeSayHelloTool = new DynamicStructuredTool({
  name: "comeSayHello",
  description: "Stacy join the channel and say hello to you.",
  schema: z.object({
    message: messageSchema,
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
