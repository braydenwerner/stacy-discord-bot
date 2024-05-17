import { QueryType, useMainPlayer } from "discord-player";
import {
  CommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clears chat messages."),
  async execute(interaction: CommandInteraction) {
    try {
    } catch (error) {}
  },
};
