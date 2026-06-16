import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataResult,
  type MetricStat,
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import net from "node:net";
import { getMinecraftServerState } from "@/utils/minecraft/minecraftClient";
import {
  formatBackupStamp,
  listMinecraftBackups,
  minecraftBackupBucket,
} from "@/utils/minecraft/minecraftBackups";
import { runOnMinecraftHost } from "@/utils/minecraft/minecraftRemote";

const METRIC_WINDOW_MINUTES = 5;
const METRIC_PERIOD_SECONDS = 300;

export type MinecraftHealth = {
  ec2State: string;
  portOpen: boolean | null;
  serviceActive: boolean | null;
  playerSummary: string | null;
  connectAddress: string | null;
};

export type MinecraftVolumeLimits = {
  volumeId: string;
  sizeGb: number;
  iops: number | null;
  throughputMbps: number | null;
};

export type MinecraftMetrics = {
  instanceType: string | null;
  volume: MinecraftVolumeLimits | null;
  cpuPercent: number | null;
  readIops: number | null;
  writeIops: number | null;
  readThroughputMbps: number | null;
  writeThroughputMbps: number | null;
  networkInMbps: number | null;
  networkOutMbps: number | null;
  loadAverage: string | null;
  memorySummary: string | null;
  diskSummary: string | null;
  windowMinutes: number;
};

function ec2Client(region: string): EC2Client {
  return new EC2Client({ region });
}

function cloudWatchClient(region: string): CloudWatchClient {
  return new CloudWatchClient({ region });
}

function requireAws(): { instanceId: string; region: string } {
  const instanceId = process.env.MINECRAFT_INSTANCE_ID;
  const region = process.env.AWS_REGION;
  if (!instanceId) throw new Error("MINECRAFT_INSTANCE_ID is not set.");
  if (!region) throw new Error("AWS_REGION is not set.");
  return { instanceId, region };
}

export function probeMinecraftPort(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function describeVolumeLimits(
  instanceId: string,
  region: string,
): Promise<MinecraftVolumeLimits | null> {
  const res = await ec2Client(region).send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );
  const instance = res.Reservations?.[0]?.Instances?.[0];
  const volumeId = instance?.BlockDeviceMappings?.find(
    (m) => m.Ebs?.VolumeId,
  )?.Ebs?.VolumeId;
  if (!volumeId) return null;

  const volRes = await ec2Client(region).send(
    new DescribeVolumesCommand({ VolumeIds: [volumeId] }),
  );
  const volume = volRes.Volumes?.[0];
  if (!volume) return null;

  return {
    volumeId,
    sizeGb: volume.Size ?? 0,
    iops: volume.Iops ?? null,
    throughputMbps: volume.Throughput ?? null,
  };
}

function metricEndTime(): Date {
  return new Date();
}

function metricStartTime(): Date {
  return new Date(Date.now() - METRIC_WINDOW_MINUTES * 60 * 1000);
}

function latestAverage(result: MetricDataResult | undefined): number | null {
  const points = result?.Timestamps?.length
    ? result.Timestamps.map((t: Date, i: number) => ({
        time: t.getTime(),
        value: result.Values?.[i] ?? 0,
      }))
    : [];
  if (points.length === 0) return null;
  points.sort((a: { time: number }, b: { time: number }) => a.time - b.time);
  return points.at(-1)?.value ?? null;
}

function latestSumPerSecond(result: MetricDataResult | undefined): number | null {
  const total = latestAverage(result);
  if (total == null) return null;
  return total / METRIC_PERIOD_SECONDS;
}

function latestBytesPerSecondToMbps(
  result: MetricDataResult | undefined,
): number | null {
  const bps = latestSumPerSecond(result);
  if (bps == null) return null;
  return (bps * 8) / (1024 * 1024);
}

async function fetchCloudWatchMetrics(
  instanceId: string,
  region: string,
  volumeId: string | null,
): Promise<{
  cpuPercent: number | null;
  readIops: number | null;
  writeIops: number | null;
  readThroughputMbps: number | null;
  writeThroughputMbps: number | null;
  networkInMbps: number | null;
  networkOutMbps: number | null;
}> {
  const queries: MetricStat[] = [
    {
      Metric: {
        Namespace: "AWS/EC2",
        MetricName: "CPUUtilization",
        Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      },
      Period: METRIC_PERIOD_SECONDS,
      Stat: "Average",
    },
    {
      Metric: {
        Namespace: "AWS/EC2",
        MetricName: "NetworkIn",
        Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      },
      Period: METRIC_PERIOD_SECONDS,
      Stat: "Sum",
    },
    {
      Metric: {
        Namespace: "AWS/EC2",
        MetricName: "NetworkOut",
        Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      },
      Period: METRIC_PERIOD_SECONDS,
      Stat: "Sum",
    },
  ];

  if (volumeId) {
    const volDim = [{ Name: "VolumeId", Value: volumeId }];
    queries.push(
      {
        Metric: {
          Namespace: "AWS/EBS",
          MetricName: "VolumeReadOps",
          Dimensions: volDim,
        },
        Period: METRIC_PERIOD_SECONDS,
        Stat: "Sum",
      },
      {
        Metric: {
          Namespace: "AWS/EBS",
          MetricName: "VolumeWriteOps",
          Dimensions: volDim,
        },
        Period: METRIC_PERIOD_SECONDS,
        Stat: "Sum",
      },
      {
        Metric: {
          Namespace: "AWS/EBS",
          MetricName: "VolumeReadBytes",
          Dimensions: volDim,
        },
        Period: METRIC_PERIOD_SECONDS,
        Stat: "Sum",
      },
      {
        Metric: {
          Namespace: "AWS/EBS",
          MetricName: "VolumeWriteBytes",
          Dimensions: volDim,
        },
        Period: METRIC_PERIOD_SECONDS,
        Stat: "Sum",
      },
    );
  }

  const res = await cloudWatchClient(region).send(
    new GetMetricDataCommand({
      StartTime: metricStartTime(),
      EndTime: metricEndTime(),
      MetricDataQueries: queries.map((stat, i) => ({
        Id: `m${i}`,
        MetricStat: stat,
      })),
    }),
  );

  const byId = new Map(
    (res.MetricDataResults ?? []).map((r: MetricDataResult) => [r.Id ?? "", r]),
  );

  return {
    cpuPercent: latestAverage(byId.get("m0")),
    networkInMbps: latestBytesPerSecondToMbps(byId.get("m1")),
    networkOutMbps: latestBytesPerSecondToMbps(byId.get("m2")),
    readIops: volumeId ? latestSumPerSecond(byId.get("m3")) : null,
    writeIops: volumeId ? latestSumPerSecond(byId.get("m4")) : null,
    readThroughputMbps: volumeId
      ? latestBytesPerSecondToMbps(byId.get("m5"))
      : null,
    writeThroughputMbps: volumeId
      ? latestBytesPerSecondToMbps(byId.get("m6"))
      : null,
  };
}

async function fetchHostRuntimeStats(): Promise<{
  loadAverage: string | null;
  memorySummary: string | null;
  diskSummary: string | null;
}> {
  try {
    const out = await runOnMinecraftHost(`set -euo pipefail
echo "LOAD:$(cut -d' ' -f1-3 /proc/loadavg)"
free -h | awk '/^Mem:/ {print "MEM:" $3 "/" $2 " used"}'
df -h / | awk 'NR==2 {print "DISK:" $3 "/" $2 " used (" $5 ")"}'
`);
    const load = out.match(/^LOAD:(.+)$/m)?.[1] ?? null;
    const mem = out.match(/^MEM:(.+)$/m)?.[1] ?? null;
    const disk = out.match(/^DISK:(.+)$/m)?.[1] ?? null;
    return {
      loadAverage: load,
      memorySummary: mem,
      diskSummary: disk,
    };
  } catch {
    return { loadAverage: null, memorySummary: null, diskSummary: null };
  }
}

/** Paper RCON list output, e.g. "There are 0 of a max of 5 players online." */
export function parseMinecraftPlayerCount(
  playerSummary: string | null,
): number | null {
  if (!playerSummary) return null;
  const match = playerSummary.match(/There are (\d+) of/i);
  if (!match) return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
}

export async function getMinecraftHealth(): Promise<MinecraftHealth> {
  const state = await getMinecraftServerState();
  const connectAddress = state.connectAddress;

  if (state.state !== "running" || !state.host) {
    return {
      ec2State: state.state,
      portOpen: null,
      serviceActive: null,
      playerSummary: null,
      connectAddress,
    };
  }

  const portOpen = await probeMinecraftPort(state.host, state.port);

  let serviceActive: boolean | null = null;
  let playerSummary: string | null = null;

  if (portOpen) {
    try {
      const out = await runOnMinecraftHost(`set -euo pipefail
if systemctl is-active --quiet minecraft; then echo SVC:active; else echo SVC:inactive; fi
if command -v mcrcon >/dev/null 2>&1; then
  RCON_PASS="$(grep '^rcon.password=' /opt/minecraft/server/server.properties 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "$RCON_PASS" ]]; then
    PLAYERS="$(mcrcon -H 127.0.0.1 -P 25575 -p "$RCON_PASS" list 2>/dev/null | head -1 || true)"
    [[ -n "$PLAYERS" ]] && echo "PLAYERS:$PLAYERS"
  fi
fi
`);
      serviceActive = /SVC:active/.test(out);
      playerSummary = out.match(/^PLAYERS:(.+)$/m)?.[1] ?? null;
    } catch {
      // SSM/SSH unavailable — port probe is still useful.
    }
  }

  return {
    ec2State: state.state,
    portOpen,
    serviceActive,
    playerSummary,
    connectAddress,
  };
}

export async function getMinecraftLogs(lines = 25): Promise<string> {
  const capped = Math.min(Math.max(lines, 5), 60);
  const out = await runOnMinecraftHost(`set -euo pipefail
echo "=== minecraft.service ==="
sudo systemctl status minecraft --no-pager -l 2>/dev/null | head -15 || echo "(service not found)"
echo ""
echo "=== journalctl (last ${capped}) ==="
sudo journalctl -u minecraft -n ${capped} --no-pager 2>/dev/null || true
echo ""
echo "=== latest.log (last ${capped}) ==="
sudo tail -n ${capped} /opt/minecraft/server/logs/latest.log 2>/dev/null || echo "(no server log yet)"
`);
  return out;
}

export async function getMinecraftBackupReport(limit = 8): Promise<{
  bucket: string;
  backups: Awaited<ReturnType<typeof listMinecraftBackups>>;
}> {
  const bucket = minecraftBackupBucket();
  if (!bucket) throw new Error("MINECRAFT_BACKUP_BUCKET is not set.");
  const backups = await listMinecraftBackups(limit);
  return { bucket, backups };
}

export async function getMinecraftMetrics(): Promise<MinecraftMetrics> {
  const { instanceId, region } = requireAws();

  const instRes = await ec2Client(region).send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );
  const instanceType =
    instRes.Reservations?.[0]?.Instances?.[0]?.InstanceType ?? null;

  const volume = await describeVolumeLimits(instanceId, region);

  let cw = {
    cpuPercent: null as number | null,
    readIops: null as number | null,
    writeIops: null as number | null,
    readThroughputMbps: null as number | null,
    writeThroughputMbps: null as number | null,
    networkInMbps: null as number | null,
    networkOutMbps: null as number | null,
  };

  try {
    cw = await fetchCloudWatchMetrics(
      instanceId,
      region,
      volume?.volumeId ?? null,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[minecraft] CloudWatch metrics failed: ${reason}`);
  }

  const runtime =
    (await getMinecraftServerState()).state === "running"
      ? await fetchHostRuntimeStats()
      : { loadAverage: null, memorySummary: null, diskSummary: null };

  return {
    instanceType,
    volume,
    windowMinutes: METRIC_WINDOW_MINUTES,
    ...cw,
    ...runtime,
  };
}

export function truncateForDiscord(text: string, max = 1800): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 20)}\n… (truncated)`;
}

export function formatBytes(sizeBytes: number | null): string {
  if (sizeBytes == null) return "unknown size";
  if (sizeBytes < 1024 ** 2) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 ** 3) return `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(sizeBytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatBackupAge(lastModified: Date | null): string {
  if (!lastModified) return "unknown time";
  const mins = Math.round((Date.now() - lastModified.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export { formatBackupStamp };
