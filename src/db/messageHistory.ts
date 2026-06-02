import { getDb } from "@/db/database";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";

const MAX_HISTORY_MESSAGES = 10;

const insertMessage = () =>
  getDb().prepare(
    "INSERT INTO message_history (session_id, role, content) VALUES (?, ?, ?)",
  );

const pruneMessages = () =>
  getDb().prepare(`
    DELETE FROM message_history
    WHERE session_id = ?
      AND id NOT IN (
        SELECT id FROM message_history
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      )
  `);

const selectRecentMessages = () =>
  getDb().prepare(`
    SELECT role, content FROM message_history
    WHERE session_id = ?
      AND id IN (
        SELECT id FROM message_history
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      )
    ORDER BY id ASC
  `);

export function getHistory(sessionId: string): BaseMessage[] {
  const rows = selectRecentMessages().all(
    sessionId,
    sessionId,
    MAX_HISTORY_MESSAGES,
  ) as { role: "human" | "ai"; content: string }[];

  return rows.map((row) =>
    row.role === "human"
      ? new HumanMessage(row.content)
      : new AIMessage(row.content),
  );
}

export function recordTurn(
  sessionId: string,
  userText: string,
  stacyText: string,
): void {
  const insert = insertMessage();
  insert.run(sessionId, "human", userText);
  insert.run(sessionId, "ai", stacyText);
  pruneMessages().run(sessionId, sessionId, MAX_HISTORY_MESSAGES);
}
