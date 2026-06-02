import { DEFAULT_NICE_LIST_USER_IDS } from "@/constants/defaultNiceList";
import { getDb } from "@/db/database";

export function seedDefaultNiceList(): void {
  const count = getDb()
    .prepare("SELECT COUNT(*) AS n FROM nice_list_users")
    .get() as { n: number };
  if (count.n > 0) return;

  const insert = getDb().prepare(
    "INSERT OR IGNORE INTO nice_list_users (user_id) VALUES (?)",
  );
  for (const userId of DEFAULT_NICE_LIST_USER_IDS) {
    insert.run(userId);
  }
}

export function isNiceListUser(userId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM nice_list_users WHERE user_id = ?")
    .get(userId);
  return row !== undefined;
}

export function addToNiceList(userId: string): boolean {
  const result = getDb()
    .prepare("INSERT OR IGNORE INTO nice_list_users (user_id) VALUES (?)")
    .run(userId);
  return result.changes > 0;
}

export function removeFromNiceList(userId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM nice_list_users WHERE user_id = ?")
    .run(userId);
  return result.changes > 0;
}

export function listNiceListUserIds(): string[] {
  return (
    getDb()
      .prepare("SELECT user_id FROM nice_list_users ORDER BY user_id")
      .all() as { user_id: string }[]
  ).map((row) => row.user_id);
}
