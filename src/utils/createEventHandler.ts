import path from "path";
import { type Client } from "discord.js";

import { getAllFiles } from "@utils/getAllFiles";

export function createEventHandler(client: Client) {
  const eventFolders = getAllFiles(path.join(__dirname, "..", "events"), true);

  for (const folder of eventFolders) {
    const eventFiles = getAllFiles(folder);
    eventFiles.sort();

    const eventName = folder.replace(/\\/g, "/").split("/").pop() as string;

    client.on(eventName, async (arg: string) => {
      for (const file of eventFiles) {
        const eventFunction = (await import(file)).default;
        await eventFunction(client, arg);
      }
    });
  }
}
