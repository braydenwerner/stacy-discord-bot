export function parseMemberList(raw: string): string[] {
  return raw
    .split(/,|&|\band\b/gi)
    .map((part) => part.trim())
    .filter(Boolean);
}
