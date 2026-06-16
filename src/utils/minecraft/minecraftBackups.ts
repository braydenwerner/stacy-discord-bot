import {
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";

/** Top-level S3 key prefix for world backup tarballs (e.g. data-20260605T180006Z.tar.gz). */
export const MINECRAFT_BACKUP_KEY_PREFIX = "data-";

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

export function isMinecraftBackupKey(key: string): boolean {
  return (
    key.startsWith(MINECRAFT_BACKUP_KEY_PREFIX) && key.endsWith(".tar.gz")
  );
}

async function listBackupObjects(
  bucket: string,
  prefix: string,
): Promise<_Object[]> {
  const res = await s3Client().send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
  );
  return res.Contents ?? [];
}

export async function listMinecraftBackups(
  limit = 10,
): Promise<MinecraftBackup[]> {
  const bucket = minecraftBackupBucket();
  if (!bucket) {
    throw new Error("MINECRAFT_BACKUP_BUCKET is not set.");
  }

  const objects = await listBackupObjects(bucket, MINECRAFT_BACKUP_KEY_PREFIX);

  const backups = objects
    .filter((obj) => obj.Key && isMinecraftBackupKey(obj.Key))
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
