import { getDb } from "@/db/database";

export function getMinecraftWatchValue(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM minecraft_watch_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMinecraftWatchValue(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO minecraft_watch_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
