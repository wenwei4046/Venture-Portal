// HOUZS Venture's own share of the directors' CTC (2026-10-13). The user, on
// Director Salary's Pool Breakdown (Billing): "i want add on houzs venture
// itself in this as well. but when press save, once detech venture itself got
// pay, will need to select the amount is deduct from which department. then
// can pick more than 2 department as well, by amount or percentage from the
// total amount. then confirm so that finance will get the submittion to make
// the inter transfer fund" — and "make sure all department, can be seleceted".
//
// The database decides what is kept (director_hv_share_save, mig
// 20261013170000). This is its arithmetic for the window, so what HR confirms
// is what is saved: amounts to the sen; split by percentage, each department
// gets its percentage of the total rounded half away from zero, and what the
// rounding leaves goes to the biggest percentage (the first of equals).

export type HvSplitMode = 'amount' | 'percent'
/**
 * open: HR's, waiting for the payroll batch that carries the month's directors.
 * in_payroll: carried by that batch (2026-10-13 — "直接变成 payroll … 由正常的
 * HR payroll 那边去进行"): its funding asks the departments' pools for their
 * parts, its accruals book them in their segments; locked until Finance sends
 * the batch back.
 */
export type HvShareStatus = 'open' | 'in_payroll'

export interface HvDepartment {
  id: string
  name: string
  /** Venture Office — HV's own, no department of the org chart. */
  internal: boolean
}

export interface HvShareLine {
  departmentId: string
  department: string
  /** The Director department's own line: the Director pool bears it, nothing moves. */
  stays: boolean
  amount: number
  /** The percentage HR typed, when the split was by percentage. */
  pct: number | null
}

export interface HvShareComponents {
  basic: number
  kpi: number
  allowance: number
  employerEpf: number
  employerSocso: number
  employerEis: number
  erManual: boolean
}

export interface HvShare {
  id: string
  periodMonth: string
  totalCtc: number
  splitMode: HvSplitMode
  status: HvShareStatus
  submittedAt: string | null
  submittedBy: string | null
  /** The payroll batch that carries it, once it does. */
  batchId: string | null
  batchNo: number | null
  batchSubmittedAt: string | null
  lines: HvShareLine[]
  /** The Basic / KPI / Allowance and employer statutory HR keyed. */
  components: HvShareComponents | null
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** The departments director_hv_share_of hands the window. */
export function readHvDepartments(raw: unknown): HvDepartment[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(r => {
    const o = obj(r)
    const id = str(o?.id)
    const name = str(o?.name)
    return o && id && name ? [{ id, name, internal: o.internal === true }] : []
  })
}

/** A share as the functions answer it (snake_case jsonb) — null when there is none. */
export function readHvShare(raw: unknown): HvShare | null {
  const o = obj(raw)
  const id = str(o?.id)
  if (!o || !id) return null
  const lines: HvShareLine[] = Array.isArray(o.lines)
    ? o.lines.flatMap(r => {
        const l = obj(r)
        const departmentId = str(l?.department_id)
        if (!l || !departmentId) return []
        return [{
          departmentId,
          department: str(l.department) ?? '—',
          stays: l.stays === true,
          amount: num(l.amount),
          pct: l.pct == null ? null : num(l.pct),
        }]
      })
    : []
  return {
    id,
    periodMonth: str(o.period_month) ?? '',
    totalCtc: num(o.total_ctc),
    splitMode: o.split_mode === 'percent' ? 'percent' : 'amount',
    status: o.status === 'in_payroll' ? 'in_payroll' : 'open',
    submittedAt: str(o.submitted_at),
    submittedBy: str(o.submitted_by),
    batchId: str(o.batch_id),
    batchNo: o.batch_no == null ? null : num(o.batch_no),
    batchSubmittedAt: str(o.batch_submitted_at),
    lines,
    components: 'basic' in o
      ? {
          basic: num(o.basic),
          kpi: num(o.kpi),
          allowance: num(o.allowance),
          employerEpf: num(o.employer_epf),
          employerSocso: num(o.employer_socso),
          employerEis: num(o.employer_eis),
          erManual: o.er_manual === true,
        }
      : null,
  }
}

// ─── The split ───────────────────────────────────────────────────────────────

/** A percentage is kept to four places (director_hv_share_lines.pct). */
const PCT_SCALE = 10_000

/** A money figure in sen. */
export const toCents = (n: number): number => Math.round(n * 100)

/** a ÷ b for non-negative whole numbers, rounded half away from zero (Postgres' round). */
function divRound(a: number, b: number): number {
  const q = Math.floor(a / b)
  const r = a - q * b
  return 2 * r >= b ? q + 1 : q
}

/**
 * Each percentage's amount of `total`, to the sen, the way the database works
 * it out: rounded half away from zero, and what that leaves (a sen or two) on
 * the biggest percentage — the first of equals — so they add up exactly.
 */
export function percentAmounts(total: number, pcts: readonly number[]): number[] {
  if (pcts.length === 0) return []
  const totalCents = toCents(total)
  const scaled = pcts.map(p => Math.round(p * PCT_SCALE))
  const cents = scaled.map(p => divRound(totalCents * p, 100 * PCT_SCALE))
  let big = 0
  scaled.forEach((p, i) => {
    if (p > scaled[big]) big = i
  })
  cents[big] += totalCents - cents.reduce((s, c) => s + c, 0)
  return cents.map(c => c / 100)
}

/** What HR typed in the window, one line a department. */
export interface HvDraftLine {
  departmentId: string
  /** An amount (RM) or a percentage, as typed. */
  value: string
}

/** A typed figure — commas allowed, nothing else. NaN when it is not one. */
export function parseFigure(value: string): number {
  const t = value.replace(/,/g, '').trim()
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

export interface HvSplitCheck {
  /** Each line's amount as it would be saved (0 where its figure cannot be read). */
  amounts: number[]
  /** RM placed on the lines so far, and what is left of the total (below zero: too much). */
  placed: number
  left: number
  /** Percent mode: the percentage placed so far. */
  pctPlaced: number
  /** Why Confirm waits — null once it may go. */
  problem: string | null
}

const rm = (n: number) =>
  `RM ${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pctText = (n: number) => `${Number(n.toFixed(4))}%`

/**
 * The window's split, checked as director_hv_share_save checks it: a
 * department on every line, none twice, a figure above zero on each, and —
 * by percentage — 100% in all, by amount the total to the sen.
 */
export function checkHvSplit(
  total: number,
  mode: HvSplitMode,
  lines: readonly HvDraftLine[],
  nameOf: (departmentId: string) => string,
): HvSplitCheck {
  const totalCents = toCents(total)
  const figures = lines.map(l => parseFigure(l.value))
  const readable = figures.map(f => (Number.isFinite(f) && f > 0 ? f : 0))

  let amounts: number[]
  let pctPlaced = 0
  if (mode === 'percent') {
    pctPlaced = readable.reduce((s, p) => s + Math.round(p * PCT_SCALE), 0) / PCT_SCALE
    // Amounts only mean something once the percentages make 100%; until then
    // each line shows its own share, unrounded-up.
    amounts = Math.round(pctPlaced * PCT_SCALE) === 100 * PCT_SCALE
      ? percentAmounts(total, readable)
      : readable.map(p => divRound(totalCents * Math.round(p * PCT_SCALE), 100 * PCT_SCALE) / 100)
  } else {
    amounts = readable.map(a => toCents(a) / 100)
  }
  const placedCents = amounts.reduce((s, a) => s + toCents(a), 0)
  const result = (problem: string | null): HvSplitCheck => ({
    amounts,
    placed: placedCents / 100,
    left: (totalCents - placedCents) / 100,
    pctPlaced,
    problem,
  })

  if (!(totalCents > 0)) return result('HOUZS Venture has nothing to split')
  if (lines.length === 0) return result('Add a department')
  if (lines.some(l => !l.departmentId)) return result('Pick a department on every line')
  const seen = new Set<string>()
  for (const l of lines) {
    if (seen.has(l.departmentId)) return result(`${nameOf(l.departmentId)} is picked twice`)
    seen.add(l.departmentId)
  }
  if (figures.some(f => !(Number.isFinite(f) && f > 0))) {
    return result(mode === 'percent' ? 'Every department needs a percentage' : 'Every department needs an amount')
  }
  if (mode === 'percent') {
    if (figures.some(p => p > 100)) return result('A percentage is at most 100%')
    const placedScaled = Math.round(pctPlaced * PCT_SCALE)
    if (placedScaled !== 100 * PCT_SCALE) {
      return result(
        placedScaled < 100 * PCT_SCALE
          ? `${pctText(pctPlaced)} placed — ${pctText((100 * PCT_SCALE - placedScaled) / PCT_SCALE)} left`
          : `${pctText(pctPlaced)} placed — ${pctText((placedScaled - 100 * PCT_SCALE) / PCT_SCALE)} too much`,
      )
    }
    if (amounts.some(a => !(a > 0))) return result(`A percentage too small for a sen of ${rm(total)}`)
    return result(null)
  }
  if (placedCents !== totalCents) {
    return result(
      placedCents < totalCents
        ? `${rm((totalCents - placedCents) / 100)} left to place`
        : `${rm((placedCents - totalCents) / 100)} more than HOUZS Venture's total`,
    )
  }
  return result(null)
}

/** What a new line starts with: whatever is still left (blank when nothing is). */
export function leftFigure(total: number, mode: HvSplitMode, lines: readonly HvDraftLine[]): string {
  const check = checkHvSplit(total, mode, lines, () => '')
  if (mode === 'percent') {
    const left = Math.round((100 - check.pctPlaced) * PCT_SCALE) / PCT_SCALE
    return left > 0 ? String(left) : ''
  }
  return check.left > 0 ? check.left.toFixed(2) : ''
}

/**
 * The same split in the other mode, so a switch keeps what HR placed: amounts
 * as percentages of the total (to four places, the biggest taking what
 * rounding leaves so they still make 100), percentages as their amounts.
 */
export function switchMode(
  total: number,
  from: HvSplitMode,
  lines: readonly HvDraftLine[],
): HvDraftLine[] {
  const figures = lines.map(l => parseFigure(l.value))
  if (from === 'percent') {
    const pcts = figures.map(f => (Number.isFinite(f) && f > 0 ? f : 0))
    const whole = Math.round(pcts.reduce((s, p) => s + p, 0) * PCT_SCALE) === 100 * PCT_SCALE
    const amounts = whole ? percentAmounts(total, pcts) : pcts.map(p => Math.round(total * p) / 100)
    return lines.map((l, i) => ({ ...l, value: Number.isFinite(figures[i]) && figures[i] > 0 ? amounts[i].toFixed(2) : '' }))
  }
  const totalCents = toCents(total)
  if (!(totalCents > 0)) return lines.map(l => ({ ...l, value: '' }))
  const cents = figures.map(f => (Number.isFinite(f) && f > 0 ? toCents(f) : 0))
  const scaled = cents.map(c => divRound(c * 100 * PCT_SCALE, totalCents))
  const placed = cents.reduce((s, c) => s + c, 0)
  if (placed === totalCents && scaled.length > 0) {
    let big = 0
    scaled.forEach((p, i) => {
      if (p > scaled[big]) big = i
    })
    scaled[big] += 100 * PCT_SCALE - scaled.reduce((s, p) => s + p, 0)
  }
  return lines.map((l, i) => ({ ...l, value: cents[i] > 0 ? String(scaled[i] / PCT_SCALE) : '' }))
}
