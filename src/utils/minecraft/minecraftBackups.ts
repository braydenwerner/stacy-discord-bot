import {
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

export const MINECRAFT_ARCHIVES_PREFIX = "archives/";

export type BackupSource = "periodic" | "idle" | "stop" | "manual";

export type MinecraftBackup = {
  key: string;
  lastModified: Date | null;
  sizeBytes: number | null;
  source?: BackupSource;
};

function s3Client(): S3Client {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not set.");
  return new S3Client({ region });
}

export function minecraftBackupBucket(): string | null {
  return process.env.MINECRAFT_BACKUP_BUCKET ?? null;
}

export function isMinecraftBackupConfigured(): boolean {
  return !!(process.env.AWS_REGION && minecraftBackupBucket());
}

function isBackupKey(key: string): boolean {
  return key.startsWith(MINECRAFT_ARCHIVES_PREFIX) && key.endsWith(".tar.gz");
}

export async function listMinecraftBackups(
  limit = 10,
): Promise<MinecraftBackup[]> {
  const bucket = minecraftBackupBucket();
  if (!bucket) {
    throw new Error("MINECRAFT_BACKUP_BUCKET is not set.");
  }

  const res = await s3Client().send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: MINECRAFT_ARCHIVES_PREFIX }),
  );

  const backups = (res.Contents ?? [])
    .filter((obj) => obj.Key && isBackupKey(obj.Key))
    .map((obj) => ({
      key: obj.Key!,
      lastModified: obj.LastModified ?? null,
      sizeBytes: obj.Size ?? null,
    }))
    .sort((a, b) => {
      const at = a.lastModified?.getTime() ?? 0;
      const bt = b.lastModified?.getTime() ?? 0;
      return bt - at;
    });

  return backups.slice(0, limit);
}

export function formatBackupStamp(key: string): string {
  return key
    .replace(MINECRAFT_ARCHIVES_PREFIX, "")
    .replace(/^data-/, "")
    .replace(/\.tar\.gz$/, "");
}

export async function getBackupSource(key: string): Promise<BackupSource> {
  const bucket = minecraftBackupBucket();
  if (!bucket) return "manual";

  try {
    const res = await s3Client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    const source = res.Metadata?.source;
    if (source === "periodic" || source === "idle" || source === "stop") {
      return source;
    }
  } catch {
    // HeadObject optional — fall back to generic label.
  }
  return "manual";
}

export function formatBackupNotifyMessage(
  bucket: string,
  key: string,
  source: BackupSource,
  stamp: string,
  sizeBytes: number | null,
): string {
  const labels: Record<BackupSource, string> = {
    periodic: "**Periodic world backup saved**",
    idle: "**Idle-shutdown world backup saved**",
    stop: "**Pre-stop world backup saved**",
    manual: "**S3 world backup saved**",
  };

  const size =
    sizeBytes == null
      ? ""
      : sizeBytes < 1024 ** 2
        ? ` (${(sizeBytes / 1024).toFixed(0)} KB)`
        : sizeBytes < 1024 ** 3
          ? ` (${(sizeBytes / 1024 ** 2).toFixed(1)} MB)`
          : ` (${(sizeBytes / 1024 ** 3).toFixed(2)} GB)`;

  const time = stamp ? ` (${stamp} UTC)` : "";
  return `${labels[source]}${size} → \`s3://${bucket}/${key}\`${time}`;
}
