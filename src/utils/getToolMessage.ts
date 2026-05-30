import type { RunnableConfig } from "@langchain/core/runnables";
import { Message } from "discord.js";

// The Discord message is injected into a tool's runtime config (not its schema),
// so it never appears in the JSON Schema sent to the model.
export function getToolMessage(config?: RunnableConfig): Message {
  const message = (config?.configurable as { message?: Message } | undefined)
    ?.message;
  if (!message) throw new Error("No Discord message provided to tool.");
  return message;
}
