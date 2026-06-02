import { getDisplayNameForUserId } from "@/db/contacts";
import { buildGroupsEmbed } from "@/utils/directoryEmbeds";
import {
  formatBulkGroupDiscordMessage,
  resolveMemberHintsFromContext,
} from "@/utils/bulkGroupMembers";
import { parseMemberList } from "@/utils/parseMemberList";
import type { MemberResolveContext } from "@/utils/resolveGroupMember";
import {
  addMemberToGroup,
  deleteGroup,
  listGroups,
  removeMemberFromGroup,
} from "@/db/userGroups";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { buildGroupPingContent } from "@/utils/pingGroupMessage";
import { replyDenied, replyError } from "@/utils/slashReply";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("group")
    .setDescription("Manage user groups (Equality role required)")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a group and add multiple members at once")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Group name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("members")
            .setDescription(
              "Comma-separated names (contacts, me, @mentions, or user IDs)",
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-member")
        .setDescription("Add someone to a group (creates the group if needed)")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Group name").setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Member to add")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-member")
        .setDescription("Remove someone from a group")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Group name").setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Member to remove")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a group and all its members")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Group name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all groups and members"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ping")
        .setDescription("Ping everyone in a group with a message")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Group name").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Message to send with the ping")
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = await requireEqualityInteraction(interaction);
    if (denied) {
      await replyDenied(interaction, denied);
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "create") {
        const name = interaction.options.getString("name", true);
        const membersRaw = interaction.options.getString("members", true);
        const ctx: MemberResolveContext = {
          authorId: interaction.user.id,
          guildId: interaction.guildId,
          mentions: [],
        };
        const hints = parseMemberList(membersRaw);
        const { resolved, failed } = resolveMemberHintsFromContext(ctx, hints);
        let created = false;
        for (const member of resolved) {
          const result = addMemberToGroup(
            interaction.guildId,
            name,
            member.userId,
          );
          if (result.created) created = true;
        }
        await interaction.reply({
          content: formatBulkGroupDiscordMessage(name, {
            created,
            resolved,
            failed,
          }),
          ephemeral: true,
        });
        return;
      }

      if (sub === "add-member") {
        const name = interaction.options.getString("name", true);
        const user = interaction.options.getUser("user", true);
        const { created } = addMemberToGroup(
          interaction.guildId,
          name,
          user.id,
        );
        const label = getDisplayNameForUserId(interaction.guildId, user.id);
        await interaction.reply({
          content: created
            ? `Created **${name.trim()}** and added **${label}**.`
            : `Added **${label}** to **${name.trim()}**.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "remove-member") {
        const name = interaction.options.getString("name", true);
        const user = interaction.options.getUser("user", true);
        const removed = removeMemberFromGroup(
          interaction.guildId,
          name,
          user.id,
        );
        const label = getDisplayNameForUserId(interaction.guildId, user.id);
        await interaction.reply({
          content: removed
            ? `Removed **${label}** from **${name.trim()}**.`
            : `**${label}** wasn't in **${name.trim()}** (or the group doesn't exist).`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "delete") {
        const name = interaction.options.getString("name", true);
        const deleted = deleteGroup(interaction.guildId, name);
        await interaction.reply({
          content: deleted
            ? `Deleted group **${name.trim()}**.`
            : `No group called **${name.trim()}** exists.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "list") {
        const groups = listGroups(interaction.guildId);
        await interaction.reply({
          embeds: [buildGroupsEmbed(groups, interaction.guildId, interaction.guild)],
          ephemeral: true,
        });
        return;
      }

      if (sub === "ping") {
        const name = interaction.options.getString("name", true);
        const text = interaction.options.getString("message", true);
        const result = buildGroupPingContent(
          interaction.guildId,
          name,
          text,
          interaction.user.id,
        );
        if ("error" in result) {
          await replyDenied(interaction, result.error);
          return;
        }
        if (!interaction.channel?.isSendable()) {
          await replyDenied(interaction, "Cannot send messages in this channel.");
          return;
        }
        await interaction.channel.send(result.content);
        await interaction.reply({
          content: `Pinged **${name.trim()}**.`,
          ephemeral: true,
        });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
