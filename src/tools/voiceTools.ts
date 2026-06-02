import { playHelloClip } from "@/utils/music/playHelloClip";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
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
        await message.reply(
          "Hello! It's nice to meet you. How can I help you today?",
        );
        return "";
      }

      if (!message.guild?.voiceAdapterCreator) {
        throw new Error("Voice adapter creator not found.");
      }

      await playHelloClip({
        voiceChannel,
        textChannel: message.channel,
        member: message.member,
      });
    } catch (error) {
      console.error("[comeSayHello]", error);
      await message.reply(truncateMessage(`Failed to say hello. ${error}`));
    }

    return "";
  },
});
