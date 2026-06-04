import {
  formatMinecraftStartResult,
  formatMinecraftStatus,
  formatMinecraftStopResult,
} from "@/utils/minecraft/formatServerStatus";
import {
  getMinecraftServerState,
  isMinecraftConfigured,
  startMinecraftServer,
  stopMinecraftServer,
} from "@/utils/minecraft/minecraftClient";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { replyDenied, replyError } from "@/utils/slashReply";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

const NOT_CONFIGURED =
  "Minecraft server control is not configured. Set `MINECRAFT_INSTANCE_ID` and `AWS_REGION` on the bot host.";

export default {
  data: new SlashCommandBuilder()
    .setName("minecraft")
    .setDescription("Start, stop, or check the AWS Minecraft server")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Wake the server (starts EC2; ~1 min until joinable)"),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show server and instance status"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("Stop the EC2 instance (Equality role required)"),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isMinecraftConfigured()) {
      await replyDenied(interaction, NOT_CONFIGURED);
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "status") {
        const state = await getMinecraftServerState();
        await interaction.reply({
          content: formatMinecraftStatus(state),
          ephemeral: true,
        });
        return;
      }

      if (sub === "start") {
        await interaction.deferReply({ ephemeral: true });
        const before = await getMinecraftServerState();
        const after = await startMinecraftServer();
        await interaction.editReply(formatMinecraftStartResult(before, after));
        return;
      }

      if (sub === "stop") {
        const denied = await requireEqualityInteraction(interaction);
        if (denied) {
          await replyDenied(interaction, denied);
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const before = await getMinecraftServerState();
        const after = await stopMinecraftServer();
        await interaction.editReply(formatMinecraftStopResult(before, after));
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
