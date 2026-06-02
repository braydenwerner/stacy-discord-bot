import Database from "better-sqlite3";
import path from "path";
import { __dirname } from "@/constants/constants";

const dbPath = path.resolve(__dirname, "../../data/groups.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_group_members_group_id 
    ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_user_id 
    ON group_members(user_id);
`);

export interface Group {
  id: number;
  name: string;
  created_by: string;
  created_at: number;
}

export interface GroupMember {
  id: number;
  group_id: number;
  user_id: string;
  added_by: string;
  added_at: number;
}

export interface GroupWithMembers extends Group {
  members: string[];
}

export const groupDb = {
  createGroup(name: string, createdBy: string): Group {
    const stmt = db.prepare(
      "INSERT INTO groups (name, created_by) VALUES (?, ?) RETURNING *",
    );
    return stmt.get(name, createdBy) as Group;
  },

  getGroup(name: string): Group | undefined {
    const stmt = db.prepare("SELECT * FROM groups WHERE name = ? COLLATE NOCASE");
    return stmt.get(name) as Group | undefined;
  },

  getAllGroups(): Group[] {
    const stmt = db.prepare("SELECT * FROM groups ORDER BY name");
    return stmt.all() as Group[];
  },

  deleteGroup(name: string): boolean {
    const stmt = db.prepare("DELETE FROM groups WHERE name = ? COLLATE NOCASE");
    const result = stmt.run(name);
    return result.changes > 0;
  },

  addMemberToGroup(groupId: number, userId: string, addedBy: string): boolean {
    try {
      const stmt = db.prepare(
        "INSERT INTO group_members (group_id, user_id, added_by) VALUES (?, ?, ?)",
      );
      stmt.run(groupId, userId, addedBy);
      return true;
    } catch (error) {
      return false;
    }
  },

  removeMemberFromGroup(groupId: number, userId: string): boolean {
    const stmt = db.prepare(
      "DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
    );
    const result = stmt.run(groupId, userId);
    return result.changes > 0;
  },

  getGroupMembers(groupId: number): string[] {
    const stmt = db.prepare(
      "SELECT user_id FROM group_members WHERE group_id = ?",
    );
    const members = stmt.all(groupId) as { user_id: string }[];
    return members.map((m) => m.user_id);
  },

  getGroupWithMembers(name: string): GroupWithMembers | undefined {
    const group = this.getGroup(name);
    if (!group) return undefined;

    const members = this.getGroupMembers(group.id);
    return { ...group, members };
  },

  getAllGroupsWithMembers(): GroupWithMembers[] {
    const groups = this.getAllGroups();
    return groups.map((group) => ({
      ...group,
      members: this.getGroupMembers(group.id),
    }));
  },
};

export default db;
