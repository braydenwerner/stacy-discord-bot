import { resolveGroupIds } from "@/db/userGroups";
import { truncateMessage } from "@/utils/truncateMessage";

export function buildGroupPingContent(
  guildId: string | null,
  groupName: string,
  text: string,
  excludeUserId: string,
): { content: string } | { error: string } {
  const ids = resolveGroupIds(guildId, groupName);
  if (!ids) {
    return { error: `I don't know a group called "${groupName}".` };
  }

  const targets = ids.filter((id) => id !== excludeUserId);
  if (targets.length === 0) {
    return { error: "There's no one else in that group to ping." };
  }

  const mentions = targets.map((id) => `<@${id}>`).join(" ");
  return { content: truncateMessage(`${mentions} ${text}`.trim()) };
}
