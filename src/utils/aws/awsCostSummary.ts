import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandOutput,
  type Group,
} from "@aws-sdk/client-cost-explorer";
import {
  BudgetsClient,
  DescribeBudgetCommand,
} from "@aws-sdk/client-budgets";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import {
  AWS_BILLING_REGION,
  awsBudgetName,
  promoCreditPoolUsd,
} from "@/utils/aws/awsConfig";

export type AwsServiceSpend = {
  service: string;
  amountUsd: number;
};

export type AwsBudgetSnapshot = {
  name: string;
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  period: string;
};

export type AwsCostSummary = {
  totalUsd: number;
  creditsUsd: number;
  services: AwsServiceSpend[];
  budget: AwsBudgetSnapshot | null;
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

function budgetsClient(): BudgetsClient {
  return new BudgetsClient({ region: AWS_BILLING_REGION });
}

let cachedAccountId: string | null | undefined;

async function getAwsAccountId(): Promise<string | null> {
  const fromEnv = process.env.AWS_ACCOUNT_ID?.trim();
  if (fromEnv) return fromEnv;
  if (cachedAccountId !== undefined) return cachedAccountId;

  try {
    const region = process.env.AWS_REGION ?? AWS_BILLING_REGION;
    const output = await new STSClient({ region }).send(
      new GetCallerIdentityCommand({}),
    );
    cachedAccountId = output.Account ?? null;
  } catch {
    cachedAccountId = null;
  }
  return cachedAccountId;
}

async function fetchCost(
  start: string,
  end: string,
  options?: { groupByService?: boolean; creditOnly?: boolean },
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

async function fetchAwsBudget(): Promise<AwsBudgetSnapshot | null> {
  const name = awsBudgetName();
  if (!name) return null;

  const accountId = await getAwsAccountId();
  if (!accountId) return null;

  const output = await budgetsClient().send(
    new DescribeBudgetCommand({
      AccountId: accountId,
      BudgetName: name,
    }),
  );

  const budget = output.Budget;
  if (!budget) return null;

  const limitUsd = Number.parseFloat(budget.BudgetLimit?.Amount ?? "0");
  const spentUsd = Number.parseFloat(
    budget.CalculatedSpend?.ActualSpend?.Amount ?? "0",
  );
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return null;

  return {
    name,
    limitUsd,
    spentUsd,
    remainingUsd: limitUsd - spentUsd,
    period: budget.TimeUnit ?? "MONTHLY",
  };
}

/** AWS spend for the configured billing window (default trailing 12 months). */
export async function getAwsCostSummary(): Promise<AwsCostSummary> {
  const now = new Date();
  const periodStart = billingPeriodStart(now);
  const periodEnd = isoDate(now);
  const nextDay = isoDate(addUtcDays(now, 1));

  const [total, credits, budget] = await Promise.all([
    fetchCost(periodStart, nextDay, { groupByService: true }),
    fetchCost(periodStart, nextDay, { creditOnly: true }),
    fetchAwsBudget(),
  ]);

  const promoPool = promoCreditPoolUsd();
  const promoRemaining =
    promoPool != null ? promoPool - total.total : null;

  return {
    totalUsd: total.total,
    creditsUsd: credits.total,
    services: total.services,
    budget,
    promoCreditRemainingUsd: promoRemaining,
    periodStart,
    periodEnd,
  };
}
