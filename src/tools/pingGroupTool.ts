import { groupDb } from "@/utils/database";
import { getToolMessage } from "@/utils/getToolMessage";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const pingGroupTool = new DynamicStructuredTool({
  name: "pingGroup",
  description:
    "Ping (mention) everyone in a known group and relay a message to them. " +
    'ONLY use this when the user explicitly asks to ping/notify/message a group ' +
    '(e.g. "send \'let\'s play tonight\' to the gaming group"). ' +
    "The person who sent the request is automatically excluded from the ping.",
  schema: z.object({
    group: z.string().describe("The name of the group to ping"),
    text: z.string().describe("The message to relay to the group."),
  }),
  func: async ({ group, text }, _runManager, config) => {
    const message = getToolMessage(config);
    try {
      const groupData = groupDb.getGroupWithMembers(group);
      if (!groupData) {
        message.reply(`I don't know a group called "${group}".`);
        return "";
      }

      const targets = groupData.members.filter((id) => id !== message.author.id);
      if (targets.length === 0) {
        message.reply("There's no one else in that group to ping.");
        return "";
      }

      if (!message.channel.isSendable()) {
        throw new Error("Cannot send messages in this channel.");
      }

      const mentions = targets.map((id) => `<@${id}>`).join(" ");
      const fullMessage = `${mentions} ${text}`.trim();
      const truncatedMessage = truncateMessage(fullMessage);
      await message.channel.send(truncatedMessage);
    } catch (error) {
      message.reply(`Failed to ping the group. ${error}`);
      throw error;
    }
    return "";
  },
});
