import { createCommandHandler } from "@/utils/createCommandHandler";
import { createEventHandler } from "@/utils/createEventHandler";
import { registerMusicPlayerListeners } from "@/utils/registerMusicPlayerListeners";
import { Player } from "discord-player";
import { Client, Collection, GatewayIntentBits } from "discord.js";

export type CustomClient = Client & {
  commands: Collection<string, any>;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
}) as CustomClient;
client.commands = new Collection();

const player = new Player(client, {
  ytdlOptions: {
    quality: "highestaudio",
    highWaterMark: 1 << 25,
  },
});
// await player.extractors.loadDefault((ext) => ext !== "YouTubeExtractor");
await player.extractors.loadDefault();

registerMusicPlayerListeners(player);

(async () => {
  try {
    createEventHandler(client);
    createCommandHandler(client);

    client.login(Bun.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();
