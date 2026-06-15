import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
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
  monthlyBudgetUsd,
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

export type AwsUsageReport = {
  monthToDateUsd: number;
  lastMonthUsd: number;
  trailingTwelveMonthsUsd: number;
  creditsMonthToDateUsd: number;
  forecastRestOfMonthUsd: number | null;
  projectedMonthTotalUsd: number | null;
  budget: AwsBudgetSnapshot | null;
  manualBudgetRemainingUsd: number | null;
  promoCreditRemainingUsd: number | null;
  topServices: AwsServiceSpend[];
  periodLabel: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function previousMonthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
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

async function fetchForecast(
  start: string,
  end: string,
): Promise<number | null> {
  try {
    const output = await costExplorer().send(
      new GetCostForecastCommand({
        TimePeriod: { Start: start, End: end },
        Metric: "UNBLENDED_COST",
        Granularity: "MONTHLY",
      }),
    );
    let total = 0;
    for (const point of output.ForecastResultsByTime ?? []) {
      total += Number.parseFloat(point.MeanValue ?? "0");
    }
    return total;
  } catch {
    return null;
  }
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

export async function getAwsUsageReport(): Promise<AwsUsageReport> {
  const now = new Date();
  const monthStart = isoDate(monthStartUtc(now));
  const nextDay = isoDate(addUtcDays(now, 1));
  const lastMonthStart = isoDate(previousMonthStartUtc(now));
  const trailingStart = isoDate(
    new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)),
  );
  const monthEnd = isoDate(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  );

  const [
    mtd,
    lastMonth,
    trailing,
    credits,
    mtdByService,
    forecastRest,
    budget,
  ] = await Promise.all([
    fetchCost(monthStart, nextDay),
    fetchCost(lastMonthStart, monthStart),
    fetchCost(trailingStart, nextDay),
    fetchCost(monthStart, nextDay, { creditOnly: true }),
    fetchCost(monthStart, nextDay, { groupByService: true }),
    fetchForecast(isoDate(now), monthEnd),
    fetchAwsBudget(),
  ]);

  const manualBudget = monthlyBudgetUsd();
  const manualBudgetRemaining =
    manualBudget != null ? manualBudget - mtd.total : null;

  const promoPool = promoCreditPoolUsd();
  const promoRemaining =
    promoPool != null ? promoPool - trailing.total : null;

  const projectedMonthTotal =
    forecastRest != null ? mtd.total + forecastRest : null;

  return {
    monthToDateUsd: mtd.total,
    lastMonthUsd: lastMonth.total,
    trailingTwelveMonthsUsd: trailing.total,
    creditsMonthToDateUsd: credits.total,
    forecastRestOfMonthUsd: forecastRest,
    projectedMonthTotalUsd: projectedMonthTotal,
    budget,
    manualBudgetRemainingUsd: manualBudgetRemaining,
    promoCreditRemainingUsd: promoRemaining,
    topServices: mtdByService.services.slice(0, 6),
    periodLabel: monthStart.slice(0, 7),
  };
}
