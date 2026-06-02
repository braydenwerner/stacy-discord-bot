import {
  clearContextForUser,
  formatClearContextReply,
} from "@/utils/clearContext";
import { replyError } from "@/utils/slashReply";
import { truncateMessage } from "@/utils/truncateMessage";
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
          content: truncateMessage(formatClearContextReply(removed)),
          ephemeral: true,
        });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
