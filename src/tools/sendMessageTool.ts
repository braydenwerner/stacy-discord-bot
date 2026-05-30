import { resolveUserId } from "@/constants/people";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const sendMessageTool = new DynamicStructuredTool({
  name: "sendMessage",
  description:
    "Send a message in the current channel that mentions (pings) a specific known person. " +
    "ONLY use this when the user explicitly asks to send, tell, relay, or deliver a message TO someone " +
    '(e.g. "send ben this", "tell michael that", "let aaron know ..."). ' +
    "Do NOT use it just because a name appears in the message. " +
    "Known people: will, michael (use 'michael f' for Michael F., otherwise it defaults to Michael D.), aaron, ben, ryley, brayden.",
  schema: z.object({
    name: z
      .string()
      .describe("The name of the person to message (e.g. 'ben', 'michael f')."),
    text: z.string().describe("The message to send to them."),
  }),
  func: async ({ name, text }, _runManager, config) => {
    const message = getToolMessage(config);
    try {
      const userId = resolveUserId(name);
      if (!userId) {
        message.reply(`I don't know who "${name}" is.`);
        return "";
      }
      if (!message.channel.isSendable()) {
        throw new Error("Cannot send messages in this channel.");
      }
      // `<@id>` renders in Discord as the person's @username (and pings them).
      await message.channel.send(`<@${userId}> ${text}`.trim());
    } catch (error) {
      message.reply(`Failed to send message. ${error}`);
      throw error;
    }
    return "";
  },
});
