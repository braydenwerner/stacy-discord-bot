import "dotenv/config";

import { createCommandHandler } from "@/utils/createCommandHandler";
import { createEventHandler } from "@/utils/createEventHandler";
import { registerMusicPlayerListeners } from "@/utils/music/registerMusicPlayerListeners";
import { Player } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
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

const player = new Player(client);

(async () => {
  try {
    await player.extractors.register(YoutubeiExtractor, {});

    await player.extractors.loadDefault(
      (ext) => !["YouTubeExtractor"].includes(ext),
    );

    registerMusicPlayerListeners(player);
    createEventHandler(client);
    createCommandHandler(client);

    client.login(process.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();
