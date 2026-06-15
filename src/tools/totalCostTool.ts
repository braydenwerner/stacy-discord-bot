import { formatTotalCostReport } from "@/utils/cost/formatTotalCostReport";
import { getTotalCostReport } from "@/utils/cost/totalCostReport";
import { getAwsCredentialError } from "@/utils/aws/awsConfig";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError, toolOk } from "@/utils/toolResult";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const totalCostTool = new DynamicStructuredTool({
  name: "totalCost",
  description:
    "Get total infrastructure cost: AWS spend breakdown (by service) plus OpenAI/Stacy " +
    "API cost (lifetime estimated from token usage), combined total, credits, and budget remaining. " +
    "Requires Equality role or admin.",
  schema: z.object({}),
  func: async (_input, _runManager, config) => {
    const message = getToolMessage(config);

    const denied = await requireEquality(message);
    if (denied) {
      await message.reply(truncateMessage(denied));
      return toolError(denied);
    }

    const configError = getAwsCredentialError();
    if (configError) {
      await message.reply(truncateMessage(configError));
      return toolError(configError);
    }

    try {
      const report = await getTotalCostReport();
      const text = formatTotalCostReport(report);
      await message.reply(truncateMessage(text));
      return toolOk(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(truncateMessage(`Cost lookup failed. ${text}`));
      return toolError(text);
    }
  },
});
