import { listContacts } from "@/db/contacts";
import { formatContactsList } from "@/utils/formatContactsList";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const listContactsTool = new DynamicStructuredTool({
  name: "listContacts",
  description:
    "List all known contacts (name and Discord user ID) for this server. " +
    "ONLY for Equality role users. Use when they ask to show or list known people/contacts (same as /people).",
  schema: z.object({}),
  func: async (_args, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) return denied;

    const contacts = listContacts(message.guildId);
    return formatContactsList(contacts, { includeMentions: false });
  },
});
