import {
  addToNiceList,
  listNiceListUserIds,
  removeFromNiceList,
} from "@/db/niceList";
import { ACTION_COLORS, buildActionEmbed } from "@/utils/actionEmbeds";
import { buildNiceListEmbed } from "@/utils/directoryEmbeds";
import { requireStacyOwnerInteraction } from "@/utils/stacyOwner";
import { replyDenied, replyError } from "@/utils/slashReply";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tone")
    .setDescription("Manage who gets nice vs snarky tone (bot owner only)")
    .addSubcommand((sub) =>
      sub
        .setName("nice-add")
        .setDescription("Add someone to the nice list")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("nice-remove")
        .setDescription("Remove someone from the nice list (snarky tone)")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("snarky-add")
        .setDescription("Same as nice-remove — use snarky tone for this user")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Show everyone on the nice list"),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = requireStacyOwnerInteraction(interaction);
    if (denied) {
      await replyDenied(interaction, denied);
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "list") {
        const ids = listNiceListUserIds();
        await interaction.reply({
          embeds: [buildNiceListEmbed(ids)],
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser("user", true);

      if (sub === "nice-add") {
        const added = addToNiceList(user.id);
        await interaction.reply({
          embeds: [
            buildActionEmbed({
              title: added ? "Nice list updated" : "Already on nice list",
              description: added
                ? `Added <@${user.id}> to the **nice** list.`
                : `<@${user.id}> is already on the nice list.`,
              color: added ? ACTION_COLORS.success : ACTION_COLORS.warning,
              footer: "Tone · bot owner",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const removed = removeFromNiceList(user.id);
      await interaction.reply({
        embeds: [
          buildActionEmbed({
            title: removed ? "Nice list updated" : "Not on nice list",
            description: removed
              ? `Removed <@${user.id}> from the nice list — they'll get the **snarky** tone.`
              : `<@${user.id}> wasn't on the nice list.`,
            color: removed ? ACTION_COLORS.success : ACTION_COLORS.warning,
            footer: "Tone · bot owner",
          }),
        ],
        ephemeral: true,
      });
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
