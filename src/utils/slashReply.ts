import type { ChatInputCommandInteraction } from "discord.js";

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
  const text = error instanceof Error ? error.message : String(error);
  await replyDenied(interaction, text);
}
