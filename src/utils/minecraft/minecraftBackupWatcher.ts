import {
  getMinecraftWatchValue,
  setMinecraftWatchValue,
} from "@/db/minecraftWatchState";
import { MS_IN_ONE_MINUTE } from "@/constants/constants";
import { notifyMinecraftChannel } from "@/utils/minecraft/minecraftNotify";
import {
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 5 * MS_IN_ONE_MINUTE;
const WATCH_KEY = "last_backup_key";
const ARCHIVES_PREFIX = "archives/";

let timer: NodeJS.Timeout | null = null;

function s3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION });
}

function backupBucket(): string | null {
  return process.env.MINECRAFT_BACKUP_BUCKET ?? null;
}

export function isMinecraftBackupWatchConfigured(): boolean {
  return !!(process.env.AWS_REGION && backupBucket());
}

function latestBackup(objects: _Object[]): _Object | null {
  const backups = objects.filter(
    (obj) =>
      obj.Key?.startsWith(ARCHIVES_PREFIX) && obj.Key.endsWith(".tar.gz"),
  );
  if (backups.length === 0) return null;

  return backups.reduce((latest, obj) => {
    if (!latest.LastModified || !obj.LastModified) return latest;
    return obj.LastModified > latest.LastModified ? obj : latest;
  });
}

async function pollBackups(client: Client): Promise<void> {
  const bucket = backupBucket();
  if (!bucket) return;

  try {
    const res = await s3Client().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: ARCHIVES_PREFIX }),
    );

    const newest = latestBackup(res.Contents ?? []);
    if (!newest?.Key) return;

    const previous = getMinecraftWatchValue(WATCH_KEY);
    if (!previous) {
      setMinecraftWatchValue(WATCH_KEY, newest.Key);
      console.log(`[minecraft] backup watch baseline: ${newest.Key}`);
      return;
    }

    if (newest.Key === previous) return;

    setMinecraftWatchValue(WATCH_KEY, newest.Key);
    const stamp = newest.Key.replace(ARCHIVES_PREFIX, "")
      .replace(/^data-/, "")
      .replace(/\.tar\.gz$/, "");
    await notifyMinecraftChannel(
      client,
      `**S3 backup saved** → \`s3://${bucket}/${newest.Key}\`${stamp ? ` (${stamp} UTC)` : ""}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[minecraft] backup watch failed: ${reason}`);
  }
}

export function startMinecraftBackupWatcher(client: Client): void {
  if (!isMinecraftBackupWatchConfigured()) return;
  if (timer) return;

  void pollBackups(client);
  timer = setInterval(() => {
    void pollBackups(client);
  }, POLL_INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[minecraft] backup watcher started (bucket=${backupBucket()}, every ${POLL_INTERVAL_MS / MS_IN_ONE_MINUTE}m)`,
  );
}

export function stopMinecraftBackupWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
