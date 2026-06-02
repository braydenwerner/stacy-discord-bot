import { displayNameForUserId } from "@/constants/people";
import { addMemberToGroup } from "@/db/userGroups";
import { parseMemberList } from "@/utils/parseMemberList";
import {
  messageToMemberContext,
  resolveGroupMemberFromContext,
  type MemberResolveContext,
} from "@/utils/resolveGroupMember";
import { toolError, toolOk, toolPartial } from "@/utils/toolResult";
import type { Message } from "discord.js";

export type ResolvedMember = { hint: string; userId: string; label: string };
export type FailedMember = { hint: string; reason: string };

export function resolveMemberHintsFromContext(
  ctx: MemberResolveContext,
  hints: string[],
): { resolved: ResolvedMember[]; failed: FailedMember[] } {
  const resolved: ResolvedMember[] = [];
  const failed: FailedMember[] = [];
  const seenIds = new Set<string>();

  for (const hint of hints) {
    const userId = resolveGroupMemberFromContext(ctx, hint);
    if (!userId) {
      failed.push({
        hint,
        reason: "unknown name (use a contact, @mention, me, or user ID)",
      });
      continue;
    }
    if (seenIds.has(userId)) continue;

    seenIds.add(userId);
    resolved.push({
      hint,
      userId,
      label: displayNameForUserId(userId, ctx.guildId),
    });
  }

  return { resolved, failed };
}

export function resolveMemberHints(
  message: Message,
  hints: string[],
): { resolved: ResolvedMember[]; failed: FailedMember[] } {
  return resolveMemberHintsFromContext(messageToMemberContext(message), hints);
}

export function resolveMembersFromText(
  message: Message,
  membersText: string,
): { resolved: ResolvedMember[]; failed: FailedMember[] } {
  return resolveMemberHints(message, parseMemberList(membersText));
}

export type BulkAddOutcome = {
  created: boolean;
  resolved: ResolvedMember[];
  failed: FailedMember[];
};

export function addMembersToGroup(
  message: Message,
  groupName: string,
  hints: string[],
): BulkAddOutcome {
  const { resolved, failed } = resolveMemberHints(message, hints);
  let created = false;

  for (const member of resolved) {
    const result = addMemberToGroup(message.guildId, groupName, member.userId);
    if (result.created) created = true;
  }

  return { created, resolved, failed };
}

export function formatBulkGroupDiscordMessage(
  groupName: string,
  outcome: BulkAddOutcome,
): string {
  const lines: string[] = [];

  if (outcome.resolved.length > 0) {
    const names = outcome.resolved.map((m) => `**${m.label}**`).join(", ");
    lines.push(
      outcome.created
        ? `Created **${groupName}** with ${names}.`
        : `Added ${names} to **${groupName}**.`,
    );
  } else if (outcome.failed.length > 0) {
    lines.push(`Could not create **${groupName}** — no members were added.`);
  }

  if (outcome.failed.length > 0) {
    const failList = outcome.failed
      .map((f) => `**${f.hint}** (${f.reason})`)
      .join(", ");
    lines.push(`Could not add: ${failList}.`);
  }

  return lines.join("\n");
}

export function formatBulkGroupToolResult(
  groupName: string,
  outcome: BulkAddOutcome,
): string {
  if (outcome.resolved.length === 0 && outcome.failed.length > 0) {
    return toolError(
      `No members added to "${groupName}". Failed: ${outcome.failed.map((f) => `${f.hint} (${f.reason})`).join("; ")}`,
    );
  }

  const added = outcome.resolved.map((m) => m.label).join(", ");
  const detail = outcome.created
    ? `Created group "${groupName}" with: ${added}.`
    : `Added to "${groupName}": ${added}.`;

  if (outcome.failed.length > 0) {
    const failDetail = outcome.failed
      .map((f) => `${f.hint} (${f.reason})`)
      .join("; ");
    return toolPartial(`${detail} Failed: ${failDetail}`);
  }

  return toolOk(detail);
}
