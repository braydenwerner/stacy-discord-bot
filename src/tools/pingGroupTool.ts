import { resolveGroupIds } from "@/constants/people";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const pingGroupTool = new DynamicStructuredTool({
  name: "pingGroup",
  description:
    "Ping (mention) everyone in a known group and relay a message to them. " +
    'ONLY use this when the user explicitly asks to ping/notify/message a group ' +
    '(e.g. "ping the baldurs gate group, let\'s do tuesday?"). ' +
    "The person who sent the request is automatically excluded from the ping. " +
    "Known groups: baldurs gate.",
  schema: z.object({
    group: z.string().describe("The group to ping (e.g. 'baldurs gate')."),
    text: z.string().describe("The message to relay to the group."),
  }),
  func: async ({ group, text }, _runManager, config) => {
    const message = getToolMessage(config);
    try {
      const ids = resolveGroupIds(group);
      if (!ids) {
        message.reply(`I don't know a group called "${group}".`);
        return "";
      }

      // Exclude whoever sent the request.
      const targets = ids.filter((id) => id !== message.author.id);
      if (targets.length === 0) {
        message.reply("There's no one else in that group to ping.");
        return "";
      }

      if (!message.channel.isSendable()) {
        throw new Error("Cannot send messages in this channel.");
      }

      // `<@id>` renders in Discord as each person's @username (and pings them).
      const mentions = targets.map((id) => `<@${id}>`).join(" ");
      await message.channel.send(`${mentions} ${text}`.trim());
    } catch (error) {
      message.reply(`Failed to ping the group. ${error}`);
      throw error;
    }
    return "";
  },
});
