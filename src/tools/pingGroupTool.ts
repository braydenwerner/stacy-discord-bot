import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { buildGroupPingContent } from "@/utils/pingGroupMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const pingGroupTool = new DynamicStructuredTool({
  name: "pingGroup",
  description:
    "Ping (mention) everyone in a user group and send them a message. " +
    "ONLY for Equality role users. Use when they ask to send or ping a group " +
    '(e.g. "send hey guys! to cs2", "ping the baldurs gate group"). ' +
    "Groups are stored in the database and managed with manageUserGroup / listUserGroups.",
  schema: z.object({
    group: z.string().describe("The group name."),
    text: z.string().describe("The message to send to the group."),
  }),
  func: async ({ group, text }, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply(denied);
      return "";
    }

    try {
      const result = buildGroupPingContent(
        message.guildId,
        group,
        text,
        message.author.id,
      );
      if ("error" in result) {
        await message.reply(result.error);
        return "";
      }

      if (!message.channel.isSendable()) {
        throw new Error("Cannot send messages in this channel.");
      }

      await message.channel.send(result.content);
    } catch (error) {
      await message.reply(`Failed to ping the group. ${error}`);
      throw error;
    }
    return "";
  },
});
