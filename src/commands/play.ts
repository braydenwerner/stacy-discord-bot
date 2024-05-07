import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Plays a song"),
  async execute(interaction: CommandInteraction) {
    await interaction.reply("this command is in progress");
  },
};
