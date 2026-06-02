import type { DatabaseSync } from "node:sqlite";

const MIGRATIONS: string[] = [
  `
    CREATE TABLE IF NOT EXISTS message_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('human', 'ai')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_message_history_session_id
      ON message_history (session_id, id);
  `,
  `
    CREATE TABLE IF NOT EXISTS token_totals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_input INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_calls INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO token_totals (id) VALUES (1);
  `,
  `
    CREATE TABLE IF NOT EXISTS user_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (guild_id, name)
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES user_groups (id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      added_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_group_id
      ON group_members (group_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (guild_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_guild_id
      ON contacts (guild_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS nice_list_users (
      user_id TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS favorite_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_favorite_songs_user_id
      ON favorite_songs (user_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists (user_id);

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (playlist_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id
      ON playlist_tracks (playlist_id);
  `,
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const applied = new Set(
    (
      db
        .prepare("SELECT version FROM schema_migrations")
        .all() as { version: number }[]
    ).map((row) => row.version),
  );

  const markApplied = db.prepare(
    "INSERT INTO schema_migrations (version) VALUES (?)",
  );

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (applied.has(version)) continue;
    db.exec(MIGRATIONS[i]!);
    markApplied.run(version);
  }
}
