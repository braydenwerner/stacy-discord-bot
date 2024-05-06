import path from "path"
import { getAllFiles } from "@utils/getAllFiles" 
import { type Client } from "discord.js";

export function createEventHandler(client: Client) {
  const eventFolders = getAllFiles(path.join(__dirname, '..', 'events'), true);

  for (const eventFolder of eventFolders) {
    let eventFiles = getAllFiles(eventFolder);
    eventFiles.sort();

    const eventName = eventFolder.replace(/\\/g, '/').split('/').pop() as string;

    client.on(eventName, async (arg: string) => {
      for (const eventFile of eventFiles) {
        const eventFunction = (await import(eventFile)).default;
        await eventFunction(client, arg);
      }
    });
  }
};