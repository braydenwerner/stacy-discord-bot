import type { ChatInputCommandInteraction, Message } from "discord.js";

const DEFAULT_OWNER_ID = "268201627452833794";

export function getStacyOwnerId(): string {
  return process.env.STACY_OWNER_ID ?? DEFAULT_OWNER_ID;
}

export function isStacyOwner(userId: string): boolean {
  return userId === getStacyOwnerId();
}

export function ownerOnlyMessage(): string {
  return "Only the bot owner can change who gets the nice or snarky tone.";
}

export function requireStacyOwnerMessage(
  message: Message,
): string | null {
  if (isStacyOwner(message.author.id)) return null;
  return ownerOnlyMessage();
}

export function requireStacyOwnerInteraction(
  interaction: ChatInputCommandInteraction,
): string | null {
  if (isStacyOwner(interaction.user.id)) return null;
  return ownerOnlyMessage();
}
