import type { Contact } from "@/db/contacts";

export function formatContactsList(
  contacts: Contact[],
  options?: { includeMentions?: boolean },
): string {
  if (contacts.length === 0) {
    return "No contacts are stored for this server yet.";
  }

  const includeMentions = options?.includeMentions ?? true;
  return contacts
    .map((c) =>
      includeMentions
        ? `**${c.name}**: <@${c.userId}> (\`${c.userId}\`)`
        : `**${c.name}**: \`${c.userId}\``,
    )
    .join("\n");
}
