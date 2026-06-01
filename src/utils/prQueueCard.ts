import { getUsageSnapshot } from "@/utils/tokenTracker";
import type { QueueSnapshot } from "@/utils/prQueue";
import { EmbedBuilder, Message } from "discord.js";

// A single live message the queue worker keeps up to date. Module-level so there
// is exactly one card at a time.
let cardMessage: Message | null = null;

const MAX_TASK_LEN = 120;

function truncate(text: string, max = MAX_TASK_LEN): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function buildEmbed(snapshot: QueueSnapshot, finalized = false): EmbedBuilder {
  const { active, pending } = snapshot;

  const workingValue = active
    ? `${truncate(active.task)}\n\u23f1 ${formatElapsed(Date.now() - active.startedAt)}` +
      (active.url ? ` \u2022 [agent](${active.url})` : " \u2022 starting\u2026")
    : "Idle";

  const upNextValue = pending.length
    ? pending.map((p) => `\`${p.position}.\` ${truncate(p.task, 80)}`).join("\n")
    : "(empty)";

  const usage = getUsageSnapshot();
  const footer = `Tokens: ${formatTokens(usage.totalInput)} in / ${formatTokens(
    usage.totalOutput,
  )} out (~$${usage.totalCost.toFixed(2)})`;

  return new EmbedBuilder()
    .setColor(active ? 0xfaa61a : 0x57f287)
    .setTitle(finalized && !active ? "PR Queue (idle)" : "PR Queue")
    .addFields(
      { name: "Now working on", value: workingValue },
      { name: "Up next", value: upNextValue },
    )
    .setFooter({ text: footer })
    .setTimestamp();
}

// Creates the card on the first job of a batch, or refreshes it if one exists.
export async function ensureQueueCard(
  message: Message,
  snapshot: QueueSnapshot,
): Promise<void> {
  if (cardMessage) {
    await refreshQueueCard(snapshot);
    return;
  }
  if (!message.channel.isSendable()) return;
  try {
    cardMessage = await message.channel.send({ embeds: [buildEmbed(snapshot)] });
  } catch (error) {
    console.error(`[prCard] failed to post card: ${error}`);
  }
}

export async function refreshQueueCard(snapshot: QueueSnapshot): Promise<void> {
  if (!cardMessage) return;
  try {
    await cardMessage.edit({ embeds: [buildEmbed(snapshot)] });
  } catch (error) {
    console.error(`[prCard] failed to edit card: ${error}`);
  }
}

// Final edit when the queue drains, then release the ref so the next batch posts
// a fresh card.
export async function finalizeQueueCard(snapshot: QueueSnapshot): Promise<void> {
  if (!cardMessage) return;
  try {
    await cardMessage.edit({ embeds: [buildEmbed(snapshot, true)] });
  } catch (error) {
    console.error(`[prCard] failed to finalize card: ${error}`);
  }
  cardMessage = null;
}
