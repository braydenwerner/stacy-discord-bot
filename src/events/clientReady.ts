import type { CustomClient } from "@/index";
import { startMinecraftWatchers } from "@/utils/minecraft/startMinecraftWatchers";

export default async function clientReady(client: CustomClient) {
  startMinecraftWatchers(client);
  console.log("Ready event has been fired");
}
