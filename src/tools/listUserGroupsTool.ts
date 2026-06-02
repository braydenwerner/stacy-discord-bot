import { listGroups } from "@/db/userGroups";
import {
  buildGroupsEmbed,
  groupsSummaryForModel,
} from "@/utils/directoryEmbeds";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError, toolOk } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const listUserGroupsTool = new DynamicStructuredTool({
  name: "listUserGroups",
  description:
    "List all user groups and their members in a rich embed. " +
    "ONLY for Equality role users. Use when they ask to show, list, or see existing groups.",
  schema: z.object({}),
  func: async (_args, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply({ content: denied });
      return toolError(denied);
    }

    const groups = listGroups(message.guildId);
    const embed = buildGroupsEmbed(groups, message.guildId, message.guild);
    await message.reply({ embeds: [embed] });
    return toolOk(groupsSummaryForModel(groups.length));
  },
});
