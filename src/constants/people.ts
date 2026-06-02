import {
  getDisplayNameForUserId,
  resolveContactUserId,
} from "@/db/contacts";

export function resolveUserId(
  rawName: string,
  guildId: string | null,
): string | undefined {
  return resolveContactUserId(guildId, rawName);
}

export function displayNameForUserId(
  userId: string,
  guildId: string | null,
): string {
  return getDisplayNameForUserId(guildId, userId);
}
