import {
  addToNiceList,
  listNiceListUserIds,
  removeFromNiceList,
} from "@/db/niceList";
import {
  buildNiceListEmbed,
  niceListSummaryForModel,
} from "@/utils/directoryEmbeds";
import { resolveGroupMemberId } from "@/utils/resolveGroupMember";
import { requireStacyOwnerMessage } from "@/utils/stacyOwner";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError, toolOk } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const manageToneListTool = new DynamicStructuredTool({
  name: "manageToneList",
  description:
    "Add or remove users from Stacy's nice list, or list who is on it. " +
    "ONLY the bot owner can use this. Nice list users get helpful tone; everyone else is snarky. " +
    'Use for "add X to the nice list", "put X on snarky list", "who is on the nice list".',
  schema: z.object({
    action: z
      .enum(["nice_add", "nice_remove", "list"])
      .describe("Add to nice, remove from nice (snarky), or list."),
    user: z
      .string()
      .optional()
      .describe(
        "User for add/remove — contact name, me, @mention, or Discord ID. Omit for list.",
      ),
  }),
  func: async ({ action, user }, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = requireStacyOwnerMessage(message);
    if (denied) {
      await message.reply(denied);
      return toolError(denied);
    }

    if (action === "list") {
      const ids = listNiceListUserIds();
      await message.reply({ embeds: [buildNiceListEmbed(ids)] });
      return toolOk(niceListSummaryForModel(ids.length));
    }

    const userId = resolveGroupMemberId(message, user ?? "");
    if (!userId) {
      const text =
        "I couldn't figure out who you mean. Use a @mention, contact name, or user ID.";
      await message.reply(text);
      return toolError(text);
    }

    if (action === "nice_add") {
      const added = addToNiceList(userId);
      const text = added
        ? `Added <@${userId}> to the **nice** list.`
        : `<@${userId}> is already on the nice list.`;
      await message.reply(text);
      return toolOk(text);
    }

    const removed = removeFromNiceList(userId);
    const text = removed
      ? `Removed <@${userId}> from the nice list — they'll get the **snarky** tone.`
      : `<@${userId}> wasn't on the nice list.`;
    await message.reply(text);
    return toolOk(text);
  },
});
