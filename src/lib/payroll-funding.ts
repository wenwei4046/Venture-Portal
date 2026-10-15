// Pure helpers for the partial payroll-funding flow (Payroll Requests → Generate PV).
//
// A payroll_payment_request can be funded across SEVERAL PVs. Each round,
// Finance types how much each department contributes this time. Mig
// 20260720140000 (custody model): approval deducts each department's typed
// share immediately (a short pool goes NEGATIVE — 预支, a warning not a
// block), parks the full round in the HR custody pool, and moves the cash
// Hong Leong → Alliance. Payouts + statutory later drain only the HR pool.
// The hard rules at funding are arithmetic: a round can't fund a department
// beyond what it still owes, the round total can't exceed the request's
// outstanding remainder, and the round must fit in the source bank (checked
// in the action/UI, re-checked at approval).
//
// Extracted from the Server Action so the math is unit-tested without pulling in
// next/cache + Supabase SSR cookies.

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

export interface PaymentHeroInputs {
  /** payroll_runs.total_amount — staff-only CTC since the v2 InfoTech flow
   *  (director_salary_total is 0; directors fund via their own run-less
   *  request, mig 20260727100000). null when no run exists yet. */
  runTotal: number | null
  staffGross: number
  /** Staff EPF + SOCSO + EIS employer shares. */
  staffErStat: number
  directorGross: number
  /** Director EPF + SOCSO + EIS employer shares. */
  directorErStat: number
}

/**
 * Hero "Total amount this month" on the HR Payment page: staff CTC + director
 * CTC, so it spans the same people as the "N staff · RM x net" subtitle.
 */
export function paymentHeroTotal(i: PaymentHeroInputs): number {
  const staffCtc = i.runTotal ?? round2(i.staffGross + i.staffErStat)
  return round2(staffCtc + i.directorGross + i.directorErStat)
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

/**
 * A funding pool's name (Payroll Requests' Generate PV, the desktop form's and
 * the Finance phone app's): the five core department pools by key, and a
 * department HR picked for HOUZS Venture's director share (IT, Revenue
 * Department, Venture Office …) by the department the row reads.
 */
export function poolLabel(key: string, deptName?: string): string {
  switch (key) {
    case 'dept_pool_hr':
      return 'HR Department Pool'
    case 'dept_pool_finance':
      return 'Finance Department Pool'
    case 'dept_pool_director_office':
      return 'Director Office Department Pool'
    case 'dept_pool_marketing':
      return 'Marketing Department Pool'
    case 'dept_pool_director':
      return 'Director Department Pool'
    default:
      if (!deptName) return key
      return /department$/i.test(deptName) ? `${deptName} Pool` : `${deptName} Department Pool`
  }
}
