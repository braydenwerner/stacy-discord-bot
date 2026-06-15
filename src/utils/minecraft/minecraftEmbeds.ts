import type {
  BackupSource,
  MinecraftBackup,
} from "@/utils/minecraft/minecraftBackups";
import {
  formatBackupStamp,
  formatBytes,
} from "@/utils/minecraft/minecraftObservability";
import type { MinecraftServerState } from "@/utils/minecraft/minecraftClient";
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
    .setFooter({ text: "Minecraft · S3 archives" })
    .setTimestamp();

  if (backups.length === 0) {
    embed.setDescription(
      `Bucket: [Open in AWS Console](${bucketUrl})\n\`${bucket}\`\n\nNo archives found under \`archives/\`.`,
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
    name: `Recent archives (${backups.length})`,
    value: lines.join("\n\n").slice(0, 1024),
  });

  return embed;
}
