import {
  formatMinecraftStartResult,
  formatMinecraftStatus,
  formatMinecraftStopResult,
} from "@/utils/minecraft/formatServerStatus";
import {
  getMinecraftServerState,
  isMinecraftConfigured,
  startMinecraftServer,
  stopMinecraftServer,
} from "@/utils/minecraft/minecraftClient";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError, toolOk } from "@/utils/toolResult";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const NOT_CONFIGURED =
  "Minecraft server control is not configured on this bot host.";

export const manageMinecraftTool = new DynamicStructuredTool({
  name: "manageMinecraft",
  description:
    "Start, stop, or check status of the AWS Minecraft server. " +
    "Use when someone asks to start/wake/boot the minecraft server, check if it is up, or stop it. " +
    "Anyone can start or check status; stop requires Equality role, server admin, or bot owner.",
  schema: z.object({
    action: z
      .enum(["start", "stop", "status"])
      .describe("start = wake EC2, stop = halt instance, status = current state"),
  }),
  func: async ({ action }, _runManager, config) => {
    const message = getToolMessage(config);

    if (!isMinecraftConfigured()) {
      await message.reply(NOT_CONFIGURED);
      return toolError(NOT_CONFIGURED);
    }

    try {
      if (action === "status") {
        const state = await getMinecraftServerState();
        const text = formatMinecraftStatus(state);
        await message.reply(text);
        return toolOk(text);
      }

      if (action === "start") {
        const before = await getMinecraftServerState();
        const after = await startMinecraftServer();
        const text = formatMinecraftStartResult(before, after);
        await message.reply(text);
        return toolOk(text);
      }

      const denied = await requireEquality(message);
      if (denied) {
        await message.reply(denied);
        return toolError(denied);
      }

      const before = await getMinecraftServerState();
      const after = await stopMinecraftServer();
      const text = formatMinecraftStopResult(before, after);
      await message.reply(text);
      return toolOk(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(`Minecraft command failed. ${text}`);
      return toolError(text);
    }
  },
});
