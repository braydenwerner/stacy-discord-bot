import {
  formatMinecraftStartResult,
  formatMinecraftStatus,
  formatMinecraftStopResult,
} from "@/utils/minecraft/formatServerStatus";
import { getMinecraftConfigError } from "@/utils/minecraft/minecraftConfig";
import {
  getMinecraftServerState,
  startMinecraftServer,
  stopMinecraftServer,
} from "@/utils/minecraft/minecraftClient";
import { runMinecraftObserve } from "@/utils/minecraft/runMinecraftObserve";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { replyDenied, replyError } from "@/utils/slashReply";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

const OBSERVE_SUBCOMMANDS = new Set(["health", "logs", "backups", "metrics"]);

export default {
  data: new SlashCommandBuilder()
    .setName("minecraft")
    .setDescription("Start, stop, or inspect the AWS Minecraft server")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Wake the server (starts EC2; ~1 min until joinable)"),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show EC2 instance state"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("health")
        .setDescription("Port, systemd service, and online players"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("logs")
        .setDescription("Recent Paper and systemd logs")
        .addIntegerOption((opt) =>
          opt
            .setName("lines")
            .setDescription("Lines per section (5–60, default 25)")
            .setMinValue(5)
            .setMaxValue(60),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("backups")
        .setDescription("List recent S3 world backups"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("metrics")
        .setDescription("CPU, EBS IOPS/throughput, network, load, memory, disk"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("Stop the EC2 instance (Equality role required)"),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const configError = getMinecraftConfigError();
    if (configError) {
      await replyDenied(interaction, configError);
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

      if (OBSERVE_SUBCOMMANDS.has(sub)) {
        await interaction.deferReply({ ephemeral: true });
        const logLines =
          sub === "logs"
            ? (interaction.options.getInteger("lines") ?? 25)
            : undefined;
        const text = await runMinecraftObserve(
          sub as "health" | "logs" | "backups" | "metrics",
          { logLines },
        );
        await interaction.editReply(text);
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
