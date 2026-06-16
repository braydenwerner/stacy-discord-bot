import {
  addContact,
  removeContact,
  updateContact,
} from "@/db/contacts";
import { ACTION_COLORS, buildActionEmbed } from "@/utils/actionEmbeds";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const manageContactTool = new DynamicStructuredTool({
  name: "manageContact",
  description:
    "Add, remove, or update a known contact (name → Discord user ID) for this server. " +
    "ONLY for Equality role, server admins, or bot owner — always CALL this tool for add/remove/update; do not refuse in chat without calling it. " +
    'Use when they ask to add a person with an ID (e.g. "add cameron 152569570396209162"), remove a contact, or update one. ' +
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
        await message.reply({
          embeds: [
            buildActionEmbed({
              title: "Contact added",
              description: `Added **${name.trim()}** with ID \`${userId.trim()}\`.`,
              color: ACTION_COLORS.success,
              footer: "Contacts · Equality",
            }),
          ],
        });
        return "";
      }

      if (action === "remove") {
        if (!name.trim()) {
          await message.reply("Name is required to remove a person.");
          return "";
        }
        const removed = removeContact(message.guildId, name);
        await message.reply({
          embeds: [
            buildActionEmbed({
              title: removed ? "Contact removed" : "Contact not found",
              description: removed
                ? `Removed contact **${name.trim()}**.`
                : `No contact named **${name.trim()}** exists.`,
              color: removed ? ACTION_COLORS.success : ACTION_COLORS.warning,
              footer: "Contacts · Equality",
            }),
          ],
        });
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
      await message.reply({
        embeds: [
          buildActionEmbed({
            title: updated ? "Contact updated" : "Contact not found",
            description: updated
              ? `Updated contact **${name.trim()}**.`
              : `No contact named **${name.trim()}** exists.`,
            color: updated ? ACTION_COLORS.success : ACTION_COLORS.warning,
            footer: "Contacts · Equality",
          }),
        ],
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(text);
      throw error;
    }
    return "";
  },
});
