// The invoice dialogs' rules (2026-10-14, the Finance revamp v2 — D10's
// `inv-form`): who an invoice bills, the billing modes in the hub's words,
// the accounts an invoice posts to, the months it may belong to, and what
// Create invoice makes of its fields — one invoice per company and billing
// mode, a director's CTC itemised the way HR keyed it. Pure, so the dialogs'
// arithmetic is tested here; the dialogs only draw it.

import dayjs from 'dayjs'
import { typeLabel, type AccountType } from '@/lib/coa'
import { directorCtcInvoiceLines, type DirectorCtcComponents, type DirectorCtcLine } from '@/lib/director-ctc-lines'
import { billingModeLabel } from '@/lib/invoice-labels'

export type BillKind = 'subsidiary' | 'director' | 'dept_pool' | 'freetext'

// ── Bill to ──
// One select holds every kind of party: a company, a department's pool, or
// a name typed under it (a director, anyone else). Its value says which.

export function billToValue(kind: BillKind, id = ''): string {
  if (kind === 'subsidiary') return id ? `co:${id}` : ''
  if (kind === 'dept_pool') return id ? `dept:${id}` : ''
  return kind
}

export function parseBillTo(value: string): { kind: BillKind | null; companyId: string; deptId: string } {
  if (value.startsWith('co:')) return { kind: 'subsidiary', companyId: value.slice(3), deptId: '' }
  if (value.startsWith('dept:')) return { kind: 'dept_pool', companyId: '', deptId: value.slice(5) }
  if (value === 'director' || value === 'freetext') return { kind: value, companyId: '', deptId: '' }
  return { kind: null, companyId: '', deptId: '' }
}

// ── Billing modes ──
// The pool an invoice credits, named as the hub's table names it (HR
// attribution, Marketing project …); a department provisioned later after
// them, and an invoice's own mode kept when it is none of these.

const CORE_MODES = [
  'hr_attribution',
  'marketing_project',
  'finance_attribution',
  'director_office_attribution',
  'director_attribution',
  'venture_attribution',
] as const

export function modeOptions(
  extra: ReadonlyArray<{ value: string; label: string }>,
  keep?: string | null,
): Array<{ value: string; label: string }> {
  const values: string[] = [...CORE_MODES, ...extra.map((m) => m.value).filter((v) => !(CORE_MODES as readonly string[]).includes(v))]
  if (keep && !values.includes(keep)) values.push(keep)
  return values.map((value) => ({ value, label: billingModeLabel(value, extra) }))
}

/** HR's figures a mode recharges: a shared-services department's staff (by its name in HR's allocation), or the directors' CTC. */
export const STAFF_MODE_DEPT: Readonly<Record<string, string>> = {
  hr_attribution: 'HR',
  finance_attribution: 'Finance',
  director_office_attribution: 'Director Office',
}

export function hrSource(mode: string): 'staff' | 'director' | null {
  if (mode === 'director_attribution') return 'director'
  return mode in STAFF_MODE_DEPT ? 'staff' : null
}

// ── Categories ──

export interface InvoiceCategory {
  code: string
  label: string
  type: AccountType
  parent_code: string | null
}

/** What an invoice mostly posts to first: income, then the costs it recharges, then the rest. */
const TYPE_ORDER: AccountType[] = ['revenue', 'other_income', 'expense', 'cost', 'asset', 'liability', 'equity', 'fixed_asset']

/** The accounts an invoice may post to — none that is another's header — grouped by type, income first. */
export function categoryGroups(categories: ReadonlyArray<InvoiceCategory>): Array<{ type: AccountType; label: string; accounts: InvoiceCategory[] }> {
  const headers = new Set(categories.map((c) => c.parent_code).filter((c): c is string => !!c))
  const postable = categories.filter((c) => !headers.has(c.code))
  return TYPE_ORDER.map((type) => ({ type, label: typeLabel(type), accounts: postable.filter((c) => c.type === type) })).filter((g) => g.accounts.length > 0)
}

// ── Months ──

/** "2026-10" → "2026-10-31": a single invoice's date, while it follows its month (2026-08-13: "我开的invoice 应该是31/07"). */
export const monthEnd = (month: string) => dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD')

export const plusDays = (iso: string, days: number) => dayjs(iso).add(days, 'day').format('YYYY-MM-DD')

/** The months an invoice may belong to: a year before the hub's to three after, and the one it has. */
export function periodChoices(month: string, keep?: string | null): Array<{ value: string; label: string }> {
  const base = dayjs(`${month}-01`)
  const out: string[] = []
  for (let i = -12; i <= 3; i++) out.push(base.add(i, 'month').format('YYYY-MM'))
  if (keep && !out.includes(keep)) out.push(keep)
  return out.sort().reverse().map((value) => ({ value, label: dayjs(`${value}-01`).format('MMMM YYYY') }))
}

// ── Create invoice ──

export interface InvoiceTarget {
  /** Who it bills, in the failure's words ("HOUZS Century (HC)"). */
  label: string
  billKind: BillKind
  companyId?: string
  deptId?: string
  name?: string
  /** Several companies: the company's amount; one party: the Amount field. */
  amount: number
}

export interface InvoicePool {
  mode: string
  category: string
  /** Split: the line's amount — a proportion when several companies share the split. */
  amount: number
}

export type PlannedInvoice =
  | { kind: 'one'; label: string; target: InvoiceTarget; mode: string; category: string; amount: number }
  | { kind: 'lines'; label: string; target: InvoiceTarget; mode: string; lines: DirectorCtcLine[] }

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * What Save draft writes: an invoice for each party and each billing mode.
 * Without a split, each party's amount on the one mode and category. Split,
 * one party: each line its own invoice at the line's amount (the lines add up
 * to the amount). Split across several companies: the lines are proportions
 * — each company's amount divided by them (the old Create Invoice's template).
 * A director recharge on a company HR keyed the CTC for, at exactly that CTC,
 * goes out itemised (Salary / KPI / Allowance / EPF / SOCSO / EIS); an amount
 * Finance changed goes out as one line.
 */
export function planCreateInvoices(input: {
  targets: InvoiceTarget[]
  pools: InvoicePool[]
  split: boolean
  several: boolean
  /** "2026-10". */
  period: string
  ctc: ReadonlyMap<string, DirectorCtcComponents>
  modeLabel?: (mode: string) => string
}): PlannedInvoice[] {
  const { targets, pools, split, several, period, ctc } = input
  const modeLabel = input.modeLabel ?? ((m: string) => billingModeLabel(m))
  const ratioSum = pools.reduce((s, p) => s + p.amount, 0)
  const out: PlannedInvoice[] = []
  for (const target of targets) {
    for (const pool of pools) {
      const amount = !split ? target.amount : several ? (ratioSum > 0 ? r2((target.amount * pool.amount) / ratioSum) : 0) : r2(pool.amount)
      if (!(amount > 0)) continue
      const label = split ? `${target.label} · ${modeLabel(pool.mode)}` : target.label
      const components = pool.mode === 'director_attribution' && target.companyId ? ctc.get(target.companyId) : undefined
      const lines = components ? directorCtcInvoiceLines(components, amount, period, pool.category) : null
      if (lines && lines.length >= 2) out.push({ kind: 'lines', label, target, mode: pool.mode, lines })
      else out.push({ kind: 'one', label, target, mode: pool.mode, category: pool.category, amount })
    }
  }
  return out
}

/** "Created 2 of 3 — HOUZS Sofa (HS) · HR attribution: the period is closed." */
export function partialSentence(created: number, failures: Array<{ label: string; reason: string }>): string {
  const total = created + failures.length
  return `Created ${created} of ${total} — ${failures.map((f) => `${f.label}: ${f.reason}`).join('; ')}`
}
