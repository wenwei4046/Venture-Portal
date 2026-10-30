// The invoice dialogs' rules (2026-10-14, the Finance revamp v2 — D10's
// `inv-form`): who an invoice bills, the billing modes in the hub's words,
// the accounts an invoice posts to, the months it may belong to, HR's figures
// as the lines they are itemised into, and what Several companies makes of its
// rows — an invoice for each company, HR's figure itemised on an account for
// each kind of line. Pure, so the dialogs' arithmetic is tested here; the
// dialogs only draw it.

import dayjs from 'dayjs'
import { typeLabel, type AccountType } from '@/lib/coa'
import { directorCtcParts, type DirectorCtcComponents } from '@/lib/director-ctc-lines'
import { billingModeLabel } from '@/lib/invoice-labels'
import { buildAllocationInvoiceLines, periodShortLabel, type AllocationComponents } from '@/lib/staff-allocation'

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

export const plusDays = (iso: string, days: number) => dayjs(iso).add(days, 'day').format('YYYY-MM-DD')

/** The months an invoice may belong to: a year before the hub's to three after, and the one it has. */
export function periodChoices(month: string, keep?: string | null): Array<{ value: string; label: string }> {
  const base = dayjs(`${month}-01`)
  const out: string[] = []
  for (let i = -12; i <= 3; i++) out.push(base.add(i, 'month').format('YYYY-MM'))
  if (keep && !out.includes(keep)) out.push(keep)
  return out.sort().reverse().map((value) => ({ value, label: dayjs(`${value}-01`).format('MMMM YYYY') }))
}

// ── HR's figures as lines ──

/** The kinds of line HR's figures are itemised into, in the order an invoice lists them. */
export const PART_KINDS: readonly string[] = ['Salary', 'KPI', 'Allowance', 'EPF', 'SOCSO', 'EIS']

export interface RechargePart {
  /** Salary, KPI, Allowance, EPF, SOCSO or EIS. */
  kind: string
  description: string
  amount: number
}

/**
 * HR's figure for a company as the lines it is itemised into, a zero part left
 * out: a shared-services department's staff cost as Multi-line invoice wrote
 * it ("Salary - Sep'26 (HR)"), a director's CTC as the director invoices read
 * ("Salary - Sep'26").
 */
export function rechargeParts(figure: { staff?: AllocationComponents; ctc?: DirectorCtcComponents }, mode: string, month: string): RechargePart[] {
  if (figure.ctc) return directorCtcParts(figure.ctc, month)
  const dept = STAFF_MODE_DEPT[mode]
  return figure.staff && dept ? buildAllocationInvoiceLines(figure.staff, periodShortLabel(month), dept) : []
}

/** The description a recharge from HR's figures starts with ("Salary - HR - Sep'26", "Director salary CTC — September 2026"). */
export function hrDescription(mode: string, month: string): string {
  if (mode === 'director_attribution') return `Director salary CTC — ${dayjs(`${month}-01`).format('MMMM YYYY')}`
  return `Salary - ${STAFF_MODE_DEPT[mode]} - ${periodShortLabel(month)}`
}

// ── Several companies ──

export interface CompanyInvoice {
  companyId: string
  lines: Array<{ description: string; amount: number; categoryCode: string }>
}

const cents = (n: number) => Math.round(n * 100)

/**
 * What Several companies writes (Create invoice, 2026-10-30): an invoice for
 * each company. Billed at exactly HR's figure to the sen, a company's invoice
 * is itemised as HR keyed it, each line on the account picked for its kind
 * (the user: "往后 director 的我也要 split category"); any other amount — one
 * Finance typed or changed — is one line in the invoice's own words, on the
 * one account, or, while HR's kinds are being billed, on the first kind's
 * (Salary's).
 */
export function planCompanyInvoices(input: {
  rows: ReadonlyArray<{ companyId: string; amount: number }>
  /** HR's lines for a company — none for a company HR keyed nothing for. */
  parts: (companyId: string) => RechargePart[]
  description: string
  /** The one account, when no kind of HR's line is being billed. */
  account: string
  /** The kinds of HR's line being billed, and the account picked for each. */
  kinds: readonly string[]
  kindAccounts: Readonly<Record<string, string>>
}): CompanyInvoice[] {
  const { rows, parts, description, account, kinds, kindAccounts } = input
  const oneLine = kinds.length > 0 ? (kindAccounts[kinds[0]] ?? '') : account
  return rows.map((r) => {
    const own = kinds.length > 0 ? parts(r.companyId) : []
    if (own.length > 0 && own.reduce((s, p) => s + cents(p.amount), 0) === cents(r.amount))
      return { companyId: r.companyId, lines: own.map((p) => ({ description: p.description, amount: p.amount, categoryCode: kindAccounts[p.kind] ?? '' })) }
    return { companyId: r.companyId, lines: [{ description, amount: r.amount, categoryCode: oneLine }] }
  })
}

/** "Created 2 of 3 — HOUZS Sofa (HS) · HR attribution: the period is closed." */
export function partialSentence(created: number, failures: Array<{ label: string; reason: string }>): string {
  const total = created + failures.length
  return `Created ${created} of ${total} — ${failures.map((f) => `${f.label}: ${f.reason}`).join('; ')}`
}
