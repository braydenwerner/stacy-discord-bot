import { QueryType, useMainPlayer } from "discord-player";
import {
  CommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Stacy joins the call to say hi"),
  async execute(interaction: CommandInteraction) {
    try {
      const member = interaction.member as GuildMember;
      const voiceChannel = member?.voice?.channel?.id;
      if (!voiceChannel) {
        interaction.reply(
          "Hello! It's nice to meet you. How can I help you today?",
        );
        return;
      }

      interaction.deferReply();

      if (!interaction.guildId) throw new Error("Guild ID not found.");
      if (!interaction.guild?.voiceAdapterCreator)
        throw new Error("Voice adapter creator not found.");

      const player = useMainPlayer();
      player?.play(voiceChannel, "audio/hey_boys.mp3", {
        searchEngine: QueryType.FILE,
        nodeOptions: {
          metadata: {
            // this is important for the event listeners
            channel: interaction.channel,
            member: interaction.member,
            disableEmbeds: true,
          },
        },
      });

      interaction.deleteReply();
    } catch (error) {
      console.error(`Error: ${error}`);
      interaction.reply(`Failed to say hello. ${error}`);
    }
  },
};
