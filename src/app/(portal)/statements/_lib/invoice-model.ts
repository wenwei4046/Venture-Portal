import { billingModeLabel, invoiceParty } from '@/lib/invoice-labels'
import { payeeKey } from '@/lib/invoice-settlement'
import type { AccountType } from '@/lib/coa'
import type { DepartmentMode } from '@/lib/department-mode'

// Invoice's hub (2026-10-14, the Finance revamp v2 — D10 of `.design/fin-r2/handoff`):
// what the page hands the browser, and how it is put together from the rows
// the server read (`invoice-hub.ts`). Every figure an invoice shows — what came
// in, what credit notes took off, what is left to collect — is worked out
// here once, as the invoice's own page (`/invoices/[id]`) works it out, so the
// list, its cards, the drawer and the settle dialog all say the same.

const r2 = (n: number) => Math.round(n * 100) / 100
const PAID = new Set(['paid', 'paid_via_netting'])

export interface HubInvoiceLine {
  description: string
  /** The account's name, its code under it. */
  account: string | null
  code: string | null
  amount: number
}

export interface HubInvoiceReceipt {
  no: string | null
  date: string | null
  /** This invoice's part of it. */
  amount: number
  /** A consolidated receipt that settled it with others: what that receipt took in all. */
  batchTotal: number | null
}

export interface HubCreditNoteLine {
  id: string
  no: string | null
  amount: number
  status: string
  reason: string | null
}

/** What the edit dialog starts from — the invoice as stored. */
export interface InvoiceEditInitial {
  total_amount: number
  category_code: string | null
  description: string | null
  invoice_date: string | null
  due_date: string | null
  reference_no: string | null
  billing_mode: string | null
  billable_to_type: string | null
  company_id: string | null
  billable_to_department_id: string | null
  billable_to_freetext_name: string | null
  billable_to_freetext_address: string | null
  billable_to_freetext_phone: string | null
  billable_to_freetext_email: string | null
  period_month: string | null
}

export interface HubInvoice {
  id: string
  no: string | null
  /** draft · issued · paid · paid_via_netting · voided */
  status: string
  /** `YYYY-MM-01`. */
  periodMonth: string
  /** Another month's invoice still owed — listed only once *Other months* is on. */
  other: boolean
  party: { name: string; kind: string }
  /** One receipt settles one payer (lib/invoice-settlement). */
  payee: string
  billableType: string | null
  /** Its description as written. */
  description: string
  /** Its first line — what a row shows. */
  summary: string
  modeKey: string
  /** The billing mode in words ("HR attribution"). */
  mode: string
  /** What its lines post to, in words — the list's Category. */
  category: string | null
  /** The drawer's GL category: the account's name, its code under it. */
  gl: { name: string; code: string } | null
  date: string | null
  due: string | null
  reference: string | null
  total: number
  /** Money in against it. */
  received: number
  /** Approved credit notes against it. */
  credited: number
  /** What an issued invoice still has to collect (a draft: its total; otherwise nothing). */
  remaining: number
  lines: HubInvoiceLine[]
  receipts: HubInvoiceReceipt[]
  creditNotes: HubCreditNoteLine[]
  /** Settled here, on one receipt: issued and not a department pool's (that one settles by netting on the voucher page). */
  settleable: boolean
  /** Voided as it stands: issued, nothing received, no credit note. */
  voidable: boolean
  contractId: string | null
  edit: InvoiceEditInitial
  /** Its stored lines as the edit dialog takes them (none for a simple invoice). */
  editLines: Array<{ description: string | null; amount: number; category_code: string | null }>
}

export interface HubCreditNote {
  id: string
  no: string | null
  invoiceId: string
  invoiceNo: string | null
  party: string
  amount: number
  reason: string
  status: string
  /** "5020 · Salary Income". */
  category: string | null
  createdAt: string | null
}

export interface HubContract {
  id: string
  description: string
  amount: number | null
  /** active · completed · … ; an active one not yet signed off reads *pending approval*. */
  status: string
  start: string | null
  end: string | null
  /** "HOUZS Century (HC)". */
  company: string
  /** Its invoice this month (the Generate Marketing invoices draft). */
  invoice: { id: string; no: string | null } | null
}

export interface HubMovement {
  id: string
  at: string
  type: string
  amount: number
  description: string
  /** Where it came from, in words ("Payment voucher"). */
  source: string
  /** It left the pool. */
  out: boolean
}

export interface PayrollBasisModel {
  /** Submitted · Partly · Pending */
  status: string
  /** "HR 5 Oct · Director salary 5 Oct · 0 marketing contracts". */
  note: string
  /** "HR 1,352 / 5,797 · Director 9,642 ✓" — or that nothing came from payroll yet. */
  summary: string
  lines: Array<{ key: string; label: string; value: string }>
  director: {
    submittedAt: string | null
    count: number
    gross: number
    billed: number
    rows: Array<{
      code: string
      name: string
      basic: number | null
      kpi: number | null
      allowance: number | null
      epfEr: number | null
      socsoEr: number | null
      eisEr: number | null
      total: number
    }>
  } | null
  allocation: Array<{
    department: string
    rows: Array<{ code: string; name: string; amount: number; salary: number; allowance: number; epf: number; socso: number; eis: number }>
    billable: number
    /** HV's own share — not billed. */
    own: { amount: number; salary: number; allowance: number; epf: number; socso: number; eis: number } | null
  }>
}

export interface InvoiceHubData {
  /** `YYYY-MM-01`. */
  period: string
  /** The month's invoices, newest number first. */
  invoices: HubInvoice[]
  /** Other months' invoices still owed (issued), for one receipt across months. */
  otherOpen: HubInvoice[]
  creditNotes: HubCreditNote[]
  contracts: HubContract[]
  nonBillable: HubMovement[]
  /** "Hong Leong Bank — 123-456-7890", the primary first. */
  banks: Array<{ id: string; label: string }>
  basis: PayrollBasisModel
  /** Finance's own cost-center / centralized switch (null when it cannot be read). */
  department: DepartmentMode | null
  // What the create, edit and credit-note dialogs offer.
  companies: Array<{ id: string; name: string; short_code: string }>
  departments: Array<{ id: string; name: string }>
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  extraModes: Array<{ value: string; label: string }>
}

// ── What the server read, as it read it ──

export interface InvoiceRowIn {
  id: string
  invoice_no: string | null
  company_id: string | null
  period_month: string
  billing_mode: string
  total_amount: number | string
  status: string
  billable_to_type: string | null
  billable_to_department_id: string | null
  billable_to_freetext_name: string | null
  billable_to_freetext_address: string | null
  billable_to_freetext_phone: string | null
  billable_to_freetext_email: string | null
  description: string | null
  invoice_date: string | null
  due_date: string | null
  reference_no: string | null
  category_code: string | null
  settlement_voucher_id?: string | null
  contract_id?: string | null
}

export interface InvoiceContext {
  companies: ReadonlyMap<string, { name: string; code: string | null }>
  departments: ReadonlyMap<string, string>
  /** code → name, every account. */
  accounts: ReadonlyMap<string, string>
  extraModes: ReadonlyArray<{ value: string; label: string }>
  lines: ReadonlyMap<string, Array<{ description: string | null; amount: number; category_code: string | null }>>
  /** Receipts made against an invoice (credit vouchers naming it, not voided), in payment-date order. */
  receipts: ReadonlyMap<string, Array<{ voucher_no: string | null; payment_date: string | null; amount: number }>>
  /** The consolidated receipt an invoice points at (settlement_voucher_id). */
  settlements: ReadonlyMap<string, { voucher_no: string | null; payment_date: string | null; amount: number }>
  creditNotes: ReadonlyMap<string, HubCreditNoteLine[]>
}

const firstLine = (s: string) => s.split(/\r?\n/)[0].trim()

/** One invoice as every part of the hub reads it. */
export function toHubInvoice(inv: InvoiceRowIn, ctx: InvoiceContext, other = false): HubInvoice {
  const total = r2(Number(inv.total_amount))
  const status = inv.status
  const isPaid = PAID.has(status)
  const party = invoiceParty(
    {
      company_id: inv.company_id,
      billable_to_type: inv.billable_to_type,
      billable_to_department_id: inv.billable_to_department_id,
      billable_to_freetext_name: inv.billable_to_freetext_name,
    },
    ctx.companies,
    ctx.departments,
  )
  const description = (inv.description ?? '').trim()

  // What it bills: its lines, or — a simple invoice — the invoice itself.
  const stored = ctx.lines.get(inv.id) ?? []
  const accountOf = (code: string | null) => (code ? (ctx.accounts.get(code) ?? code) : null)
  const lines: HubInvoiceLine[] =
    stored.length > 0
      ? stored.map((l) => ({ description: (l.description ?? '').trim(), account: accountOf(l.category_code), code: l.category_code, amount: r2(Number(l.amount)) }))
      : [{ description: firstLine(description) || 'Invoice amount', account: accountOf(inv.category_code), code: inv.category_code, amount: total }]
  const lineCodes = [...new Set(stored.map((l) => l.category_code).filter((c): c is string => !!c))]
  const category = lineCodes.length > 0 ? lineCodes.map((c) => accountOf(c)!).join(' + ') : accountOf(inv.category_code)
  const gl = inv.category_code
    ? { name: accountOf(inv.category_code)!, code: inv.category_code }
    : lineCodes.length > 0
      ? { name: lineCodes.map((c) => accountOf(c)!).join(' + '), code: lineCodes.join(' + ') }
      : null

  // Money in. A consolidated receipt covers other invoices too: this
  // invoice's part of it is what it still owed when it was settled.
  const creditNotes = ctx.creditNotes.get(inv.id) ?? []
  const credited = r2(creditNotes.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amount, 0))
  const direct = (ctx.receipts.get(inv.id) ?? []).map((r) => ({ no: r.voucher_no, date: r.payment_date, amount: r2(Number(r.amount)), batchTotal: null as number | null }))
  const directReceived = r2(direct.reduce((s, r) => s + r.amount, 0))
  const receipts: HubInvoiceReceipt[] = [...direct]
  const batch = inv.settlement_voucher_id ? ctx.settlements.get(inv.settlement_voucher_id) : undefined
  if (batch && !direct.some((r) => r.no && r.no === batch.voucher_no)) {
    receipts.push({
      no: batch.voucher_no,
      date: batch.payment_date,
      amount: isPaid ? r2(Math.max(0, total - credited - directReceived)) : 0,
      batchTotal: r2(Number(batch.amount)),
    })
  }
  const received = isPaid ? r2(Math.max(directReceived, total - credited)) : directReceived
  const remaining = status === 'issued' ? r2(Math.max(0, total - directReceived - credited)) : status === 'draft' ? total : 0

  return {
    id: inv.id,
    no: inv.invoice_no,
    status,
    periodMonth: inv.period_month,
    other,
    party,
    payee: payeeKey({
      id: inv.id,
      status,
      billable_to_type: inv.billable_to_type,
      company_id: inv.company_id,
      billable_to_freetext_name: inv.billable_to_freetext_name,
      total_amount: total,
    }),
    billableType: inv.billable_to_type,
    description,
    summary: firstLine(description),
    modeKey: inv.billing_mode,
    mode: billingModeLabel(inv.billing_mode, ctx.extraModes),
    category,
    gl,
    date: inv.invoice_date,
    due: inv.due_date,
    reference: inv.reference_no,
    total,
    received,
    credited,
    remaining,
    lines,
    receipts,
    creditNotes,
    settleable: status === 'issued' && inv.billable_to_type !== 'dept_pool',
    voidable: status === 'issued' && directReceived <= 0 && credited <= 0,
    contractId: inv.contract_id ?? null,
    edit: {
      total_amount: total,
      category_code: inv.category_code,
      description: inv.description,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      reference_no: inv.reference_no,
      billing_mode: inv.billing_mode,
      billable_to_type: inv.billable_to_type,
      company_id: inv.company_id,
      billable_to_department_id: inv.billable_to_department_id,
      billable_to_freetext_name: inv.billable_to_freetext_name,
      billable_to_freetext_address: inv.billable_to_freetext_address,
      billable_to_freetext_phone: inv.billable_to_freetext_phone,
      billable_to_freetext_email: inv.billable_to_freetext_email,
      period_month: inv.period_month,
    },
    editLines: stored.map((l) => ({ description: l.description, amount: Number(l.amount), category_code: l.category_code })),
  }
}

// ── The cards ──

export type InvoiceCardKey = 'all' | 'issued' | 'paid' | 'draft' | 'voided' | 'cn' | 'mkt' | 'nonbill'
export const STATUS_CARD_KEYS = ['all', 'issued', 'paid', 'draft', 'voided'] as const
export type StatusCardKey = (typeof STATUS_CARD_KEYS)[number]

/** Whether an invoice is on a status card's list (Paid takes *paid via netting* too). */
export function onCard(inv: Pick<HubInvoice, 'status'>, card: StatusCardKey): boolean {
  if (card === 'all') return true
  if (card === 'paid') return PAID.has(inv.status)
  return inv.status === card
}

/** The total beside the month: what went out as invoices — issued or paid, never a draft or a voided one. */
export function invoicedTotal(invoices: ReadonlyArray<Pick<HubInvoice, 'status' | 'total'>>): { count: number; amount: number } {
  const live = invoices.filter((i) => i.status !== 'voided' && i.status !== 'draft')
  return { count: live.length, amount: r2(live.reduce((s, i) => s + i.total, 0)) }
}

/** A status card's figures: what its list holds, as the list's head counts it. */
export function statusCard(invoices: ReadonlyArray<Pick<HubInvoice, 'status' | 'total'>>, card: StatusCardKey): { count: number; amount: number } {
  const on = invoices.filter((i) => onCard(i, card))
  return { count: on.length, amount: r2(on.reduce((s, i) => s + i.total, 0)) }
}

/** What a selection settles: one payer's settleable invoices, their balances summed. */
export function settleSelection(selected: ReadonlyArray<HubInvoice>): {
  settleable: HubInvoice[]
  voidable: HubInvoice[]
  /** Σ what the settleable ones still owe. */
  total: number
  payees: number
  /** The one payer's name, when there is one. */
  payer: string | null
} {
  const settleable = selected.filter((i) => i.settleable)
  const voidable = selected.filter((i) => i.voidable)
  const payees = new Set(settleable.map((i) => i.payee))
  return {
    settleable,
    voidable,
    total: r2(settleable.reduce((s, i) => s + i.remaining, 0)),
    payees: payees.size,
    payer: payees.size === 1 ? settleable[0].party.name : null,
  }
}

/** The status in the design's words — as the list's chip, the drawer's hero and the full page say it. */
export function statusText(status: string): string {
  return status === 'paid_via_netting' ? 'paid via netting' : status
}

/** A status's tone: issued waits, paid is green, voided red, a draft quiet. */
export function statusTone(status: string): 'alert' | 'ledger' | 'danger' | 'def' {
  return status === 'issued' ? 'alert' : status === 'paid' || status === 'paid_via_netting' ? 'ledger' : status === 'voided' ? 'danger' : 'def'
}

/** "29 days left" / "Due today" / "3 days past due" — counted from the office's today. */
export function dueNote(inv: Pick<HubInvoice, 'status' | 'due'>, today: string): string | undefined {
  if (inv.status === 'paid' || inv.status === 'paid_via_netting') return 'Paid'
  if (inv.status === 'voided') return 'Voided'
  if (inv.status === 'draft') return 'Draft'
  if (!inv.due) return 'No due date'
  const days = Math.round((Date.parse(inv.due.slice(0, 10)) - Date.parse(today)) / 864e5)
  if (days > 1) return `${days} days left`
  if (days === 1) return '1 day left'
  if (days === 0) return 'Due today'
  return `${-days} ${days === -1 ? 'day' : 'days'} past due`
}

/**
 * What a credit note on it starts from (the hub's and the invoice's own page
 * alike): the total less what came in less its credit notes not voided —
 * drafts hold theirs, as the server counts — and the billing mode and the one
 * account its first line starts on.
 */
export function creditNoteFigures(inv: HubInvoice): {
  id: string
  no: string | null
  party: string
  total: number
  received: number
  credited: number
  mode: string | null
  category: string | null
} {
  const cats = new Set(inv.editLines.map((l) => l.category_code ?? ''))
  return {
    id: inv.id,
    no: inv.no,
    party: inv.party.name,
    total: inv.total,
    received: inv.received,
    credited: r2(inv.creditNotes.filter((c) => c.status !== 'voided').reduce((s, c) => s + c.amount, 0)),
    mode: inv.modeKey,
    category: inv.edit.category_code ?? (cats.size === 1 ? [...cats][0] || null : null),
  }
}

/**
 * Back from the voucher page with the voucher it wrote (`?receipt=`): a
 * department pool's settle by netting writes a receipt, a refund a payment
 * voucher — each said as what it is.
 */
export function returnedNote(no: string): string {
  return /-OR-/.test(no) ? `Receipt ${no} written — the invoice is settled` : `Refund voucher ${no} written`
}

/** The accounts its lines posted to, with their totals — Change account moves them in one go. */
export function postedAccounts(inv: HubInvoice): Array<{ code: string; amount: number }> {
  const by = new Map<string, number>()
  for (const l of inv.editLines) if (l.category_code) by.set(l.category_code, r2((by.get(l.category_code) ?? 0) + Number(l.amount)))
  return [...by.entries()].map(([code, amount]) => ({ code, amount })).sort((a, b) => a.code.localeCompare(b.code))
}
