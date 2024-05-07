import path from "path";
import { type Client } from "discord.js";

import { getAllFiles } from "@utils/getAllFiles";

export function createEventHandler(client: Client) {
  const eventFiles = getAllFiles(path.join(__dirname, "..", "events"), false);
  eventFiles.sort();

  for (const file of eventFiles) {
    const eventName = file
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.split(".")[0] as string;

    client.on(eventName, async (arg: any) => {
      const eventFunction = (await import(file)).default;
      await eventFunction(client, arg);
    });
  }
}
