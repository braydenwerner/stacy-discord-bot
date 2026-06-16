import { buildTotalCostEmbed, summarizeTotalCostReport } from "@/utils/cost/costEmbeds";
import { getTotalCostReport } from "@/utils/cost/totalCostReport";
import { getAwsCredentialError } from "@/utils/aws/awsConfig";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { replyDenied, replyError } from "@/utils/slashReply";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("cost")
    .setDescription(
      "Activate credits used + OpenAI spend breakdown (Equality role)",
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = await requireEqualityInteraction(interaction);
    if (denied) {
      await replyDenied(interaction, denied);
      return;
    }

    const configError = getAwsCredentialError();
    if (configError) {
      await replyDenied(interaction, configError);
      return;
    }

    try {
      await interaction.deferReply({ ephemeral: true });
      const report = await getTotalCostReport();
      await interaction.editReply({
        embeds: [buildTotalCostEmbed(report)],
      });
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
