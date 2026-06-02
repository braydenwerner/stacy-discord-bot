import { listGroups } from "@/db/userGroups";
import { displayNameForUserId } from "@/constants/people";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const listUserGroupsTool = new DynamicStructuredTool({
  name: "listUserGroups",
  description:
    "List all user groups and their members for this server. " +
    "ONLY for Equality role users. Use when they ask to show, list, or see existing groups.",
  schema: z.object({}),
  func: async (_args, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) return denied;

    const groups = listGroups(message.guildId);
    if (groups.length === 0) {
      return "No user groups exist yet.";
    }

    return groups
      .map((group) => {
        const members =
          group.memberIds.length === 0
            ? "(empty)"
            : group.memberIds
                .map((id) => displayNameForUserId(id, message.guildId))
                .join(", ");
        return `**${group.name}**: ${members}`;
      })
      .join("\n");
  },
});
