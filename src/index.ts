import { Client, GatewayIntentBits } from "discord.js";

import { createEventHandler } from "@utils/createEventHandler";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

(async () => {
  try {
    createEventHandler(client);

    client.login(Bun.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();
