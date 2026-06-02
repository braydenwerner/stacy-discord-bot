import { listContacts } from "@/db/contacts";
import {
  buildContactsEmbed,
  contactsSummaryForModel,
} from "@/utils/directoryEmbeds";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError, toolOk } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const listContactsTool = new DynamicStructuredTool({
  name: "listContacts",
  description:
    "List all known contacts for this server in a rich embed. " +
    "ONLY for Equality role, server admins, or bot owner. Use when they ask to show or list known people/contacts (same as /people).",
  schema: z.object({}),
  func: async (_args, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply({ content: denied });
      return toolError(denied);
    }

    const contacts = listContacts(message.guildId);
    const embed = buildContactsEmbed(contacts, message.guild);
    await message.reply({ embeds: [embed] });
    return toolOk(contactsSummaryForModel(contacts.length));
  },
});
