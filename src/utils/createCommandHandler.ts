import path from "path";
import type { CustomClient } from "@/index";

import { getAllFiles } from "./getAllFiles";

export async function createCommandHandler(client: CustomClient) {
  const commandFolders = getAllFiles(
    path.join(__dirname, "..", "commands"),
    true,
  );

  console.log(commandFolders);

  for (const folder of commandFolders) {
    const commandFiles = getAllFiles(folder);
    commandFiles.sort();

    for (const file of commandFiles) {
      console.log(file);
      const command = (await import(file)).default;
      console.log(command);
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
}
