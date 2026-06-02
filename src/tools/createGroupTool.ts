import {
  addMembersToGroup,
  formatBulkGroupDiscordMessage,
  formatBulkGroupToolResult,
} from "@/utils/bulkGroupMembers";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const createGroupTool = new DynamicStructuredTool({
  name: "createGroup",
  description:
    "Create a user group and add multiple members in one step. " +
    "ONLY for Equality role, server admins, or bot owner. Prefer this over multiple manageUserGroup calls when " +
    'creating a group with several people (e.g. "create cs2 with me, will, ryley, and kevin"). ' +
    "The name me refers to the person who sent the message.",
  schema: z.object({
    group: z.string().describe("The group name."),
    members: z
      .array(z.string())
      .min(1)
      .describe(
        "People to add — one name per entry (e.g. [\"me\", \"will\", \"ryley\", \"kevin\"]).",
      ),
  }),
  func: async ({ group, members }, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply(denied);
      return toolError(denied);
    }

    if (!group.trim()) {
      const text = "Group name is required.";
      await message.reply(text);
      return toolError(text);
    }

    if (members.length === 0) {
      const text = "At least one member is required.";
      await message.reply(text);
      return toolError(text);
    }

    try {
      const outcome = addMembersToGroup(message, group, members);
      const discordText = formatBulkGroupDiscordMessage(group, outcome);
      await message.reply(discordText);
      return formatBulkGroupToolResult(group, outcome);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(`Failed to create group. ${text}`);
      return toolError(text);
    }
  },
});
