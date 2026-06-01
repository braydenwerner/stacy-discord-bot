// Discord's message length limit is 2,000 characters.
const DISCORD_MESSAGE_LIMIT = 2000;
const TRUNCATION_SUFFIX = "... [truncated]";

/**
 * Truncates a message to fit within Discord's 2,000 character limit.
 * If truncation is needed, appends a suffix indicating the message was cut off.
 */
export function truncateMessage(content: string): string {
  if (content.length <= DISCORD_MESSAGE_LIMIT) {
    return content;
  }

  // Reserve space for the truncation suffix
  const maxLength = DISCORD_MESSAGE_LIMIT - TRUNCATION_SUFFIX.length;
  return content.slice(0, maxLength) + TRUNCATION_SUFFIX;
}
