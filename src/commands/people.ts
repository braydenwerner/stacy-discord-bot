import { listContacts } from "@/db/contacts";
import { buildContactsEmbed } from "@/utils/directoryEmbeds";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { replyDenied, replyError } from "@/utils/slashReply";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("people")
    .setDescription("List known people (contacts) for this server (Equality role)"),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = await requireEqualityInteraction(interaction);
    if (denied) {
      await replyDenied(interaction, denied);
      return;
    }

    try {
      const contacts = listContacts(interaction.guildId);
      const embed = buildContactsEmbed(contacts, interaction.guild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
