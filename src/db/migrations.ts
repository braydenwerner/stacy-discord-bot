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
