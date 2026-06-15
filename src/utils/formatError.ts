export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Short, user-safe message for Discord replies. */
export function formatErrorForUser(error: unknown): string {
  const message = formatError(error);
  if (/session|innertube|youtube|decipher|po.?token/i.test(message)) {
    return "YouTube playback failed temporarily. Try again in a moment.";
  }
  return message.slice(0, 500);
}
