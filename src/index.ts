import "dotenv/config";

import { closeDatabase, initDatabase } from "@/db/database";
import { createCommandHandler } from "@/utils/createCommandHandler";
import { createEventHandler } from "@/utils/createEventHandler";
import { registerMusicPlayerListeners } from "@/utils/music/registerMusicPlayerListeners";
import { registerRuntimeErrorHandlers } from "@/utils/registerRuntimeErrorHandlers";
import { startTokenReporter } from "@/utils/tokenTracker";
import { DefaultExtractors } from "@discord-player/extractor";
import { Player } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { Client, Collection, GatewayIntentBits } from "discord.js";

export type CustomClient = Client & {
  commands: Collection<string, any>;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
}) as CustomClient;
client.commands = new Collection();

const player = new Player(client);

registerRuntimeErrorHandlers();

client.on("error", (error) => {
  console.error("[discord] client error:", error);
});

function shutdown(): void {
  closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

(async () => {
  try {
    initDatabase();

    // youtubei.js streaming breaks without a cookie (decipher errors). yt-dlp is the
    // reliable path on the Pi; search still uses Innertube.
    await player.extractors.register(YoutubeiExtractor, {
      ...(process.env.YOUTUBE_COOKIE ? { cookie: process.env.YOUTUBE_COOKIE } : {}),
      generateWithPoToken: true,
      useYoutubeDL: true,
      disablePlayer: true,
      streamOptions: { useClient: "ANDROID" },
    });

    await player.extractors.loadMulti(DefaultExtractors);

    registerMusicPlayerListeners(player);
    startTokenReporter();
    createEventHandler(client);
    createCommandHandler(client);

    client.login(process.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();
