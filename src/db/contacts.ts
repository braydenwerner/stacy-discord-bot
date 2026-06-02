import { getDb } from "@/db/database";
import { normalizeName } from "@/utils/normalizeName";

export type Contact = {
  name: string;
  userId: string;
};

function requireGuildId(guildId: string | null): string {
  if (!guildId) throw new Error("Guild ID is required for contacts.");
  return guildId;
}

function isDiscordId(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

export function addContact(
  guildId: string | null,
  name: string,
  userId: string,
): void {
  const guild = requireGuildId(guildId);
  if (!name.trim()) throw new Error("Name is required to add a person.");
  if (!userId.trim()) throw new Error("Discord user ID is required to add a person.");
  if (!isDiscordId(userId.trim())) {
    throw new Error("Discord user ID must be a numeric snowflake (17–20 digits).");
  }

  const normalized = normalizeName(name);
  const displayName = name.trim();

  try {
    getDb()
      .prepare(
        `INSERT INTO contacts (guild_id, name, display_name, user_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(guild, normalized, displayName, userId.trim());
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new Error(`A contact with that name already exists in this server.`);
    }
    throw error;
  }
}

export function removeContact(
  guildId: string | null,
  name: string,
): boolean {
  const guild = requireGuildId(guildId);
  if (!name.trim()) throw new Error("Name is required to remove a person.");

  const result = getDb()
    .prepare(`DELETE FROM contacts WHERE guild_id = ? AND name = ?`)
    .run(guild, normalizeName(name));
  return result.changes > 0;
}

export function updateContact(
  guildId: string | null,
  name: string,
  updates: { newName?: string; newUserId?: string },
): boolean {
  const guild = requireGuildId(guildId);
  if (!name.trim()) throw new Error("Name is required to update a person.");
  if (!updates.newName?.trim() && !updates.newUserId?.trim()) {
    throw new Error("Provide a new name and/or new Discord user ID to update.");
  }
  if (updates.newUserId && !isDiscordId(updates.newUserId.trim())) {
    throw new Error("Discord user ID must be a numeric snowflake (17–20 digits).");
  }

  const existing = getContactByName(guild, name);
  if (!existing) return false;

  const nextName = updates.newName?.trim()
    ? normalizeName(updates.newName)
    : existing.name;
  const nextDisplay = updates.newName?.trim() ?? existing.display_name;
  const nextUserId = updates.newUserId?.trim() ?? existing.user_id;

  try {
    getDb()
      .prepare(
        `UPDATE contacts
         SET name = ?, display_name = ?, user_id = ?
         WHERE guild_id = ? AND name = ?`,
      )
      .run(
        nextName,
        nextDisplay,
        nextUserId,
        guild,
        normalizeName(name),
      );
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new Error(`That name is already used by another contact.`);
    }
    throw error;
  }
}

export function listContacts(guildId: string | null): Contact[] {
  const guild = requireGuildId(guildId);
  const rows = getDb()
    .prepare(
      `SELECT display_name, user_id FROM contacts
       WHERE guild_id = ?
       ORDER BY display_name COLLATE NOCASE`,
    )
    .all(guild) as { display_name: string; user_id: string }[];

  return rows.map((row) => ({
    name: row.display_name,
    userId: row.user_id,
  }));
}

type ContactRow = {
  name: string;
  display_name: string;
  user_id: string;
};

export function getContactByName(
  guildId: string,
  rawName: string,
): ContactRow | undefined {
  return getDb()
    .prepare(
      `SELECT name, display_name, user_id FROM contacts
       WHERE guild_id = ? AND name = ?`,
    )
    .get(guildId, normalizeName(rawName)) as ContactRow | undefined;
}

export function getDisplayNameForUserId(
  guildId: string | null,
  userId: string,
): string {
  if (!guildId) return `<@${userId}>`;

  const rows = getDb()
    .prepare(
      `SELECT display_name, name FROM contacts
       WHERE guild_id = ? AND user_id = ?
       ORDER BY LENGTH(name) ASC`,
    )
    .all(guildId, userId) as { display_name: string; name: string }[];

  if (rows.length === 0) return `<@${userId}>`;
  const preferred = rows.find((r) => !r.name.includes(" "));
  return preferred?.display_name ?? rows[0]!.display_name;
}

export function resolveContactUserId(
  guildId: string | null,
  rawName: string,
): string | undefined {
  if (!guildId) return undefined;

  const name = normalizeName(rawName);
  const direct = getContactByName(guildId, name);
  if (direct) return direct.user_id;

  const [first, second] = name.split(" ");
  if (first === "michael") {
    if (second?.startsWith("f")) {
      return getContactByName(guildId, "michael f")?.user_id;
    }
    return (
      getContactByName(guildId, "michael")?.user_id ??
      getContactByName(guildId, "michael d")?.user_id
    );
  }

  return getContactByName(guildId, first)?.user_id;
}
