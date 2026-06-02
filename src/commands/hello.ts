import { playHelloClip } from "@/utils/music/playHelloClip";
import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Stacy joins the call to say hi"),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const member = interaction.member as GuildMember;
      const voiceChannel = member?.voice?.channel;
      if (!voiceChannel) {
        await interaction.reply({
          content:
            "Hello! It's nice to meet you. Join a voice channel if you want me to say hi there.",
        });
        return;
      }

      if (!interaction.guild?.voiceAdapterCreator) {
        throw new Error("Voice adapter creator not found.");
      }

      await interaction.deferReply();
      await playHelloClip({
        voiceChannel,
        textChannel: interaction.channel,
        member,
      });
      await interaction.deleteReply();
    } catch (error) {
      console.error("[hello]", error);
      const content = `Failed to say hello. ${error}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content }).catch(() =>
          interaction.followUp({ content, ephemeral: true }),
        );
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  },
};
