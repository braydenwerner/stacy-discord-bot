import "dotenv/config";

import { createCommandHandler } from "@/utils/createCommandHandler";
import { createEventHandler } from "@/utils/createEventHandler";
import { registerMusicPlayerListeners } from "@/utils/music/registerMusicPlayerListeners";
import { Player } from "discord-player";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import express from "express"

console.log("token: ", process.env.TOKEN)

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

// const player = new Player(client, {
//   ytdlOptions: {
//     quality: "highestaudio",
//     highWaterMark: 1 << 25,
//   },
// });
const player = new Player(client);
// await player.extractors.loadDefault((ext) => ext !== "YouTubeExtractor");

(async () => {
  try {
    await player.extractors.loadDefault();

    registerMusicPlayerListeners(player);
    createEventHandler(client);
    createCommandHandler(client);

    client.login(process.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();

// Google Cloud Health Check
const port = process.env.PORT || 8080;
const app = express()
app.listen(port, () => {
  console.log('Listening on port: ', port);
});

