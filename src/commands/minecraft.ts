import {
  buildMinecraftBackupsEmbed,
  buildMinecraftCommandEmbed,
  buildMinecraftLogsEmbed,
  buildMinecraftMetricsEmbed,
  buildMinecraftStartEmbed,
  buildMinecraftStatusEmbed,
  buildMinecraftStopEmbed,
} from "@/utils/minecraft/minecraftEmbeds";
import { isMinecraftBackupConfigured } from "@/utils/minecraft/minecraftBackups";
import {
  getMinecraftBackupReport,
  getMinecraftHealth,
} from "@/utils/minecraft/minecraftObservability";
import { getMinecraftObserveEmbed } from "@/utils/minecraft/runMinecraftObserve";
import { getMinecraftConfigError } from "@/utils/minecraft/minecraftConfig";
import {
  getMinecraftServerState,
  startMinecraftServer,
  stopMinecraftServer,
} from "@/utils/minecraft/minecraftClient";
import { runMinecraftConsoleCommand } from "@/utils/minecraft/minecraftRcon";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { requireStacyOwnerForMinecraftConsoleInteraction } from "@/utils/stacyOwner";
import { replyDenied, replyError } from "@/utils/slashReply";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

const OBSERVE_SUBCOMMANDS = new Set(["logs", "backups", "metrics"]);

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
      sub
        .setName("status")
        .setDescription("EC2 state, port, service, players, and connect info"),
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
        .setName("command")
        .setDescription("Run a server console command via RCON (bot owner only)")
        .addStringOption((opt) =>
          opt
            .setName("cmd")
            .setDescription("Command (e.g. whitelist add Steve, op Steve, list)")
            .setRequired(true)
            .setMaxLength(256),
        ),
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
        await interaction.deferReply({ ephemeral: true });
        const health = await getMinecraftHealth();
        await interaction.editReply({
          embeds: [buildMinecraftStatusEmbed(health)],
        });
        return;
      }

      if (OBSERVE_SUBCOMMANDS.has(sub)) {
        await interaction.deferReply({ ephemeral: true });
        if (sub === "backups") {
          if (!isMinecraftBackupConfigured()) {
            await interaction.editReply(
              "MINECRAFT_BACKUP_BUCKET is not set.",
            );
            return;
          }
          const { bucket, backups } = await getMinecraftBackupReport(8);
          await interaction.editReply({
            embeds: [buildMinecraftBackupsEmbed(bucket, backups)],
          });
          return;
        }
        const logLines =
          sub === "logs"
            ? (interaction.options.getInteger("lines") ?? 25)
            : undefined;
        const embed = await getMinecraftObserveEmbed(
          sub as "logs" | "metrics",
          { logLines },
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (sub === "start") {
        await interaction.deferReply({ ephemeral: true });
        const before = await getMinecraftServerState();
        const after = await startMinecraftServer();
        const health = await getMinecraftHealth();
        await interaction.editReply({
          embeds: [buildMinecraftStartEmbed(before, after, health)],
        });
        return;
      }

      if (sub === "command") {
        const denied = requireStacyOwnerForMinecraftConsoleInteraction(interaction);
        if (denied) {
          await replyDenied(interaction, denied);
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const cmd = interaction.options.getString("cmd", true);
        const output = await runMinecraftConsoleCommand(cmd);
        await interaction.editReply({
          embeds: [buildMinecraftCommandEmbed({ command: cmd.trim(), output })],
        });
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
        const health = await getMinecraftHealth();
        await interaction.editReply({
          embeds: [buildMinecraftStopEmbed(before, after, health)],
        });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
