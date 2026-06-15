import { formatAwsUsageReport } from "@/utils/aws/formatAwsUsage";
import { getAwsCredentialError } from "@/utils/aws/awsConfig";
import { getAwsUsageReport } from "@/utils/aws/awsUsage";
import { requireEquality } from "@/utils/equalityRole";
import { getToolMessage } from "@/utils/getToolMessage";
import { toolError, toolOk } from "@/utils/toolResult";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const awsUsageTool = new DynamicStructuredTool({
  name: "awsUsage",
  description:
    "Get AWS account spending: month-to-date, last month, 12-month total, credits, " +
    "forecast, and budget/credit remaining. Requires Equality role or admin.",
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
      const report = await getAwsUsageReport();
      const text = formatAwsUsageReport(report);
      await message.reply(truncateMessage(text));
      return toolOk(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await message.reply(truncateMessage(`AWS usage lookup failed. ${text}`));
      return toolError(text);
    }
  },
});
