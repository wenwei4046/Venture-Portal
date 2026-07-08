// Pure helpers for the partial payroll-funding flow (Payroll Requests → Generate PV).
//
// A payroll_payment_request can now be funded across SEVERAL PVs. Each round,
// Finance types how much each department pool contributes this time. A pool may
// be driven negative (预支 / advance — plain negative cash, not a booked loan);
// that's a warning, not a block. The one hard rule left is arithmetic: a round
// can't fund a department beyond what it still owes, and the round total can't
// exceed the request's outstanding remainder.
//
// Extracted from the Server Action so the math is unit-tested without pulling in
// next/cache + Supabase SSR cookies.

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

export interface FundingRow {
  pool_key: string
  dept_name: string
  /** Total this department owes for the run (gross + employer statutory). */
  required: number
  /** Current dept-pool balance (cash available before this round). */
  pool_balance: number
  /** Already funded for this department across prior non-voided PVs. */
  committed: number
}

/** What this department still needs, floored at zero. */
export function deptRemaining(row: Pick<FundingRow, 'required' | 'committed'>): number {
  return Math.max(0, round2(row.required - row.committed))
}

export interface RoundLine extends FundingRow {
  /** This round's contribution typed by Finance. */
  input: number
}

export interface RoundSummary {
  /** Total typed this round. */
  sumInput: number
  /** Outstanding on the whole request before this round. */
  remainingBefore: number
  /** Outstanding after this round (>= 0 means more rounds to come). */
  remainingAfter: number
  /** Rows whose input exceeds the pool's cash → the pool goes negative (overdraw). */
  overdrawRows: RoundLine[]
  /** Rows funded beyond what the department still owes (a hard error). */
  overCommitRows: RoundLine[]
  /** True when the round is arithmetically valid and worth submitting. */
  canSubmit: boolean
}

const EPS = 0.005

/**
 * Summarise one funding round. `totalAmount` is the request total (locked);
 * `totalCommitted` is the sum already funded across prior non-voided PVs.
 */
export function summariseRound(
  lines: RoundLine[],
  totalAmount: number,
  totalCommitted: number,
): RoundSummary {
  const sumInput = round2(lines.reduce((acc, r) => acc + (Number(r.input) || 0), 0))
  const remainingBefore = round2(Math.max(0, totalAmount - totalCommitted))
  const remainingAfter = round2(remainingBefore - sumInput)

  const overdrawRows = lines.filter(r => (Number(r.input) || 0) > r.pool_balance + EPS)
  const overCommitRows = lines.filter(r => (Number(r.input) || 0) > deptRemaining(r) + EPS)

  const canSubmit =
    sumInput > EPS &&
    sumInput <= remainingBefore + EPS &&
    overCommitRows.length === 0

  return { sumInput, remainingBefore, remainingAfter, overdrawRows, overCommitRows, canSubmit }
}
