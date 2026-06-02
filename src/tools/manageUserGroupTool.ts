import {
  addMemberToGroup,
  deleteGroup,
  removeMemberFromGroup,
} from "@/db/userGroups";
import { displayNameForUserId } from "@/constants/people";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { resolveGroupMemberId } from "@/utils/resolveGroupMember";
import { toolError, toolOk } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const manageUserGroupTool = new DynamicStructuredTool({
  name: "manageUserGroup",
  description:
    "Add or remove one person from a user group, or delete a group. " +
    "ONLY for Equality role users. For multiple members at once, use createGroup instead. " +
    '"me" refers to the person who sent the message.',
  schema: z.object({
    action: z
      .enum(["add", "remove", "delete"])
      .describe("Whether to add a member, remove a member, or delete the whole group."),
    group: z.string().describe("The group name."),
    user: z
      .string()
      .optional()
      .describe("Person to add or remove (name, me, or mention). Omit for delete."),
  }),
  func: async ({ action, group, user }, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply(denied);
      return toolError(denied);
    }

    try {
      if (action === "delete") {
        const deleted = deleteGroup(message.guildId, group);
        const text = deleted
          ? `Deleted group **${group}**.`
          : `No group called **${group}** exists.`;
        await message.reply(text);
        return deleted
          ? toolOk(`Deleted group "${group}".`)
          : toolError(`No group called "${group}" exists.`);
      }

      const userId = resolveGroupMemberId(message, user ?? "");
      if (!userId) {
        const text = `I couldn't figure out who to ${action}. Use a @mention, me, or a known name.`;
        await message.reply(text);
        return toolError(text);
      }

      const label = displayNameForUserId(userId, message.guildId);

      if (action === "add") {
        const { created } = addMemberToGroup(message.guildId, group, userId);
        const text = created
          ? `Created **${group}** and added **${label}**.`
          : `Added **${label}** to **${group}**.`;
        await message.reply(text);
        return toolOk(
          created
            ? `Created "${group}" and added ${label}.`
            : `Added ${label} to "${group}".`,
        );
      }

      const removed = removeMemberFromGroup(message.guildId, group, userId);
      const text = removed
        ? `Removed **${label}** from **${group}**.`
        : `**${label}** wasn't in **${group}** (or the group doesn't exist).`;
      await message.reply(text);
      return removed
        ? toolOk(`Removed ${label} from "${group}".`)
        : toolError(
            `${label} wasn't in "${group}" (or the group doesn't exist).`,
          );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(`Failed to update group. ${text}`);
      return toolError(text);
    }
  },
});
