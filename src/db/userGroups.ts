import { getDb } from "@/db/database";
import { normalizeName } from "@/utils/normalizeName";

export type UserGroupSummary = {
  name: string;
  memberIds: string[];
};

function requireGuildId(guildId: string | null): string {
  if (!guildId) throw new Error("Guild ID is required for user groups.");
  return guildId;
}

function getGroupId(guildId: string, groupName: string): number | undefined {
  const row = getDb()
    .prepare(
      `SELECT id FROM user_groups
       WHERE guild_id = ? AND name = ?`,
    )
    .get(guildId, normalizeName(groupName)) as { id: number } | undefined;
  return row?.id;
}

export function addMemberToGroup(
  guildId: string | null,
  groupName: string,
  userId: string,
): { created: boolean } {
  const guild = requireGuildId(guildId);
  const normalized = normalizeName(groupName);
  const displayName = groupName.trim() || normalized;

  let groupId = getGroupId(guild, groupName);
  let created = false;

  if (groupId === undefined) {
    const result = getDb()
      .prepare(
        `INSERT INTO user_groups (guild_id, name, display_name)
         VALUES (?, ?, ?)`,
      )
      .run(guild, normalized, displayName);
    groupId = Number(result.lastInsertRowid);
    created = true;
  }

  getDb()
    .prepare(
      `INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`,
    )
    .run(groupId, userId);

  return { created };
}

export function removeMemberFromGroup(
  guildId: string | null,
  groupName: string,
  userId: string,
): boolean {
  const guild = requireGuildId(guildId);
  const groupId = getGroupId(guild, groupName);
  if (groupId === undefined) return false;

  const result = getDb()
    .prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`)
    .run(groupId, userId);
  return result.changes > 0;
}

export function deleteGroup(
  guildId: string | null,
  groupName: string,
): boolean {
  const guild = requireGuildId(guildId);
  const result = getDb()
    .prepare(`DELETE FROM user_groups WHERE guild_id = ? AND name = ?`)
    .run(guild, normalizeName(groupName));
  return result.changes > 0;
}

export function listGroups(guildId: string | null): UserGroupSummary[] {
  const guild = requireGuildId(guildId);
  const groups = getDb()
    .prepare(
      `SELECT id, display_name FROM user_groups
       WHERE guild_id = ?
       ORDER BY display_name COLLATE NOCASE`,
    )
    .all(guild) as { id: number; display_name: string }[];

  const membersStmt = getDb().prepare(
    `SELECT user_id FROM group_members WHERE group_id = ? ORDER BY user_id`,
  );

  return groups.map((group) => ({
    name: group.display_name,
    memberIds: (
      membersStmt.all(group.id) as { user_id: string }[]
    ).map((row) => row.user_id),
  }));
}

export function getGroupMemberIds(
  guildId: string | null,
  groupName: string,
): string[] | undefined {
  const guild = requireGuildId(guildId);
  const groupId = getGroupId(guild, groupName);
  if (groupId === undefined) return undefined;

  return (
    getDb()
      .prepare(`SELECT user_id FROM group_members WHERE group_id = ?`)
      .all(groupId) as { user_id: string }[]
  ).map((row) => row.user_id);
}

export function resolveGroupIds(
  guildId: string | null,
  rawGroup: string,
): string[] | undefined {
  const guild = requireGuildId(guildId);
  const key = normalizeName(rawGroup).replace(/\bgroup\b/g, "").trim();

  const groups = listGroups(guild);
  const exact = groups.find((g) => normalizeName(g.name) === key);
  if (exact) return exact.memberIds;

  const partial = groups.find((g) => key.includes(normalizeName(g.name)));
  return partial?.memberIds;
}
