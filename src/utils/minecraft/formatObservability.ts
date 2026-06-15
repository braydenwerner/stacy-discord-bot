import type { MinecraftBackup } from "@/utils/minecraft/minecraftBackups";
import type {
  MinecraftHealth,
  MinecraftMetrics,
} from "@/utils/minecraft/minecraftObservability";
import {
  formatBackupAge,
  formatBackupStamp,
  formatBytes,
  truncateForDiscord,
} from "@/utils/minecraft/minecraftObservability";

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

export function formatMinecraftHealth(health: MinecraftHealth): string {
  const lines = [`**Minecraft health**`];

  if (health.ec2State !== "running") {
    lines.push(`EC2: **${health.ec2State}** — start the instance to play.`);
    return lines.join("\n");
  }

  if (health.portOpen === true) {
    lines.push("Port: **open** — Paper is accepting connections.");
  } else if (health.portOpen === false) {
    lines.push(
      "Port: **closed** — EC2 is running but nothing is listening yet (boot/install may still be running).",
    );
  }

  if (health.serviceActive === true) {
    lines.push("Service: `minecraft.service` **active**");
  } else if (health.serviceActive === false) {
    lines.push("Service: `minecraft.service` **inactive**");
  }

  if (health.playerSummary) {
    lines.push(health.playerSummary);
  }

  if (health.connectAddress) {
    lines.push(`Connect: \`${health.connectAddress}\``);
  }

  return lines.join("\n");
}

export function formatMinecraftLogs(raw: string): string {
  const body = truncateForDiscord(raw, 1700);
  return `**Minecraft logs**\n\`\`\`\n${body}\n\`\`\``;
}

export function formatMinecraftBackups(
  bucket: string,
  backups: MinecraftBackup[],
): string {
  const lines = [`**Minecraft S3 backups**`, `Bucket: \`${bucket}\``];

  if (backups.length === 0) {
    lines.push("No archives found under `archives/`.");
    return lines.join("\n");
  }

  lines.push(`Showing **${backups.length}** most recent:`);
  for (const backup of backups) {
    const stamp = formatBackupStamp(backup.key);
    const age = formatBackupAge(backup.lastModified);
    const size = formatBytes(backup.sizeBytes);
    lines.push(`• \`${stamp}\` — ${size}, ${age}`);
  }

  return lines.join("\n");
}

export function formatMinecraftMetrics(metrics: MinecraftMetrics): string {
  const lines = [
    `**Minecraft metrics** (CloudWatch ~${metrics.windowMinutes}m window)`,
  ];

  if (metrics.instanceType) {
    lines.push(`Instance: \`${metrics.instanceType}\``);
  }

  if (metrics.cpuPercent != null) {
    lines.push(`CPU: **${metrics.cpuPercent.toFixed(1)}%**`);
  } else {
    lines.push("CPU: n/a (needs `cloudwatch:GetMetricData` on bot IAM user)");
  }

  if (metrics.volume) {
    const { volumeId, sizeGb, iops, throughputMbps } = metrics.volume;
    const capIops = iops ?? 0;
    const capTp = throughputMbps ?? 0;
    lines.push(
      `EBS \`${volumeId}\`: ${sizeGb} GB gp3` +
        (iops ? ` — ${iops} IOPS / ${throughputMbps ?? "?"} MiB/s provisioned` : ""),
    );

    const totalIops =
      metrics.readIops != null && metrics.writeIops != null
        ? metrics.readIops + metrics.writeIops
        : null;
    lines.push(
      `  IOPS — read ${fmtIops(metrics.readIops)}, write ${fmtIops(metrics.writeIops)}` +
        (totalIops != null
          ? `, total ${fmtIops(totalIops)}${pct(totalIops, capIops)}`
          : ""),
    );
    lines.push(
      `  Throughput — read ${fmtMbps(metrics.readThroughputMbps)}, write ${fmtMbps(metrics.writeThroughputMbps)}` +
        (metrics.readThroughputMbps != null &&
        metrics.writeThroughputMbps != null &&
        capTp > 0
          ? pct(
              metrics.readThroughputMbps + metrics.writeThroughputMbps,
              capTp,
            )
          : ""),
    );
  }

  if (metrics.networkInMbps != null || metrics.networkOutMbps != null) {
    lines.push(
      `Network — in ${fmtMbps(metrics.networkInMbps)}, out ${fmtMbps(metrics.networkOutMbps)}`,
    );
  }

  if (metrics.loadAverage) {
    lines.push(`Load avg: ${metrics.loadAverage}`);
  }
  if (metrics.memorySummary) {
    lines.push(`Memory: ${metrics.memorySummary}`);
  }
  if (metrics.diskSummary) {
    lines.push(`Root disk: ${metrics.diskSummary}`);
  }

  if (
    !metrics.loadAverage &&
    !metrics.memorySummary &&
    metrics.cpuPercent == null
  ) {
    lines.push(
      "_Host stats need SSM or SSH; CloudWatch needs IAM `cloudwatch:GetMetricData` + `ec2:DescribeVolumes`._",
    );
  }

  return lines.join("\n");
}
