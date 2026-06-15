import { formatAwsUsageReport } from "@/utils/aws/formatAwsUsage";
import { getAwsCredentialError } from "@/utils/aws/awsConfig";
import { getAwsUsageReport } from "@/utils/aws/awsUsage";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { replyDenied, replyError } from "@/utils/slashReply";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("aws")
    .setDescription("AWS billing and usage (Equality role)")
    .addSubcommand((sub) =>
      sub
        .setName("usage")
        .setDescription(
          "Month-to-date spend, 12-month total, forecast, credits, and budget remaining",
        ),
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
      const report = await getAwsUsageReport();
      await interaction.editReply(formatAwsUsageReport(report));
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
