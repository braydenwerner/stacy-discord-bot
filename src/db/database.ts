import { migrateFavoriteSongsToPlaylists } from "@/db/playlists";
import { runMigrations } from "@/db/migrations";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "stacy.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error("Database not initialized — call initDatabase() at startup");
  }
  return db;
}

export function initDatabase(
  dbPath = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH,
): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  migrateFavoriteSongsToPlaylists();

  console.log(`[db] opened ${dbPath}`);
  return db;
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
