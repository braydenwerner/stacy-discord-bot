import { getDb } from "@/db/database";

export type TokenTotalsRow = {
  total_input: number;
  total_output: number;
  total_calls: number;
};

export function loadTokenTotals(): TokenTotalsRow {
  const row = getDb()
    .prepare(
      "SELECT total_input, total_output, total_calls FROM token_totals WHERE id = 1",
    )
    .get() as TokenTotalsRow | undefined;

  return row ?? { total_input: 0, total_output: 0, total_calls: 0 };
}

export function persistTokenTotals(
  totalInput: number,
  totalOutput: number,
  totalCalls: number,
): void {
  getDb()
    .prepare(
      `UPDATE token_totals
       SET total_input = ?, total_output = ?, total_calls = ?
       WHERE id = 1`,
    )
    .run(totalInput, totalOutput, totalCalls);
}
