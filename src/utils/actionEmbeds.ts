import type { BulkAddOutcome } from "@/utils/bulkGroupMembers";
import { EmbedBuilder } from "discord.js";

export const ACTION_COLORS = {
  success: 0x57f287,
  info: 0x1abc9c,
  warning: 0xfaa61a,
  danger: 0xed4245,
  neutral: 0x95a5a6,
} as const;

export function buildActionEmbed(options: {
  title: string;
  description: string;
  color?: number;
  footer?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(options.color ?? ACTION_COLORS.info)
    .setTitle(options.title)
    .setDescription(options.description)
    .setTimestamp();

  if (options.footer) embed.setFooter({ text: options.footer });
  return embed;
}

export function buildBulkGroupEmbed(
  groupName: string,
  outcome: BulkAddOutcome,
): EmbedBuilder {
  const lines: string[] = [];

  if (outcome.resolved.length > 0) {
    const names = outcome.resolved.map((m) => `**${m.label}**`).join(", ");
    lines.push(
      outcome.created
        ? `Created **${groupName.trim()}** with ${names}.`
        : `Added ${names} to **${groupName.trim()}**.`,
    );
  } else if (outcome.failed.length > 0) {
    lines.push(
      `Could not create **${groupName.trim()}** — no members were added.`,
    );
  }

  if (outcome.failed.length > 0) {
    const failList = outcome.failed
      .map((f) => `**${f.hint}** (${f.reason})`)
      .join(", ");
    lines.push(`Could not add: ${failList}.`);
  }

  const color =
    outcome.resolved.length > 0
      ? outcome.failed.length > 0
        ? ACTION_COLORS.warning
        : ACTION_COLORS.success
      : ACTION_COLORS.warning;

  return buildActionEmbed({
    title: "Group updated",
    description: lines.join("\n\n"),
    color,
    footer: "Groups · Equality",
  });
}

export function buildClearContextEmbed(removed: number): EmbedBuilder {
  const description =
    removed > 0
      ? `Cleared your conversation context (**${removed}** stored message${removed === 1 ? "" : "s"} removed).`
      : "Your conversation context was already empty.";

  return buildActionEmbed({
    title: "Context cleared",
    description,
    color: ACTION_COLORS.neutral,
    footer: "Stacy will not remember prior messages in this chat.",
  });
}
