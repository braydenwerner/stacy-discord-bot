import type { CustomClient } from "@/index";
import { startCostBudgetWatcher } from "@/utils/cost/costBudgetWatcher";
import { startMinecraftWatchers } from "@/utils/minecraft/startMinecraftWatchers";

export default async function clientReady(client: CustomClient) {
  startMinecraftWatchers(client);
  startCostBudgetWatcher(client);
  console.log("Ready event has been fired");
}
