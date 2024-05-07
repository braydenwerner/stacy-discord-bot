import path from "path";
import type { CustomClient } from "@/index";

import { getAllFiles } from "./getAllFiles";

export async function createCommandHandler(client: CustomClient) {
  const commandFiles = getAllFiles(
    path.join(__dirname, "..", "commands"),
    false,
  );
  commandFiles.sort();

  for (const file of commandFiles) {
    const command = (await import(file)).default;
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${file} is missing a required "data" or "execute" property.`,
      );
    }
  }
}
