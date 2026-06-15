import { getAwsCostSummary, type AwsCostSummary } from "@/utils/aws/awsCostSummary";
import {
  getUsageSnapshot,
  OPENAI_MODEL,
  type UsageSnapshot,
} from "@/utils/tokenTracker";

export type TotalCostReport = {
  aws: AwsCostSummary;
  openAi: UsageSnapshot;
  combinedTotalUsd: number;
};

export async function getTotalCostReport(): Promise<TotalCostReport> {
  const [aws, openAi] = await Promise.all([
    getAwsCostSummary(),
    Promise.resolve(getUsageSnapshot()),
  ]);

  return {
    aws,
    openAi,
    combinedTotalUsd: aws.totalUsd + openAi.totalCost,
  };
}
