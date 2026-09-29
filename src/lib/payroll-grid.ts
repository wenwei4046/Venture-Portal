/**
 * Pure helpers behind the HR payroll grid (redesigned 2026-09-05 — "C ·
 * Window", picked out of three mockups): grouping by department with
 * subtotals, the dirty-field check that the row and its paycheck window
 * share, and the parsing / formatting the editable cells use. Kept out of
 * the components so they run under Vitest without Next.js in the way
 * (TESTING.md).
 */
import { round2 } from './payroll-funding'

/** What HR types and the payroll trigger works the rest out from. */
export const PAYROLL_INPUT_FIELDS = [
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

/**
 * The statutory figures, every one of them a field since 2026-09-30 ("在这个
 * payroll tab 那边，所有的东西基本上都应该是可以被 editable 的"). JADUAL fills
 * each until somebody types it; a typed figure is saved as that field's
 * override and survives every later recompute until Reset to JADUAL. The
 * employee's side first — it is what comes off the pay, under Deductions.
 */
export const PAYROLL_STATUTORY_FIELDS = [
  'epf_ee',
  'socso_ee',
  'eis_ee',
  'pcb',
  'epf_er',
  'socso_er',
  'eis_er',
] as const

export const PAYROLL_EDIT_FIELDS = [...PAYROLL_INPUT_FIELDS, ...PAYROLL_STATUTORY_FIELDS] as const

export type PayrollInputField = (typeof PAYROLL_INPUT_FIELDS)[number]
export type PayrollStatutoryField = (typeof PAYROLL_STATUTORY_FIELDS)[number]
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
  epf_ee: 'EPF employee',
  socso_ee: 'SOCSO employee',
  eis_ee: 'EIS employee',
  pcb: 'PCB',
  epf_er: 'EPF employer',
  socso_er: 'SOCSO employer',
  eis_er: 'EIS employer',
}

/**
 * Where a typed statutory figure is kept — its own column, which the compute
 * trigger reads over the JADUAL lookup every time it runs
 * (20260930010000_payroll_statutory_overrides).
 */
export const STATUTORY_OVERRIDE_COLUMN = {
  epf_ee: 'epf_ee_override_amount',
  socso_ee: 'socso_ee_override_amount',
  eis_ee: 'eis_ee_override_amount',
  pcb: 'pcb_override_amount',
  epf_er: 'epf_er_override_amount',
  socso_er: 'socso_er_override_amount',
  eis_er: 'eis_er_override_amount',
} as const satisfies Record<PayrollStatutoryField, string>

export type StatutoryOverrideColumn = (typeof STATUTORY_OVERRIDE_COLUMN)[PayrollStatutoryField]
export const STATUTORY_OVERRIDE_COLUMNS = Object.values(STATUTORY_OVERRIDE_COLUMN) as StatutoryOverrideColumn[]

/** What a typed statutory figure's accent dot says on hover. */
export const TYPED_STATUTORY_HINT =
  'Typed by hand — stays when the pay changes, until Reset statutory to JADUAL (the row’s ⋯ menu or the paycheck)'

export function isStatutoryField(field: string): field is PayrollStatutoryField {
  return (PAYROLL_STATUTORY_FIELDS as readonly string[]).includes(field)
}

function isInputField(field: string): field is PayrollInputField {
  return (PAYROLL_INPUT_FIELDS as readonly string[]).includes(field)
}

/** The statutory figures somebody typed on this row, read off its override columns. */
export function typedStatutory(
  row: { [C in StatutoryOverrideColumn]?: number | string | null },
): PayrollStatutoryField[] {
  return PAYROLL_STATUTORY_FIELDS.filter(f => row[STATUTORY_OVERRIDE_COLUMN[f]] != null)
}

export type PayrollTaxMode = 'pcb' | 'withholding' | 'none'

/**
 * A row's save, as the columns it writes. Inputs pass through; a typed
 * statutory figure goes to its override column, never onto the figure itself
 * (the trigger derives that one, and would write JADUAL over it). `typed`
 * says to stamp who overrode the row and when. Refuses an unknown field —
 * the grid never sends one, and without the check a crafted save could write
 * net or gross straight onto the row — a negative or non-numeric statutory
 * figure, and PCB for somebody whose tax is withholding or none.
 */
export function payrollRowWrite(
  fields: Partial<Record<string, number>>,
  taxMode: PayrollTaxMode | null = null,
): { columns: Partial<Record<PayrollInputField | StatutoryOverrideColumn, number>>; typed: boolean } {
  const columns: Partial<Record<PayrollInputField | StatutoryOverrideColumn, number>> = {}
  let typed = false
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (isStatutoryField(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`${PAYROLL_FIELD_LABELS[key]} must be zero or more.`)
      }
      if (key === 'pcb' && taxMode && taxMode !== 'pcb') {
        throw new Error(
          `PCB does not apply to this person — their People record sets ${taxMode === 'withholding' ? 'withholding tax' : 'no tax'}.`,
        )
      }
      // Rounded to the cent by the numeric(15,2) column, like every input.
      columns[STATUTORY_OVERRIDE_COLUMN[key]] = value
      typed = true
    } else if (isInputField(key)) {
      columns[key] = value
    } else {
      throw new Error(`Unknown payroll field: ${key}`)
    }
  }
  return { columns, typed }
}

/** The sixteen editable figures of a row, as numbers — the row's working copy. */
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

/**
 * What a row sends when it is saved: every input, as before, and a statutory
 * figure only once it differs from what is saved. Sending an untouched one
 * would turn JADUAL's figure into a typed one, and it would stop following
 * the pay. A derived commission is never sent — the run owns it.
 */
export function rowUpdateFromEdit(
  edit: PayrollEdit,
  saved: Partial<Record<PayrollEditField, number>>,
  opts: { commissionDerived: boolean },
): Partial<PayrollEdit> {
  const out: Partial<PayrollEdit> = {}
  for (const f of PAYROLL_INPUT_FIELDS) {
    if (f === 'commission_amount' && opts.commissionDerived) continue
    out[f] = edit[f]
  }
  for (const f of dirtyFields(edit, saved)) {
    if (isStatutoryField(f)) out[f] = edit[f]
  }
  return out
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
