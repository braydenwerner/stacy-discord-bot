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
import { runMinecraftObserve } from "@/utils/minecraft/runMinecraftObserve";
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
    "Control or inspect the AWS Minecraft server. " +
    "Use start/wake/boot, stop/shut down, status (EC2 only), health (port + service + players), " +
    "logs (recent Paper/system logs), backups (S3 archive list), or metrics (CPU, EBS IOPS/throughput, network, load/mem/disk). " +
    "Anyone can start or inspect; stop requires Equality role, server admin, or bot owner.",
  schema: z.object({
    action: z
      .enum([
        "start",
        "stop",
        "status",
        "health",
        "logs",
        "backups",
        "metrics",
      ])
      .describe(
        "start/stop/status = EC2 control; health/logs/backups/metrics = observability",
      ),
    logLines: z
      .number()
      .int()
      .min(5)
      .max(60)
      .optional()
      .describe("For logs: number of lines per section (default 25)"),
  }),
  func: async ({ action, logLines }, _runManager, config) => {
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

      if (
        action === "health" ||
        action === "logs" ||
        action === "backups" ||
        action === "metrics"
      ) {
        const text = await runMinecraftObserve(action, { logLines });
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
