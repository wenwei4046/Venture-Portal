// Service Billing and the monthly Statements on the sheet (2026-10-07; the
// user approved the Invoice / Statements sample, v6). The figures behind the
// summary cards and the folded "Payroll basis" line live here, so the pages
// only draw them.

export interface SheetInvoice {
  id: string
  status: string
  total_amount: number | string
  billing_mode: string
}

export interface InvoiceSummary {
  /** Everything invoiced this period, the voided left out. */
  invoiced: number
  invoicedCount: number
  voidedCount: number
  draftCount: number
  /** What the issued invoices still owe, after part-payments and credit notes. */
  outstanding: number
  issuedCount: number
  partPaidCount: number
  /** Paid invoices, plus the part-payments on the issued ones. */
  received: number
  paidCount: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const PAID = new Set(['paid', 'paid_via_netting'])

export function invoiceSummary(
  invoices: SheetInvoice[],
  paidByInvoice: Record<string, number> = {},
  cnByInvoice: Record<string, number> = {},
): InvoiceSummary {
  let invoiced = 0
  let invoicedCount = 0
  let voidedCount = 0
  let draftCount = 0
  let outstanding = 0
  let issuedCount = 0
  let partPaidCount = 0
  let received = 0
  let paidCount = 0
  for (const inv of invoices) {
    const total = Number(inv.total_amount)
    if (inv.status === 'voided') {
      voidedCount++
      continue
    }
    invoiced += total
    invoicedCount++
    if (inv.status === 'draft') draftCount++
    if (inv.status === 'issued') {
      issuedCount++
      const paid = paidByInvoice[inv.id] ?? 0
      if (paid > 0) partPaidCount++
      received += paid
      outstanding += total - paid - (cnByInvoice[inv.id] ?? 0)
    } else if (PAID.has(inv.status)) {
      paidCount++
      received += total
    }
  }
  return {
    invoiced: r2(invoiced),
    invoicedCount,
    voidedCount,
    draftCount,
    outstanding: r2(outstanding),
    issuedCount,
    partPaidCount,
    received: r2(received),
    paidCount,
  }
}

export interface PayrollBillingLine {
  key: string
  label: string
  /** The department's payroll cost this period (the payroll run). */
  required: number
  /** What the period's invoices bill for it — the consolidated invoices'
   *  lines by segment, plus the department's own attribution invoices. */
  billed: number
  invoices: number
}

const SEGMENTS: Array<{ key: string; label: string; mode: string }> = [
  { key: 'hr', label: 'HR', mode: 'hr_attribution' },
  { key: 'finance', label: 'Finance', mode: 'finance_attribution' },
  { key: 'director_office', label: 'Director Office', mode: 'director_office_attribution' },
  { key: 'it', label: 'IT', mode: 'it_attribution' },
  { key: 'revenue', label: 'Revenue', mode: 'revenue_department_attribution' },
  { key: 'director', label: 'Director', mode: 'director_attribution' },
  { key: 'marketing', label: 'Marketing', mode: 'marketing_project' },
]

export function payrollBillingLines(args: {
  fromPayroll: Record<string, number>
  invoices: SheetInvoice[]
  lines: Array<{ invoice_id: string; amount: number | string; segment: string | null }>
}): PayrollBillingLine[] {
  const live = new Map(args.invoices.filter((i) => i.status !== 'voided').map((i) => [i.id, i]))
  const out: PayrollBillingLine[] = []
  for (const seg of SEGMENTS) {
    const required = r2(args.fromPayroll[seg.key] ?? 0)
    let billed = 0
    const ids = new Set<string>()
    for (const l of args.lines) {
      if (l.segment !== seg.key || !live.has(l.invoice_id)) continue
      billed += Number(l.amount)
      ids.add(l.invoice_id)
    }
    for (const inv of live.values()) {
      if (inv.billing_mode !== seg.mode) continue
      billed += Number(inv.total_amount)
      ids.add(inv.id)
    }
    billed = r2(billed)
    if (required <= 0.005 && billed <= 0.005) continue
    out.push({ key: seg.key, label: seg.label, required, billed, invoices: ids.size })
  }
  return out
}

const whole = (n: number) => Math.round(n).toLocaleString('en-MY')

/** "HR 4,057 / 5,797 · Director 76,996 ✓" — billed over the payroll cost, a tick where they meet. */
export function payrollBasisSummary(lines: PayrollBillingLine[]): string {
  return lines
    .map((l) => (Math.abs(l.billed - l.required) < 1 ? `${l.label} ${whole(l.billed)} ✓` : `${l.label} ${whole(l.billed)} / ${whole(l.required)}`))
    .join(' · ')
}

// The Statements page shows ONE month at a time (2026-10-14, user: 在上面能够
// 选择月份。我不要它把全部月份的 statement 都挤在一个 tab): the month asked for,
// else the newest that has statements. Its first two cards are that month's;
// Draft and All statements stay every month's, so a draft left in another
// month still shows.

export interface StatementsSummary {
  /** The month on show — its statements and their totals. */
  count: number
  invoice: number
  contra: number
  net: number
  /** Every month's. */
  draft: number
  /** How many months still hold a draft. */
  draftMonths: number
  issued: number
  paid: number
  total: number
}

type StatementFigures = { period_month: string; status: string; total_invoice: number | string; total_contra: number | string; net_amount: number | string }

const monthOf = (periodMonth: string) => String(periodMonth).slice(0, 7)

/** The months that have statements, `YYYY-MM`, newest first. */
export function statementMonths(statements: Array<{ period_month: string }>): string[] {
  return Array.from(new Set(statements.map((s) => monthOf(s.period_month)))).sort().reverse()
}

/**
 * The month the page shows, `YYYY-MM`: the one asked for (`?period=2026-05`,
 * or a day in it), else the newest month that has statements, else `fallback`.
 */
export function statementsMonth(asked: string | null | undefined, months: readonly string[], fallback: string): string {
  if (asked && /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(asked)) return asked.slice(0, 7)
  return months[0] ?? fallback
}

/** The cards: the month on show (`YYYY-MM`), and every month's drafts and count. */
export function statementsSummary(statements: StatementFigures[], month: string): StatementsSummary {
  const shown = statements.filter((s) => monthOf(s.period_month) === month)
  const count = (status: string) => statements.filter((s) => s.status === status).length
  return {
    count: shown.length,
    invoice: r2(shown.reduce((s, x) => s + Number(x.total_invoice), 0)),
    contra: r2(shown.reduce((s, x) => s + Number(x.total_contra), 0)),
    net: r2(shown.reduce((s, x) => s + Number(x.net_amount), 0)),
    draft: count('draft'),
    draftMonths: new Set(statements.filter((s) => s.status === 'draft').map((s) => monthOf(s.period_month))).size,
    issued: count('issued'),
    paid: count('paid'),
    total: statements.length,
  }
}
