import type { ChatInputCommandInteraction } from "discord.js";
import { formatError, formatErrorForUser } from "@/utils/formatError";

export async function replyDenied(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, ephemeral: true });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  console.error("[slash]", formatError(error));
  await replyDenied(interaction, formatErrorForUser(error));
}
