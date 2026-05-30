import { resolveUserId } from "@/constants/people";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const sendMessageTool = new DynamicStructuredTool({
  name: "sendMessage",
  description:
    "Send a message in the current channel that mentions (pings) one or more specific known people. " +
    "ONLY use this when the user explicitly asks to send, tell, relay, or deliver a message TO someone " +
    '(e.g. "send ben this", "tell michael that", "ping will and ryley about ..."). ' +
    "Do NOT use it just because a name appears in the message. " +
    "Known people: will, michael (use 'michael f' for Michael F., otherwise it defaults to Michael D.), aaron, ben, ryley, brayden, kevin.",
  schema: z.object({
    names: z
      .array(z.string())
      .min(1)
      .describe(
        "The name(s) of the people to message, e.g. ['ben'] or ['will', 'ryley'].",
      ),
    text: z.string().describe("The message to send to them."),
  }),
  func: async ({ names, text }, _runManager, config) => {
    const message = getToolMessage(config);
    try {
      const ids: string[] = [];
      const unknown: string[] = [];
      for (const name of names) {
        const id = resolveUserId(name);
        if (id) {
          if (!ids.includes(id)) ids.push(id);
        } else {
          unknown.push(name);
        }
      }

      if (ids.length === 0) {
        const list = unknown.map((n) => `"${n}"`).join(", ");
        message.reply(
          `I don't know who ${list} ${unknown.length === 1 ? "is" : "are"}.`,
        );
        return "";
      }

      if (!message.channel.isSendable()) {
        throw new Error("Cannot send messages in this channel.");
      }

      // `<@id>` renders in Discord as the person's @username (and pings them).
      const mentions = ids.map((id) => `<@${id}>`).join(" ");
      await message.channel.send(`${mentions} ${text}`.trim());
    } catch (error) {
      message.reply(`Failed to send message. ${error}`);
      throw error;
    }
    return "";
  },
});
