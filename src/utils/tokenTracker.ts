import { MS_IN_ONE_HOUR, MS_IN_ONE_MINUTE } from "@/constants/constants";

// LangChain standardizes provider usage onto this shape on AIMessage.usage_metadata.
type UsageMetadata = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

// gpt-4.1 pricing (USD per 1M tokens). Estimates - prices change, so update here.
const INPUT_PER_1M = 2.0;
const OUTPUT_PER_1M = 8.0;

let totalInput = 0;
let totalOutput = 0;
let totalCalls = 0;

let windowInput = 0;
let windowOutput = 0;
let windowCalls = 0;

function cost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * INPUT_PER_1M + (outputTokens / 1e6) * OUTPUT_PER_1M;
}

export function recordUsage(usage?: UsageMetadata): void {
  if (!usage) return;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  totalInput += input;
  totalOutput += output;
  totalCalls += 1;
  windowInput += input;
  windowOutput += output;
  windowCalls += 1;
}

export type UsageSnapshot = {
  totalInput: number;
  totalOutput: number;
  totalCalls: number;
  totalCost: number;
};

export function getUsageSnapshot(): UsageSnapshot {
  return {
    totalInput,
    totalOutput,
    totalCalls,
    totalCost: cost(totalInput, totalOutput),
  };
}

let reporter: NodeJS.Timeout | null = null;

// Periodically logs token spend (cumulative + since the last report) and resets
// the window. Call once at startup.
export function startTokenReporter(intervalMs = MS_IN_ONE_HOUR): void {
  if (reporter) return;
  const minutes = Math.round(intervalMs / MS_IN_ONE_MINUTE);
  reporter = setInterval(() => {
    console.log(
      `[tokens] last ${minutes}m: ${windowInput} in / ${windowOutput} out / ~$${cost(
        windowInput,
        windowOutput,
      ).toFixed(4)} (${windowCalls} calls) | total: ${totalInput} in / ${totalOutput} out / ~$${cost(
        totalInput,
        totalOutput,
      ).toFixed(4)} (${totalCalls} calls)`,
    );
    windowInput = 0;
    windowOutput = 0;
    windowCalls = 0;
  }, intervalMs);
  reporter.unref?.();
}
