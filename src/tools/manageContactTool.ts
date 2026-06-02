import {
  addContact,
  removeContact,
  updateContact,
} from "@/db/contacts";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const manageContactTool = new DynamicStructuredTool({
  name: "manageContact",
  description:
    "Add, remove, or update a known contact (name → Discord user ID) for this server. " +
    "ONLY for Equality role, server admins, or bot owner. Use when they ask to add a person with an ID, remove a contact, " +
    'or change a contact (e.g. "add person kevin with id 543923375438036993"). ' +
    "For add, both name and userId are required.",
  schema: z.object({
    action: z
      .enum(["add", "remove", "update"])
      .describe("Add, remove, or update a contact."),
    name: z
      .string()
      .describe("Contact name (e.g. 'ben', 'michael f'). Required for all actions."),
    userId: z
      .string()
      .optional()
      .describe("Discord user ID. Required for add; optional new ID for update."),
    newName: z
      .string()
      .optional()
      .describe("New display name when updating a contact."),
  }),
  func: async ({ action, name, userId, newName }, _runManager, config) => {
    const message = getToolMessage(config);
    const denied = await requireEquality(message);
    if (denied) {
      await message.reply(denied);
      return "";
    }

    try {
      if (action === "add") {
        if (!name.trim()) {
          await message.reply("Name is required to add a person.");
          return "";
        }
        if (!userId?.trim()) {
          await message.reply("Discord user ID is required to add a person.");
          return "";
        }
        addContact(message.guildId, name, userId);
        await message.reply(`Added **${name.trim()}** with ID \`${userId.trim()}\`.`);
        return "";
      }

      if (action === "remove") {
        if (!name.trim()) {
          await message.reply("Name is required to remove a person.");
          return "";
        }
        const removed = removeContact(message.guildId, name);
        await message.reply(
          removed
            ? `Removed contact **${name.trim()}**.`
            : `No contact named **${name.trim()}** exists.`,
        );
        return "";
      }

      if (!name.trim()) {
        await message.reply("Name is required to update a person.");
        return "";
      }
      const updated = updateContact(message.guildId, name, {
        newName,
        newUserId: userId,
      });
      await message.reply(
        updated
          ? `Updated contact **${name.trim()}**.`
          : `No contact named **${name.trim()}** exists.`,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(text);
      throw error;
    }
    return "";
  },
});
