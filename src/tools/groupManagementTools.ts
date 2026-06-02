import { groupDb } from "@/utils/database";
import { getToolMessage } from "@/utils/getToolMessage";
import {
  extractUserIdFromMention,
  hasEqualityRole,
} from "@/utils/permissions";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const addUserToGroupTool = new DynamicStructuredTool({
  name: "addUserToGroup",
  description:
    "Add a user to a group. Only users with the Equality rank can use this. " +
    'Use when the user says something like "add @user to group_name".',
  schema: z.object({
    userMention: z
      .string()
      .describe("The Discord user mention (e.g., '<@123456789>')"),
    groupName: z.string().describe("The name of the group"),
  }),
  func: async ({ userMention, groupName }, _runManager, config) => {
    const message = getToolMessage(config);

    if (!hasEqualityRole(message)) {
      message.reply(
        "Only users with the Equality rank can manage groups.",
      );
      return "";
    }

    const userId = extractUserIdFromMention(userMention);
    if (!userId) {
      message.reply(`Invalid user mention: ${userMention}`);
      return "";
    }

    try {
      let group = groupDb.getGroup(groupName);

      if (!group) {
        group = groupDb.createGroup(groupName, message.author.id);
        message.reply(
          `Created new group "${groupName}" and added <@${userId}> to it.`,
        );
      }

      const added = groupDb.addMemberToGroup(
        group.id,
        userId,
        message.author.id,
      );

      if (added) {
        if (group.created_by === message.author.id) {
          return "";
        }
        message.reply(`Added <@${userId}> to group "${groupName}".`);
      } else {
        message.reply(`<@${userId}> is already in group "${groupName}".`);
      }
    } catch (error) {
      message.reply(`Failed to add user to group: ${error}`);
      throw error;
    }

    return "";
  },
});

export const removeUserFromGroupTool = new DynamicStructuredTool({
  name: "removeUserFromGroup",
  description:
    "Remove a user from a group. Only users with the Equality rank can use this. " +
    'Use when the user says something like "remove @user from group_name".',
  schema: z.object({
    userMention: z
      .string()
      .describe("The Discord user mention (e.g., '<@123456789>')"),
    groupName: z.string().describe("The name of the group"),
  }),
  func: async ({ userMention, groupName }, _runManager, config) => {
    const message = getToolMessage(config);

    if (!hasEqualityRole(message)) {
      message.reply(
        "Only users with the Equality rank can manage groups.",
      );
      return "";
    }

    const userId = extractUserIdFromMention(userMention);
    if (!userId) {
      message.reply(`Invalid user mention: ${userMention}`);
      return "";
    }

    try {
      const group = groupDb.getGroup(groupName);
      if (!group) {
        message.reply(`Group "${groupName}" does not exist.`);
        return "";
      }

      const removed = groupDb.removeMemberFromGroup(group.id, userId);

      if (removed) {
        message.reply(`Removed <@${userId}> from group "${groupName}".`);
      } else {
        message.reply(`<@${userId}> is not in group "${groupName}".`);
      }
    } catch (error) {
      message.reply(`Failed to remove user from group: ${error}`);
      throw error;
    }

    return "";
  },
});

export const listGroupsTool = new DynamicStructuredTool({
  name: "listGroups",
  description:
    "List all existing groups and their members. " +
    'Use when the user asks something like "show me existing groups" or "list all groups".',
  schema: z.object({}),
  func: async ({}, _runManager, config) => {
    const message = getToolMessage(config);

    try {
      const groups = groupDb.getAllGroupsWithMembers();

      if (groups.length === 0) {
        message.reply("There are no groups yet.");
        return "";
      }

      const groupList = groups
        .map((group) => {
          const memberCount = group.members.length;
          const memberList =
            memberCount > 0
              ? group.members.map((id) => `<@${id}>`).join(", ")
              : "no members";
          return `• **${group.name}** (${memberCount} member${memberCount !== 1 ? "s" : ""}): ${memberList}`;
        })
        .join("\n");

      message.reply(`**Existing Groups:**\n${groupList}`);
    } catch (error) {
      message.reply(`Failed to list groups: ${error}`);
      throw error;
    }

    return "";
  },
});

export const deleteGroupTool = new DynamicStructuredTool({
  name: "deleteGroup",
  description:
    "Delete a group entirely. Only users with the Equality rank can use this. " +
    'Use when the user says something like "delete group_name".',
  schema: z.object({
    groupName: z.string().describe("The name of the group to delete"),
  }),
  func: async ({ groupName }, _runManager, config) => {
    const message = getToolMessage(config);

    if (!hasEqualityRole(message)) {
      message.reply(
        "Only users with the Equality rank can manage groups.",
      );
      return "";
    }

    try {
      const deleted = groupDb.deleteGroup(groupName);

      if (deleted) {
        message.reply(`Deleted group "${groupName}".`);
      } else {
        message.reply(`Group "${groupName}" does not exist.`);
      }
    } catch (error) {
      message.reply(`Failed to delete group: ${error}`);
      throw error;
    }

    return "";
  },
});
