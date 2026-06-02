import { listContacts } from "@/db/contacts";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { formatContactsList } from "@/utils/formatContactsList";
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
      await interaction.reply({
        content: formatContactsList(contacts),
        ephemeral: true,
      });
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
