import type { CustomClient } from "@/index";
import type { Interaction } from "discord.js";
import { useQueue } from "discord-player";
import { handleContextPanelInteraction } from "@/utils/music/musicContextPanel";

export default async function interactionCreate(
  client: CustomClient,
  interaction: Interaction,
) {
  // Handle button interactions for music context panel
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("music_")) {
      const guildId = interaction.guildId;
      if (!guildId) return;

      const queue = useQueue(guildId);
      if (!queue) {
        await interaction.reply({
          content: "No active music session found.",
          ephemeral: true,
        });
        return;
      }

      try {
        await handleContextPanelInteraction(interaction, queue);
      } catch (error) {
        console.error("Error handling music context panel interaction:", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "An error occurred while processing your request.",
            ephemeral: true,
          });
        }
      }
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
}
