import {
  addMemberToGroup,
  deleteGroup,
  removeMemberFromGroup,
} from "@/db/userGroups";
import { displayNameForUserId } from "@/constants/people";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { resolveGroupMemberId } from "@/utils/resolveGroupMember";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const manageUserGroupTool = new DynamicStructuredTool({
  name: "manageUserGroup",
  description:
    "Add or remove a person from a user group, or delete a group entirely. " +
    "ONLY for Equality role users. Use when they ask to add someone to a group, " +
    'remove someone from a group, or delete a group (e.g. "add ben to cs2", ' +
    '"remove @ashwin from baldurs gate", "delete the cs2 group"). ' +
    "For user, pass a known contact name, @mention, or leave user empty if they @mentioned someone in the message.",
  schema: z.object({
    action: z
      .enum(["add", "remove", "delete"])
      .describe("Whether to add a member, remove a member, or delete the whole group."),
    group: z.string().describe("The group name."),
    user: z
      .string()
      .optional()
      .describe("Person to add or remove (name or mention). Omit for delete."),
  }),
  func: async ({ action, group, user }, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply(denied);
      return "";
    }

    try {
      if (action === "delete") {
        const deleted = deleteGroup(message.guildId, group);
        await message.reply(
          deleted
            ? `Deleted group **${group}**.`
            : `No group called **${group}** exists.`,
        );
        return "";
      }

      const userId = resolveGroupMemberId(message, user ?? "");
      if (!userId) {
        await message.reply(
          `I couldn't figure out who to ${action}. Use a @mention or a known name.`,
        );
        return "";
      }

      const label = displayNameForUserId(userId, message.guildId);

      if (action === "add") {
        const { created } = addMemberToGroup(message.guildId, group, userId);
        await message.reply(
          created
            ? `Created **${group}** and added **${label}**.`
            : `Added **${label}** to **${group}**.`,
        );
      } else {
        const removed = removeMemberFromGroup(message.guildId, group, userId);
        await message.reply(
          removed
            ? `Removed **${label}** from **${group}**.`
            : `**${label}** wasn't in **${group}** (or the group doesn't exist).`,
        );
      }
    } catch (error) {
      await message.reply(`Failed to update group. ${error}`);
      throw error;
    }
    return "";
  },
});
