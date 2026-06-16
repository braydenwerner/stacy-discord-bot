import type {
  BackupSource,
  MinecraftBackup,
} from "@/utils/minecraft/minecraftBackups";
import {
  formatBackupStamp,
  formatBytes,
  truncateForDiscord,
  type MinecraftHealth,
  type MinecraftMetrics,
} from "@/utils/minecraft/minecraftObservability";
import type { MinecraftServerState } from "@/utils/minecraft/minecraftClient";
import { STATE_LABEL } from "@/utils/minecraft/formatServerStatus";
import {
  formatBackupStampPacific,
  formatPacificDateTime,
} from "@/utils/formatPacificTime";
import {
  ec2InstanceConsoleUrl,
  s3BucketConsoleUrl,
  s3ObjectConsoleUrl,
} from "@/utils/aws/awsConsoleUrls";
import { EmbedBuilder } from "discord.js";

const COLORS = {
  success: 0x57f287,
  info: 0x3498db,
  warning: 0xfaa61a,
  danger: 0xed4245,
  neutral: 0x95a5a6,
} as const;

const BACKUP_SOURCE_LABEL: Record<BackupSource, string> = {
  periodic: "Scheduled backup",
  idle: "Idle shutdown",
  stop: "Pre-stop",
  manual: "Manual",
};

const BACKUP_SOURCE_DESC: Record<BackupSource, string> = {
  periodic: "Automatic world archive uploaded to S3.",
  idle: "World saved before the server shut down from inactivity.",
  stop: "World saved before the EC2 instance stopped.",
  manual: "World archive uploaded to S3.",
};

function backupSavedAt(
  stamp: string,
  lastModified: Date | null | undefined,
): string {
  if (lastModified) return formatPacificDateTime(lastModified);
  if (stamp) return formatBackupStampPacific(stamp);
  return "Unknown";
}

export function buildBackupSavedEmbed(params: {
  bucket: string;
  key: string;
  source: BackupSource;
  stamp: string;
  sizeBytes: number | null;
  lastModified?: Date | null;
}): EmbedBuilder {
  const { bucket, key, source, stamp, sizeBytes, lastModified } = params;
  const awsUrl = s3ObjectConsoleUrl(bucket, key);

  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("World backup saved")
    .setURL(awsUrl)
    .setDescription(BACKUP_SOURCE_DESC[source])
    .addFields(
      { name: "Source", value: BACKUP_SOURCE_LABEL[source], inline: true },
      { name: "Size", value: formatBytes(sizeBytes), inline: true },
      {
        name: "Saved at",
        value: backupSavedAt(stamp, lastModified),
        inline: true,
      },
      {
        name: "Archive",
        value: `[Open in AWS Console](${awsUrl})\n\`s3://${bucket}/${key}\``,
      },
    )
    .setFooter({ text: "Minecraft · S3 backup" })
    .setTimestamp(lastModified ?? undefined);
}

function ec2ConsoleField(): { name: string; value: string } | null {
  const instanceId = process.env.MINECRAFT_INSTANCE_ID;
  if (!instanceId) return null;
  const url = ec2InstanceConsoleUrl(instanceId);
  return {
    name: "AWS",
    value: `[Open EC2 instance](${url})`,
  };
}

export function buildInstanceStateEmbed(
  state: MinecraftServerState,
  previous: string | null,
  options?: { idleShutdownRecent?: boolean },
): EmbedBuilder | null {
  if (!previous) return null;

  const { state: current, connectAddress } = state;
  const idle = options?.idleShutdownRecent ?? false;

  if (previous !== "pending" && current === "pending") {
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle("Minecraft server starting")
      .setDescription("EC2 is booting — Paper should be ready in about a minute.")
      .setFooter({ text: "Minecraft · EC2" })
      .setTimestamp();
    const ec2 = ec2ConsoleField();
    if (ec2) embed.addFields(ec2);
    return embed;
  }

  if (previous !== "running" && current === "running") {
    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle("Minecraft server online")
      .setDescription("The server is accepting connections.")
      .setFooter({ text: "Minecraft · EC2" })
      .setTimestamp();
    if (connectAddress) {
      embed.addFields({ name: "Connect", value: `\`${connectAddress}\`` });
    }
    const ec2 = ec2ConsoleField();
    if (ec2) embed.addFields(ec2);
    return embed;
  }

  if (previous !== "stopping" && current === "stopping") {
    if (idle) return null;
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle("Minecraft server shutting down")
      .setDescription("EC2 is stopping. Compute billing ends once the instance is fully stopped.")
      .setFooter({ text: "Minecraft · EC2" })
      .setTimestamp();
    const ec2 = ec2ConsoleField();
    if (ec2) embed.addFields(ec2);
    return embed;
  }

  if (previous !== "stopped" && current === "stopped") {
    const embed = new EmbedBuilder()
      .setColor(COLORS.neutral)
      .setTitle(idle ? "Idle shutdown complete" : "Minecraft server stopped")
      .setDescription(
        idle
          ? "World saved and EC2 halted after the idle timeout. Compute billing is paused until the next start."
          : "EC2 is stopped. Compute billing is paused until the next start.",
      )
      .setFooter({ text: "Minecraft · EC2" })
      .setTimestamp();
    const ec2 = ec2ConsoleField();
    if (ec2) embed.addFields(ec2);
    return embed;
  }

  return null;
}

export function buildIdleShutdownEmbed(params: {
  idleMinutes: string | number;
  elapsedMinutes: string | number;
  at?: Date | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle("Minecraft idle shutdown")
    .setDescription(
      "No players were online long enough. Saving a world backup and halting EC2.",
    )
    .addFields(
      {
        name: "Empty for",
        value: `${params.elapsedMinutes} min`,
        inline: true,
      },
      {
        name: "Threshold",
        value: `${params.idleMinutes} min`,
        inline: true,
      },
    )
    .setFooter({ text: "Minecraft · idle shutdown" })
    .setTimestamp(params.at ?? undefined);

  if (params.at) {
    embed.addFields({
      name: "Triggered at",
      value: formatPacificDateTime(params.at),
      inline: true,
    });
  }

  return embed;
}

/** Warn when auto idle-shutdown should have stopped EC2 but did not. */
export function buildIdleOverdueEmbed(params: {
  emptyMinutes: number;
  idleThresholdMinutes: number;
  playerSummary: string | null;
  connectAddress: string | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle("Idle shutdown overdue")
    .setDescription(
      "The server has been running with **no players** longer than the auto-shutdown threshold. " +
        "Idle stop may have failed — EC2 is still billing (~$11/day on c6i.2xlarge). " +
        "Use `/minecraft stop` if nobody is playing.",
    )
    .addFields(
      {
        name: "Empty for",
        value: `${params.emptyMinutes} min`,
        inline: true,
      },
      {
        name: "Auto-stop threshold",
        value: `${params.idleThresholdMinutes} min`,
        inline: true,
      },
      {
        name: "Players",
        value: params.playerSummary ?? "0 online",
      },
    )
    .setFooter({ text: "Minecraft · idle watchdog" })
    .setTimestamp();

  if (params.connectAddress) {
    embed.addFields({
      name: "Connect",
      value: `\`${params.connectAddress}\``,
      inline: true,
    });
  }

  const ec2 = ec2ConsoleField();
  if (ec2) embed.addFields(ec2);

  return embed;
}

export function buildMinecraftBackupsEmbed(
  bucket: string,
  backups: MinecraftBackup[],
): EmbedBuilder {
  const bucketUrl = s3BucketConsoleUrl(bucket);
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("Minecraft S3 backups")
    .setURL(bucketUrl)
    .setDescription(`Bucket: [Open in AWS Console](${bucketUrl})\n\`${bucket}\``)
    .setFooter({ text: "Minecraft · S3 backups" })
    .setTimestamp();

  if (backups.length === 0) {
    embed.setDescription(
      `Bucket: [Open in AWS Console](${bucketUrl})\n\`${bucket}\`\n\nNo world backups found in the bucket root.`,
    );
    return embed;
  }

  const lines = backups.map((backup) => {
    const stamp = formatBackupStamp(backup.key);
    const when = backup.lastModified
      ? formatPacificDateTime(backup.lastModified)
      : formatBackupStampPacific(stamp);
    const size = formatBytes(backup.sizeBytes);
    const source = backup.source
      ? BACKUP_SOURCE_LABEL[backup.source]
      : "Archive";
    const objectUrl = s3ObjectConsoleUrl(bucket, backup.key);
    return `**${source}** · ${size} · [AWS](${objectUrl})\n\`${stamp}\` · ${when}`;
  });

  embed.addFields({
    name: `Recent backups (${backups.length})`,
    value: lines.join("\n\n").slice(0, 1024),
  });

  return embed;
}

function statusColor(health: MinecraftHealth): number {
  const state = health.ec2State;
  if (state === "running") {
    return health.portOpen ? COLORS.success : COLORS.warning;
  }
  if (state === "pending" || state === "stopping") return COLORS.warning;
  if (state === "terminated") return COLORS.danger;
  return COLORS.neutral;
}

function portLabel(portOpen: boolean | null): string {
  if (portOpen === true) return "Open — Paper is accepting connections";
  if (portOpen === false) {
    return "Closed — boot or install may still be running";
  }
  return "Unknown";
}

function serviceLabel(serviceActive: boolean | null): string {
  if (serviceActive === true) return "`minecraft.service` active";
  if (serviceActive === false) return "`minecraft.service` inactive";
  return "n/a";
}

function pct(used: number | null, cap: number | null): string {
  if (used == null || cap == null || cap <= 0) return "";
  return ` (${((used / cap) * 100).toFixed(1)}% of cap)`;
}

function fmtMbps(value: number | null): string {
  if (value == null) return "n/a";
  return `${value.toFixed(1)} MiB/s`;
}

function fmtIops(value: number | null): string {
  if (value == null) return "n/a";
  return value.toFixed(0);
}

export function buildMinecraftStatusEmbed(
  health: MinecraftHealth,
  options?: { note?: string },
): EmbedBuilder {
  const label = STATE_LABEL[health.ec2State] ?? health.ec2State;
  const instanceId = process.env.MINECRAFT_INSTANCE_ID;
  const ec2Url = instanceId ? ec2InstanceConsoleUrl(instanceId) : null;

  const embed = new EmbedBuilder()
    .setColor(statusColor(health))
    .setTitle("Minecraft server status")
    .setFooter({ text: "Minecraft · status" })
    .setTimestamp();

  if (ec2Url) embed.setURL(ec2Url);

  let description = "";
  if (health.ec2State === "stopped") {
    description = "Use `/minecraft start` to wake the server (~1 minute).";
  } else if (health.ec2State === "pending") {
    description = "EC2 is booting — Minecraft should be ready in about a minute.";
  } else if (health.ec2State !== "running") {
    description = "Start the instance to play.";
  }
  if (options?.note) {
    description = description ? `${description}\n\n${options.note}` : options.note;
  }
  if (description) embed.setDescription(description);

  embed.addFields({ name: "EC2", value: label, inline: true });

  if (health.ec2State === "running") {
    embed.addFields(
      { name: "Port", value: portLabel(health.portOpen), inline: true },
      { name: "Service", value: serviceLabel(health.serviceActive), inline: true },
    );
    if (health.playerSummary) {
      embed.addFields({ name: "Players", value: health.playerSummary });
    }
  }

  if (health.connectAddress) {
    embed.addFields({ name: "Connect", value: `\`${health.connectAddress}\`` });
  }

  if (ec2Url) {
    embed.addFields({ name: "AWS", value: `[Open EC2 instance](${ec2Url})` });
  }

  return embed;
}

export function buildMinecraftMetricsEmbed(metrics: MinecraftMetrics): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("Minecraft metrics")
    .setDescription(`CloudWatch ~${metrics.windowMinutes}m window`)
    .setFooter({ text: "Minecraft · metrics" })
    .setTimestamp();

  if (metrics.instanceType) {
    embed.addFields({
      name: "Instance",
      value: `\`${metrics.instanceType}\``,
      inline: true,
    });
  }

  embed.addFields({
    name: "CPU",
    value:
      metrics.cpuPercent != null
        ? `${metrics.cpuPercent.toFixed(1)}%`
        : "n/a",
    inline: true,
  });

  if (metrics.networkInMbps != null || metrics.networkOutMbps != null) {
    embed.addFields({
      name: "Network",
      value: `In ${fmtMbps(metrics.networkInMbps)} · Out ${fmtMbps(metrics.networkOutMbps)}`,
      inline: true,
    });
  }

  if (metrics.volume) {
    const { volumeId, sizeGb, iops, throughputMbps } = metrics.volume;
    const capIops = iops ?? 0;
    const capTp = throughputMbps ?? 0;
    embed.addFields({
      name: "EBS volume",
      value:
        `\`${volumeId}\` · ${sizeGb} GB gp3` +
        (iops ? ` · ${iops} IOPS / ${throughputMbps ?? "?"} MiB/s provisioned` : ""),
    });

    const totalIops =
      metrics.readIops != null && metrics.writeIops != null
        ? metrics.readIops + metrics.writeIops
        : null;
    embed.addFields({
      name: "EBS IOPS",
      value:
        `Read ${fmtIops(metrics.readIops)} · Write ${fmtIops(metrics.writeIops)}` +
        (totalIops != null
          ? ` · Total ${fmtIops(totalIops)}${pct(totalIops, capIops)}`
          : ""),
    });
    embed.addFields({
      name: "EBS throughput",
      value:
        `Read ${fmtMbps(metrics.readThroughputMbps)} · Write ${fmtMbps(metrics.writeThroughputMbps)}` +
        (metrics.readThroughputMbps != null &&
        metrics.writeThroughputMbps != null &&
        capTp > 0
          ? pct(
              metrics.readThroughputMbps + metrics.writeThroughputMbps,
              capTp,
            )
          : ""),
    });
  }

  const hostFields: { name: string; value: string; inline: boolean }[] = [];
  if (metrics.loadAverage) {
    hostFields.push({ name: "Load avg", value: metrics.loadAverage, inline: true });
  }
  if (metrics.memorySummary) {
    hostFields.push({ name: "Memory", value: metrics.memorySummary, inline: true });
  }
  if (metrics.diskSummary) {
    hostFields.push({ name: "Root disk", value: metrics.diskSummary, inline: true });
  }
  if (hostFields.length > 0) embed.addFields(hostFields);

  if (
    !metrics.loadAverage &&
    !metrics.memorySummary &&
    metrics.cpuPercent == null
  ) {
    embed.addFields({
      name: "Note",
      value:
        "Host stats need SSM or SSH. CloudWatch needs `cloudwatch:GetMetricData` and `ec2:DescribeVolumes` on the bot IAM user.",
    });
  }

  return embed;
}

export function buildMinecraftLogsEmbed(raw: string, lines: number): EmbedBuilder {
  const body = truncateForDiscord(raw, 3900);
  return new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setTitle("Minecraft logs")
    .setDescription(`Last **${lines}** lines per section.\n\`\`\`\n${body}\n\`\`\``)
    .setFooter({ text: "Minecraft · logs" })
    .setTimestamp();
}

export function buildMinecraftStartEmbed(
  before: MinecraftServerState,
  after: MinecraftServerState,
  health: MinecraftHealth,
): EmbedBuilder {
  let note: string | undefined;
  if (before.state === "running") note = "Already running.";
  else if (after.state === "pending" || after.state === "running") {
    note = "Booting the EC2 instance. Give it a minute, then connect.";
  }
  return buildMinecraftStatusEmbed(health, { note });
}

export function buildMinecraftStopEmbed(
  before: MinecraftServerState,
  after: MinecraftServerState,
  health: MinecraftHealth,
): EmbedBuilder {
  let note: string | undefined;
  if (before.state === "stopped") note = "Already stopped.";
  else if (after.state === "stopping" || after.state === "stopped") {
    note = "Stopping the instance. Compute billing stops once it reaches **Offline**.";
  }
  return buildMinecraftStatusEmbed(health, { note });
}
