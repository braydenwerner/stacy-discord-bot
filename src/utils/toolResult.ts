/** Prefixes returned to the agent loop (see messageCreate). */
export const toolOk = (detail: string) => `OK: ${detail}`;
export const toolPartial = (detail: string) => `PARTIAL: ${detail}`;
export const toolError = (detail: string) => `ERROR: ${detail}`;

export function toolResultNeedsFollowUp(text: string): boolean {
  return text.startsWith("ERROR:") || text.startsWith("PARTIAL:");
}
