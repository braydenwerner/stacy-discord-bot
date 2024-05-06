import { createCommandHandler } from "@/utils/createCommandHandler";
import { createEventHandler } from "@/utils/createEventHandler";
import { Client, Collection, GatewayIntentBits } from "discord.js";

export type CustomClient = Client & { commands: Collection<string, any> };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
}) as CustomClient;
client.commands = new Collection();

(async () => {
  try {
    createEventHandler(client);
    createCommandHandler(client);

    client.login(Bun.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();
