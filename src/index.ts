import { createCommandHandler } from "@/utils/createCommandHandler";
import { createEventHandler } from "@/utils/createEventHandler";
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
await player.extractors.loadDefault((ext) => ext !== "YouTubeExtractor");
// await player.extractors.loadDefault();

player.events.on("playerStart", (queue, track) => {
  // we will later define queue.metadata object while creating the queue
  // console.log(track.views);
  // queue.metadata.channel.send(`Started playing **${track.title}**!`);
});

player.events.on("debug", (guild, msg) => {
  console.log("Debug:", msg);
});

(async () => {
  try {
    createEventHandler(client);
    createCommandHandler(client);

    client.login(Bun.env.TOKEN);
  } catch (error) {
    console.log(`Error: ${error}`);
  }
})();
