import { displayNameForUserId } from "@/constants/people";
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
      if (sub === "add-member") {
        const name = interaction.options.getString("name", true);
        const user = interaction.options.getUser("user", true);
        const { created } = addMemberToGroup(
          interaction.guildId,
          name,
          user.id,
        );
        const label = displayNameForUserId(user.id, interaction.guildId);
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
        const label = displayNameForUserId(user.id, interaction.guildId);
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
        if (groups.length === 0) {
          await interaction.reply({
            content: "No user groups exist yet.",
            ephemeral: true,
          });
          return;
        }
        const body = groups
          .map((group) => {
            const members =
              group.memberIds.length === 0
                ? "(empty)"
                : group.memberIds
                    .map((id) =>
                      displayNameForUserId(id, interaction.guildId),
                    )
                    .join(", ");
            return `**${group.name}**: ${members}`;
          })
          .join("\n");
        await interaction.reply({ content: body, ephemeral: true });
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
