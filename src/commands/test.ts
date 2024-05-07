import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Replies with Hello, world!"),
  async execute(interaction: CommandInteraction) {
    await interaction.reply("Hello, world!");
  },
};
