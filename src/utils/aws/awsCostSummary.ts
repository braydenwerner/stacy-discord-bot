import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandOutput,
  type Group,
} from "@aws-sdk/client-cost-explorer";
import {
  AWS_BILLING_REGION,
  promoCreditPoolUsd,
} from "@/utils/aws/awsConfig";

export type AwsServiceSpend = {
  service: string;
  amountUsd: number;
};

export type AwsCostSummary = {
  /** Activate/promo credits consumed in the billing window (always ≥ 0). */
  creditsUsedUsd: number;
  /** Usage by service that credits paid for (gross usage, excludes credit line items). */
  services: AwsServiceSpend[];
  promoCreditRemainingUsd: number | null;
  periodStart: string;
  periodEnd: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function billingPeriodStart(now: Date): string {
  const fromEnv = process.env.AWS_BILLING_SINCE?.trim();
  if (fromEnv && /^\d{4}-\d{2}-\d{2}$/.test(fromEnv)) return fromEnv;
  return isoDate(
    new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)),
  );
}

function sumUnblendedCost(output: GetCostAndUsageCommandOutput): number {
  let total = 0;
  for (const bucket of output.ResultsByTime ?? []) {
    total += Number.parseFloat(bucket.Total?.UnblendedCost?.Amount ?? "0");
  }
  return total;
}

function sumGroups(groups: Group[] | undefined): AwsServiceSpend[] {
  const totals = new Map<string, number>();
  for (const group of groups ?? []) {
    const service = group.Keys?.[0] ?? "Unknown";
    const amount = Number.parseFloat(
      group.Metrics?.UnblendedCost?.Amount ?? "0",
    );
    totals.set(service, (totals.get(service) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([service, amountUsd]) => ({ service, amountUsd }))
    .sort((a, b) => b.amountUsd - a.amountUsd);
}

function costExplorer(): CostExplorerClient {
  return new CostExplorerClient({ region: AWS_BILLING_REGION });
}

async function fetchCost(
  start: string,
  end: string,
  options?: {
    groupByService?: boolean;
    creditOnly?: boolean;
    usageOnly?: boolean;
  },
): Promise<{ total: number; services: AwsServiceSpend[] }> {
  const output = await costExplorer().send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      ...(options?.groupByService
        ? { GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }] }
        : {}),
      ...(options?.creditOnly
        ? {
            Filter: {
              Dimensions: { Key: "RECORD_TYPE", Values: ["Credit"] },
            },
          }
        : options?.usageOnly
          ? {
              Filter: {
                Not: {
                  Dimensions: {
                    Key: "RECORD_TYPE",
                    Values: ["Credit", "Refund", "Tax"],
                  },
                },
              },
            }
          : {}),
    }),
  );

  if (options?.groupByService) {
    const services: AwsServiceSpend[] = [];
    for (const bucket of output.ResultsByTime ?? []) {
      services.push(...sumGroups(bucket.Groups));
    }
    const merged = new Map<string, number>();
    for (const row of services) {
      merged.set(row.service, (merged.get(row.service) ?? 0) + row.amountUsd);
    }
    const sorted = [...merged.entries()]
      .map(([service, amountUsd]) => ({ service, amountUsd }))
      .sort((a, b) => b.amountUsd - a.amountUsd);
    return { total: sumUnblendedCost(output), services: sorted };
  }

  return { total: sumUnblendedCost(output), services: [] };
}

/** Activate credits consumed over the trailing N days (Cost Explorer). */
export async function getAwsCreditsUsedForDays(days: number): Promise<{
  creditsUsedUsd: number;
  periodStart: string;
  periodEnd: string;
}> {
  const now = new Date();
  const periodStart = isoDate(addUtcDays(now, -days));
  const periodEnd = isoDate(now);
  const nextDay = isoDate(addUtcDays(now, 1));

  const credits = await fetchCost(periodStart, nextDay, { creditOnly: true });
  const creditsUsedUsd = Math.abs(Math.min(0, credits.total));

  return { creditsUsedUsd, periodStart, periodEnd };
}

/** AWS Activate credits used in the configured billing window (default trailing 12 months). */
export async function getAwsCostSummary(): Promise<AwsCostSummary> {
  const now = new Date();
  const periodStart = billingPeriodStart(now);
  const periodEnd = isoDate(now);
  const nextDay = isoDate(addUtcDays(now, 1));

  const [usage, credits] = await Promise.all([
    fetchCost(periodStart, nextDay, { groupByService: true, usageOnly: true }),
    fetchCost(periodStart, nextDay, { creditOnly: true }),
  ]);

  // Cost Explorer reports credits as negative amounts.
  const creditsUsedUsd = Math.abs(Math.min(0, credits.total));
  const promoPool = promoCreditPoolUsd();
  const promoRemaining =
    promoPool != null ? promoPool - creditsUsedUsd : null;

  return {
    creditsUsedUsd,
    services: usage.services,
    promoCreditRemainingUsd: promoRemaining,
    periodStart,
    periodEnd,
  };
}
