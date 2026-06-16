import { clearMessageHistory } from "@/db/messageHistory";
import { buildClearContextEmbed } from "@/utils/actionEmbeds";
import type { Message } from "discord.js";

/** Chat phrases that wipe SQLite history for the author (message must already mention STACY). */
export function isClearContextMessage(content: string): boolean {
  const text = content.toLowerCase();
  return (
    /\bclear\s+(my\s+)?context\b/.test(text) ||
    /\breset\s+(my\s+)?context\b/.test(text) ||
    /\bclear\s+(your\s+)?memory\b/.test(text) ||
    /\bforget\s+(this\s+|our\s+)?(conversation|chat|history)\b/.test(text)
  );
}

export function clearContextForUser(userId: string): number {
  return clearMessageHistory(userId);
}

export function formatClearContextReply(removed: number): string {
  if (removed > 0) {
    return `Cleared your conversation context (${removed} stored message${removed === 1 ? "" : "s"}).`;
  }
  return "Your conversation context was already empty.";
}

export async function replyClearContext(message: Message): Promise<void> {
  const removed = clearContextForUser(message.author.id);
  await message.reply({ embeds: [buildClearContextEmbed(removed)] });
}
