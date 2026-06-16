import {
  clearContextForUser,
} from "@/utils/clearContext";
import { buildClearContextEmbed } from "@/utils/actionEmbeds";
import { replyError } from "@/utils/slashReply";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("context")
    .setDescription("Manage your conversation context with Stacy")
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Forget your recent chat history with Stacy"),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "clear") {
        const removed = clearContextForUser(interaction.user.id);
        await interaction.reply({
          embeds: [buildClearContextEmbed(removed)],
          ephemeral: true,
        });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
