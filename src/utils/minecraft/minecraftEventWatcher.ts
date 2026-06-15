import {
  getMinecraftWatchValue,
  setMinecraftWatchValue,
} from "@/db/minecraftWatchState";
import { MS_IN_ONE_MINUTE } from "@/constants/constants";
import { isMinecraftBackupConfigured } from "@/utils/minecraft/minecraftBackups";
import { buildIdleShutdownEmbed } from "@/utils/minecraft/minecraftEmbeds";
import { notifyMinecraftEmbed } from "@/utils/minecraft/minecraftNotify";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { Client } from "discord.js";

const POLL_INTERVAL_MS = 2 * MS_IN_ONE_MINUTE;
const WATCH_KEY = "last_idle_shutdown_event";
export const IDLE_SHUTDOWN_AT_KEY = "last_idle_shutdown_at";
const EVENTS_PREFIX = "events/";
const IDLE_EVENT_PREFIX = "events/idle-shutdown-";

let timer: NodeJS.Timeout | null = null;

function s3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION });
}

function backupBucket(): string | null {
  return process.env.MINECRAFT_BACKUP_BUCKET ?? null;
}

type IdleShutdownEvent = {
  type: string;
  idleMinutes?: number;
  elapsedMinutes?: number;
  at?: string;
};

async function fetchIdleEvent(
  bucket: string,
  key: string,
): Promise<IdleShutdownEvent | null> {
  const res = await s3Client().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const body = await res.Body?.transformToString();
  if (!body) return null;
  return JSON.parse(body) as IdleShutdownEvent;
}

function latestIdleEventKey(
  keys: string[],
): string | null {
  const idleKeys = keys
    .filter((k) => k.startsWith(IDLE_EVENT_PREFIX) && k.endsWith(".json"))
    .sort();
  return idleKeys.at(-1) ?? null;
}

async function pollIdleShutdownEvents(client: Client): Promise<void> {
  const bucket = backupBucket();
  if (!bucket) return;

  try {
    const res = await s3Client().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: EVENTS_PREFIX }),
    );

    const newestKey = latestIdleEventKey(
      (res.Contents ?? [])
        .map((obj) => obj.Key)
        .filter((key): key is string => !!key),
    );
    if (!newestKey) return;

    const previous = getMinecraftWatchValue(WATCH_KEY);
    if (!previous) {
      setMinecraftWatchValue(WATCH_KEY, newestKey);
      console.log(`[minecraft] idle-shutdown watch baseline: ${newestKey}`);
      return;
    }

    if (newestKey === previous) return;

    setMinecraftWatchValue(WATCH_KEY, newestKey);

    const event = await fetchIdleEvent(bucket, newestKey);
    const idleMinutes = event?.idleMinutes ?? "?";
    const elapsedMinutes = event?.elapsedMinutes ?? "?";

    const at = new Date();
    setMinecraftWatchValue(IDLE_SHUTDOWN_AT_KEY, at.toISOString());

    const embed = buildIdleShutdownEmbed({
      idleMinutes,
      elapsedMinutes,
      at,
    });
    await notifyMinecraftEmbed(client, embed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[minecraft] idle-shutdown watch failed: ${reason}`);
  }
}

export function isMinecraftEventWatchConfigured(): boolean {
  return isMinecraftBackupConfigured();
}

export function recentIdleShutdownMs(maxAgeMs = 20 * MS_IN_ONE_MINUTE): boolean {
  const at = getMinecraftWatchValue(IDLE_SHUTDOWN_AT_KEY);
  if (!at) return false;
  const ts = Date.parse(at);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

export function startMinecraftEventWatcher(client: Client): void {
  if (!isMinecraftEventWatchConfigured()) return;
  if (timer) return;

  void pollIdleShutdownEvents(client);
  timer = setInterval(() => {
    void pollIdleShutdownEvents(client);
  }, POLL_INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[minecraft] idle-shutdown watcher started (every ${POLL_INTERVAL_MS / MS_IN_ONE_MINUTE}m)`,
  );
}

export function stopMinecraftEventWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
