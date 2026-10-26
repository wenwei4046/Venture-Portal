import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { officeDayStart, officeTime } from '@/lib/office-time'
import { formatMoneyBare } from '@/lib/utils'
import { directorBillingTarget } from '@/lib/billing'
import { payrollBasisSummary, payrollBillingLines } from '@/lib/billing-sheet'
import type { AccountType } from '@/lib/coa'
import { extraBillingModeOptions, primedRegistryRows } from '@/lib/dept-registry'
import { loadDepartmentMode } from '@/lib/department-mode-server'
import { fetchAllRowsAsWritten, fetchByKeys } from '@/lib/paginate'
import { startRead } from '@/lib/start-read'
import { marketingLinesFromRow, NO_MARKETING } from './marketing-lines'
import {
  toHubInvoice,
  type HubCreditNote,
  type HubCreditNoteLine,
  type HubMovement,
  type InvoiceContext,
  type InvoiceHubData,
  type InvoiceRowIn,
  type PayrollBasisModel,
} from './invoice-model'

// Invoice's hub, read (2026-10-14, the Finance revamp v2 — D10). The reads are
// Service Billing's, moved here from BillingView as they were (2026-10-08):
// everything that needs nothing is asked at once, and what hangs off the
// invoices — their lines, receipts, credit notes and batch receipts — the
// moment both invoice lists are in, 100 invoices a time, a chunk that reaches
// PostgREST's 1000-row cap read again in pages. The lines are read for the
// other months' open invoices too now: the drawer shows any listed invoice's.

type Client = Awaited<ReturnType<typeof createClient>>
const r2 = (n: number) => Math.round(n * 100) / 100

const INVOICE_COLUMNS =
  'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_address_parts, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, created_at'

/** A movement that left the pool. The Venture Pool's types are `*_in` / `*_out` (profit_in, expense_out, fund_in,
 *  fund_out, loan_repayment_in); the list read only expense_out, loan_out and saving_out as out, so a loan
 *  disbursed (fund_out, the name loan_out took) showed as money in and was left out of what left the pool. */
const isOut = (type: string) => type.endsWith('_out')

/** Where a Venture Pool movement came from, in words. */
function sourceOf(table: string | null): string {
  if (table === 'payment_vouchers') return 'Payment voucher'
  if (table === 'dept_pools') return 'Dept transfer'
  if (!table) return 'Auto'
  const words = table.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export async function loadInvoiceHub(supabase: Client, period: string): Promise<InvoiceHubData> {
  // The month's venture-pool movements, by the office's calendar.
  const periodStart = officeDayStart(period)
  const periodEnd = officeTime(periodStart).endOf('month').toISOString()

  const invoicesRead = startRead(
    supabase
      .from('invoices')
      .select(`${INVOICE_COLUMNS}, settlement_voucher_id`)
      .eq('period_month', period)
      .order('invoice_no', { ascending: false, nullsFirst: true }),
  )
  // 跨月合并结算 (2026-08-20): a payer often clears several months' invoices
  // with ONE transfer — the other months' still-issued invoices ride along,
  // shown behind *Other months*, so they can be ticked into the same receipt.
  const otherOpenRead = startRead(
    supabase
      .from('invoices')
      .select(INVOICE_COLUMNS)
      .eq('status', 'issued')
      .neq('period_month', period)
      .order('period_month', { ascending: false })
      .order('invoice_no', { ascending: false }),
  )
  const firstReads = startRead(
    Promise.all([
      // Marketing's billing for the month (2026-10-26, ②b-2h): the lines its manager confirmed, by party, with the
      // invoice each is on — and the month's Marketing invoices typed by hand. It replaced the marketing contracts.
      // (Marketing's functions are not in the generated types.)
      supabase.rpc('mkt_bill_import_preview' as never, { p_month: period } as never),
      // Every company and department: an invoice keeps its party's name after it goes inactive (or internal —
      // the own-share invoice bills Venture (Office)); the dialogs offer the active / billable ones.
      supabase.from('companies').select('id, name, short_code, is_active').order('short_code'),
      supabase
        .from('venture_pool')
        .select('id, created_at, transaction_type, amount, description, reference_table')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name, is_internal').order('name'),
      // Every active account, by code (user 2026-09-28: "这个太乱了，应该顺序").
      supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code'),
      supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
      // The live payroll run's per-department OPEX totals — the payroll basis.
      supabase
        .from('payroll_runs')
        .select('marketing_opex_total, hr_opex_total, finance_opex_total, director_office_total, it_opex_total, revenue_opex_total, director_salary_total, approved_at')
        .eq('period_month', period)
        .neq('status', 'rejected')
        .maybeSingle(),
      // Staff billing allocation, department × company aggregates.
      supabase.rpc('get_staff_billing_allocation', { p_period_month: period }),
      // The Director Payroll Submission snapshot.
      supabase
        .from('director_salary_submissions')
        .select('total_gross, total_payroll_gross, total_invoice, total_saving, director_count, by_company, submitted_at')
        .eq('period_month', period)
        .maybeSingle(),
    ]),
  )
  // Finance's cost-center / centralized switch, begun with the page's reads. It never throws.
  const departmentRead = loadDepartmentMode('finance')

  const [{ data: invoices }, { data: otherOpenRaw }] = await Promise.all([invoicesRead, otherOpenRead])
  const monthRows = (invoices ?? []) as InvoiceRowIn[]
  const otherRows = (otherOpenRaw ?? []) as InvoiceRowIn[]
  const allRows = [...monthRows, ...otherRows]
  const allIds = allRows.map((i) => i.id)
  const settleVoucherIds = [...new Set(allRows.map((i) => i.settlement_voucher_id).filter((v): v is string => !!v))]

  // A failed read leaves its rows out, as Service Billing always did.
  const leftOutOnError = <T,>(read: Promise<T[]>) => read.then((data) => ({ data }), () => ({ data: null as T[] | null }))
  // `created_at DESC` as Postgres sorts it (NULLS FIRST); a stable sort keeps a chunk's own order.
  const newestFirst = (at: string | null | undefined) => (at ? Date.parse(at) : Infinity)
  const [{ data: lineRows }, { data: cnRows }, { data: rcptRows }, { data: svRows }] = await Promise.all([
    allIds.length
      ? leftOutOnError(
          fetchByKeys(allIds, async (chunk) => ({
            data: await fetchAllRowsAsWritten((page) => {
              const q = supabase
                .from('invoice_lines')
                .select('invoice_id, line_no, description, amount, category_code, segment')
                .in('invoice_id', chunk)
                .order('line_no')
              return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
            }),
            error: null,
          })),
        )
      : { data: [] as never[] },
    allIds.length
      ? leftOutOnError(
          fetchByKeys(allIds, (chunk) =>
            supabase
              .from('credit_notes')
              .select('id, credit_note_no, invoice_id, amount, reason, status, category_code, billing_mode, created_at')
              .in('invoice_id', chunk)
              .order('created_at', { ascending: false }),
          ).then((rows) => rows.sort((a, b) => newestFirst(b.created_at) - newestFirst(a.created_at))),
        )
      : { data: [] as never[] },
    // Every receipt made against a listed invoice, in payment-date order; a chunk past the cap in pages.
    allIds.length
      ? leftOutOnError(
          fetchByKeys(allIds, async (chunk) => ({
            data: await fetchAllRowsAsWritten((page) => {
              const q = supabase
                .from('payment_vouchers')
                .select('invoice_id, voucher_no, payment_date, amount')
                .in('invoice_id', chunk)
                .eq('direction', 'credit')
                .neq('status', 'voided')
                .order('payment_date')
              return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
            }),
            error: null,
          })),
        )
      : { data: [] as never[] },
    // The consolidated receipt each paid invoice points at.
    settleVoucherIds.length
      ? leftOutOnError(fetchByKeys(settleVoucherIds, (chunk) => supabase.from('payment_vouchers').select('id, voucher_no, payment_date, amount').in('id', chunk)))
      : { data: [] as never[] },
  ])
  const [
    { data: marketingRaw, error: marketingError },
    { data: companies },
    { data: movements },
    { data: departments },
    { data: accounts },
    { data: banks },
    { data: payrollRun },
    { data: allocRows, error: allocError },
    { data: directorSubmission },
  ] = await firstReads
  if (allocError) console.error('get_staff_billing_allocation failed:', allocError.message)
  if (marketingError) console.error('mkt_bill_import_preview failed:', marketingError.message)
  const marketing = (marketingError ? null : marketingLinesFromRow(marketingRaw)) ?? NO_MARKETING(period)

  // ── The context every invoice is read against ──
  const companyRows = (companies ?? []) as Array<{ id: string; name: string; short_code: string | null; is_active: boolean | null }>
  const companyMap = new Map(companyRows.map((c) => [c.id, { name: c.name, code: c.short_code }]))
  const departmentRows = (departments ?? []) as Array<{ id: string; name: string; is_internal: boolean | null }>
  const departmentMap = new Map(departmentRows.map((d) => [d.id, d.name]))
  const accountRows = (accounts ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null }>
  const accountName = new Map(accountRows.map((a) => [a.code, a.name]))
  const extraModes = extraBillingModeOptions(primedRegistryRows())

  const lines = new Map<string, Array<{ description: string | null; amount: number; category_code: string | null }>>()
  for (const l of (lineRows ?? []) as Array<{ invoice_id: string; description: string | null; amount: number; category_code: string | null }>) {
    const arr = lines.get(l.invoice_id) ?? []
    arr.push({ description: l.description ?? null, amount: Number(l.amount), category_code: l.category_code ?? null })
    lines.set(l.invoice_id, arr)
  }
  const receipts = new Map<string, Array<{ voucher_no: string | null; payment_date: string | null; amount: number }>>()
  for (const r of (rcptRows ?? []) as Array<{ invoice_id: string; voucher_no: string | null; payment_date: string | null; amount: number }>) {
    const arr = receipts.get(r.invoice_id) ?? []
    arr.push({ voucher_no: r.voucher_no ?? null, payment_date: r.payment_date ?? null, amount: Number(r.amount) })
    receipts.set(r.invoice_id, arr)
  }
  const settlements = new Map(
    ((svRows ?? []) as Array<{ id: string; voucher_no: string | null; payment_date: string | null; amount: number }>).map((v) => [
      v.id,
      { voucher_no: v.voucher_no, payment_date: v.payment_date, amount: Number(v.amount) },
    ]),
  )
  type CnRow = { id: string; credit_note_no: string | null; invoice_id: string; amount: number; reason: string | null; status: string; category_code: string | null; created_at: string | null }
  const cnList = (cnRows ?? []) as CnRow[]
  const creditNotesByInvoice = new Map<string, HubCreditNoteLine[]>()
  for (const cn of cnList) {
    const arr = creditNotesByInvoice.get(cn.invoice_id) ?? []
    arr.push({ id: cn.id, no: cn.credit_note_no ?? null, amount: Number(cn.amount), status: cn.status, reason: cn.reason ?? null })
    creditNotesByInvoice.set(cn.invoice_id, arr)
  }
  const ctx: InvoiceContext = {
    companies: companyMap,
    departments: departmentMap,
    accounts: accountName,
    extraModes,
    lines,
    receipts,
    settlements,
    creditNotes: creditNotesByInvoice,
  }
  const hubInvoices = monthRows.map((i) => toHubInvoice(i, ctx))
  const otherOpen = otherRows.map((i) => toHubInvoice(i, ctx, true))

  // ── Credit notes: the month's invoices' (another month's belong to its own month) ──
  const byId = new Map(hubInvoices.map((i) => [i.id, i]))
  const creditNotes: HubCreditNote[] = cnList
    .filter((cn) => byId.has(cn.invoice_id))
    .map((cn) => {
      const inv = byId.get(cn.invoice_id)!
      return {
        id: cn.id,
        no: cn.credit_note_no ?? null,
        invoiceId: inv.id,
        invoiceNo: inv.no,
        party: inv.party.name,
        amount: Number(cn.amount),
        reason: cn.reason ?? '',
        status: cn.status ?? 'draft',
        category: cn.category_code ? `${cn.category_code} · ${accountName.get(cn.category_code) ?? ''}`.trim() : null,
        createdAt: cn.created_at ?? null,
      }
    })

  // ── Non-billable: the month's Venture Pool movements that bill nobody ──
  const nonBillable: HubMovement[] = (
    (movements ?? []) as Array<{ id: string; created_at: string; transaction_type: string; amount: number; description: string | null; reference_table: string | null }>
  ).map((t) => ({
    id: t.id,
    at: t.created_at,
    type: t.transaction_type,
    amount: Number(t.amount),
    description: t.description ?? '—',
    source: sourceOf(t.reference_table),
    out: isOut(t.transaction_type),
  }))

  // ── The payroll basis: what each department's payroll costs and what its invoices bill ──
  const run = payrollRun as {
    marketing_opex_total: number | null
    hr_opex_total: number | null
    finance_opex_total: number | null
    director_office_total: number | null
    it_opex_total: number | null
    revenue_opex_total: number | null
    director_salary_total: number | null
    approved_at: string | null
  } | null
  const payrollSubmitted = !!run?.approved_at
  const fromRun = (n: number | null | undefined) => (payrollSubmitted ? Number(n ?? 0) : 0)
  const submission = directorSubmission as {
    total_gross: number | null
    director_count: number | null
    by_company: unknown
    submitted_at: string | null
  } | null
  const directorSubmitted = !!submission
  const directorFromPayroll = directorSubmitted ? directorBillingTarget(submission) : payrollSubmitted ? Number(run?.director_salary_total ?? 0) : 0
  const basisLines = payrollBillingLines({
    fromPayroll: {
      hr: fromRun(run?.hr_opex_total),
      finance: fromRun(run?.finance_opex_total),
      director_office: fromRun(run?.director_office_total),
      it: fromRun(run?.it_opex_total),
      revenue: fromRun(run?.revenue_opex_total),
      director: directorFromPayroll,
      marketing: fromRun(run?.marketing_opex_total),
    },
    invoices: monthRows.map((i) => ({ id: i.id, status: i.status, total_amount: i.total_amount, billing_mode: i.billing_mode })),
    lines: ((lineRows ?? []) as Array<{ invoice_id: string; amount: number; segment?: string | null }>).map((l) => ({ invoice_id: l.invoice_id, amount: l.amount, segment: l.segment ?? null })),
  })
  const marketingLines = marketing.lines.length
  const directorPending = !directorSubmitted && directorFromPayroll <= 0
  type ByCompany = { company_id: string; company_name: string; company_short_code: string; basic?: number | null; kpi?: number | null; allowance?: number | null; epf_er?: number | null; socso_er?: number | null; eis_er?: number | null; total_ctc: number }
  const orNull = (v: number | null | undefined) => (v == null ? null : Number(v))
  const allocation = new Map<string, PayrollBasisModel['allocation'][number]>()
  for (const r of (allocRows ?? []) as Array<{ department_name: string; company_id: string | null; company_short_code: string; company_name: string; amount: number; salary_amount: number; allowance_amount: number; epf_amount: number; socso_amount: number; eis_amount: number }>) {
    const dept = allocation.get(r.department_name) ?? { department: r.department_name, rows: [], billable: 0, own: null }
    const parts = { amount: Number(r.amount), salary: Number(r.salary_amount), allowance: Number(r.allowance_amount), epf: Number(r.epf_amount), socso: Number(r.socso_amount), eis: Number(r.eis_amount) }
    if (r.company_id === null) dept.own = parts
    else {
      dept.rows.push({ code: r.company_short_code, name: r.company_name, ...parts })
      dept.billable = r2(dept.billable + parts.amount)
    }
    allocation.set(r.department_name, dept)
  }
  const basis: PayrollBasisModel = {
    status: payrollSubmitted && directorSubmitted ? 'Submitted' : payrollSubmitted || directorSubmitted ? 'Partly' : 'Pending',
    note: [
      `HR ${payrollSubmitted && run?.approved_at ? officeTime(run.approved_at).format('D MMM') : 'pending'}`,
      `Director salary ${directorSubmitted && submission?.submitted_at ? officeTime(submission.submitted_at).format('D MMM') : 'pending'}`,
      `${marketingLines} Marketing line${marketingLines === 1 ? '' : 's'}`,
    ].join(' · '),
    summary: basisLines.length > 0 ? payrollBasisSummary(basisLines) : 'Nothing from payroll yet',
    lines: [
      ...basisLines
        .filter((l) => !(directorPending && l.key === 'director'))
        .map((l) => ({ key: l.key, label: l.label, value: `${formatMoneyBare(l.billed)} / ${formatMoneyBare(l.required)}` })),
      ...(directorPending ? [{ key: 'director-pending', label: 'Director salary', value: 'pending' }] : []),
    ],
    director: directorSubmitted
      ? {
          submittedAt: submission?.submitted_at ?? null,
          count: Number(submission?.director_count ?? 0),
          gross: Number(submission?.total_gross ?? 0),
          billed: directorBillingTarget(submission),
          rows: ((Array.isArray(submission?.by_company) ? submission!.by_company : []) as ByCompany[]).map((r) => ({
            code: r.company_short_code,
            name: r.company_name,
            basic: orNull(r.basic),
            kpi: orNull(r.kpi),
            allowance: orNull(r.allowance),
            epfEr: orNull(r.epf_er),
            socsoEr: orNull(r.socso_er),
            eisEr: orNull(r.eis_er),
            total: Number(r.total_ctc),
          })),
        }
      : null,
    allocation: [...allocation.values()],
  }

  return {
    period,
    invoices: hubInvoices,
    otherOpen,
    creditNotes,
    marketing,
    nonBillable,
    banks: ((banks ?? []) as Array<{ id: string; bank_name: string; account_number: string | null }>).map((b) => ({
      id: b.id,
      label: b.account_number ? `${b.bank_name} — ${b.account_number}` : b.bank_name,
    })),
    basis,
    department: await departmentRead,
    companies: companyRows.filter((c) => c.is_active !== false).map((c) => ({ id: c.id, name: c.name, short_code: c.short_code ?? '' })),
    departments: departmentRows.filter((d) => !d.is_internal).map((d) => ({ id: d.id, name: d.name })),
    categories: accountRows.map((a) => ({ code: a.code, label: a.name, type: a.type as AccountType, parent_code: a.parent_code ?? null })),
    extraModes,
  }
}
