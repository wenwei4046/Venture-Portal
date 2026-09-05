/**
 * Pure helpers behind the HR payroll grid (redesigned 2026-09-05 — "C ·
 * Window", picked out of three mockups): grouping by department with
 * subtotals, the dirty-field check that the row and its paycheck window
 * share, and the parsing / formatting the editable cells use. Kept out of
 * the components so they run under Vitest without Next.js in the way
 * (TESTING.md).
 */
import { round2 } from './payroll-funding'

export const PAYROLL_EDIT_FIELDS = [
  'basic_salary',
  'statutory_allowance',
  'non_statutory_allowance',
  'ot_hours',
  'ot_amount',
  'commission_amount',
  'unpaid_leave_days',
  'deduction_amount',
  'skbbk_amount',
] as const

export type PayrollEditField = (typeof PAYROLL_EDIT_FIELDS)[number]
export type PayrollEdit = Record<PayrollEditField, number>

export const PAYROLL_FIELD_LABELS: Record<PayrollEditField, string> = {
  basic_salary: 'Basic salary',
  statutory_allowance: 'Statutory allowance',
  non_statutory_allowance: 'Non-statutory allowance',
  ot_hours: 'Overtime hours',
  ot_amount: 'Overtime',
  commission_amount: 'Commission',
  unpaid_leave_days: 'Unpaid leave days',
  deduction_amount: 'Deduction',
  skbbk_amount: 'SKBBK',
}

/** The nine editable figures of a row, as numbers — the row's working copy. */
export function editFromRow(
  row: Partial<Record<PayrollEditField, number | string | null>>,
): PayrollEdit {
  const out = {} as PayrollEdit
  for (const f of PAYROLL_EDIT_FIELDS) {
    const n = Number(row[f] ?? 0)
    out[f] = Number.isFinite(n) ? n : 0
  }
  return out
}

/**
 * Which fields differ from what is saved. A derived commission (Revenue
 * salespeople — the commission run owns that figure) never counts, so a row
 * whose only "change" is the run moving the number is not dirty.
 */
export function dirtyFields(
  edit: PayrollEdit,
  saved: Partial<Record<PayrollEditField, number>>,
  opts: { commissionDerived: boolean } = { commissionDerived: false },
): PayrollEditField[] {
  return PAYROLL_EDIT_FIELDS.filter(f => {
    if (f === 'commission_amount' && opts.commissionDerived) return false
    return Math.abs((edit[f] ?? 0) - (saved[f] ?? 0)) > 1e-9
  })
}

export const NO_DEPARTMENT = '— No department'

export interface DeptGroup<T> {
  dept: string
  rows: T[]
  gross: number
  net: number
}

function deptKey(name: string | null | undefined): string {
  const t = (name ?? '').trim()
  return t === '' || t === '—' ? NO_DEPARTMENT : t
}

/**
 * Rows grouped by department, A→Z with the department-less last, names A→Z
 * inside each, plus the Gross / Net subtotal the band shows under those two
 * columns. Same ordering rule as the People roster.
 */
export function groupByDepartment<
  T extends { dept_name: string; staff_name: string; gross: number; net: number },
>(rows: readonly T[]): DeptGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const key = deptKey(r.dept_name)
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === NO_DEPARTMENT) return 1
      if (b === NO_DEPARTMENT) return -1
      return a.localeCompare(b)
    })
    .map(([dept, list]) => {
      const sorted = [...list].sort((a, b) => a.staff_name.localeCompare(b.staff_name))
      return {
        dept,
        rows: sorted,
        gross: round2(sorted.reduce((s, r) => s + r.gross, 0)),
        net: round2(sorted.reduce((s, r) => s + r.net, 0)),
      }
    })
}

/** Column sums for the totals row, rounded to cents. */
export function columnTotals<T, K extends keyof T>(
  rows: readonly T[],
  keys: readonly K[],
): Record<K, number> {
  const out = {} as Record<K, number>
  for (const k of keys) {
    out[k] = round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0))
  }
  return out
}

/**
 * What the user typed into an amount cell → a number, or null when it is
 * not one (letters, a minus sign — payroll figures are never negative).
 * Thousands separators, spaces and a leading "RM" are tolerated; an empty
 * field means zero, as the old numeric inputs treated it.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/^\s*RM\s*/i, '').replace(/[,\s]/g, '')
  if (cleaned === '' || cleaned === '.') return 0
  if (!/^\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Bare figure with grouping and a fixed number of decimals — 2 for money, 1 for days / hours. */
export function formatAmount(n: number, decimals = 2): string {
  const v = Number.isFinite(n) ? n : 0
  return v.toLocaleString('en-MY', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** The id before / after `current` in display order, or null at either end. */
export function neighbourId(
  order: readonly string[],
  current: string,
  dir: -1 | 1,
): string | null {
  const i = order.indexOf(current)
  if (i < 0) return null
  const j = i + dir
  return j >= 0 && j < order.length ? order[j] : null
}

/** '2026-08-01' → 'August 2026' (UTC, so the label never slips a month). */
export function periodLabel(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
