import {
  addContact,
  listContacts,
  removeContact,
  updateContact,
} from "@/db/contacts";
import { requireEqualityInteraction } from "@/utils/equalityRole";
import { replyDenied, replyError } from "@/utils/slashReply";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("contact")
    .setDescription("Manage known contacts (Equality role required)")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a contact with a name and Discord user")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Contact name (e.g. ben, michael f)")
            .setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user for this contact")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a contact by name")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Contact name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("update")
        .setDescription("Update a contact's name and/or linked user")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Current contact name")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("new_name").setDescription("New contact name"),
        )
        .addUserOption((opt) =>
          opt.setName("user").setDescription("New Discord user for this contact"),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all contacts for this server"),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = await requireEqualityInteraction(interaction);
    if (denied) {
      await replyDenied(interaction, denied);
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "add") {
        const name = interaction.options.getString("name", true);
        const user = interaction.options.getUser("user", true);
        addContact(interaction.guildId, name, user.id);
        await interaction.reply({
          content: `Added **${name.trim()}** as <@${user.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "remove") {
        const name = interaction.options.getString("name", true);
        const removed = removeContact(interaction.guildId, name);
        await interaction.reply({
          content: removed
            ? `Removed contact **${name.trim()}**.`
            : `No contact named **${name.trim()}** exists.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "update") {
        const name = interaction.options.getString("name", true);
        const newName = interaction.options.getString("new_name") ?? undefined;
        const user = interaction.options.getUser("user");
        if (!newName && !user) {
          await replyDenied(
            interaction,
            "Provide a new name and/or user to update.",
          );
          return;
        }
        const updated = updateContact(interaction.guildId, name, {
          newName,
          newUserId: user?.id,
        });
        await interaction.reply({
          content: updated
            ? `Updated contact **${name.trim()}**.`
            : `No contact named **${name.trim()}** exists.`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "list") {
        const contacts = listContacts(interaction.guildId);
        if (contacts.length === 0) {
          await interaction.reply({
            content: "No contacts are stored for this server yet.",
            ephemeral: true,
          });
          return;
        }
        const body = contacts
          .map((c) => `**${c.name}**: <@${c.userId}> (\`${c.userId}\`)`)
          .join("\n");
        await interaction.reply({ content: body, ephemeral: true });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },
};
