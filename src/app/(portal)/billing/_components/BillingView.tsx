// Phase 7 Step 11 + 2026-05-15 tab reorder: extracted so both the /billing
// redirect and the /statements page (Invoices landing after the reorder) can
// share one implementation. All internal component paths are preserved.

import Link from 'next/link'
import dayjs from 'dayjs'
import { officeDayStart, officeTime } from '@/lib/office-time'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { directorBillingTarget } from '@/lib/billing'
import { invoiceSummary, payrollBasisSummary, payrollBillingLines } from '@/lib/billing-sheet'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import type { AccountType } from '@/lib/coa'
import PeriodSelector from './PeriodSelector'
import GenerateInvoicesButton from './GenerateInvoicesButton'
import MarketingProjectList from './MarketingProjectList'
import NonBillableList from './NonBillableList'
import InvoicesList from './InvoicesList'
import CreditNotesList from './CreditNotesList'
import { extraBillingModeOptions, primedRegistryRows } from '@/lib/dept-registry'
import { fetchPaidByInvoice } from '@/lib/debtor-aging-data'
import CreateInvoiceButton from './CreateInvoiceButton'
import CreateMultiLineInvoiceButton from './CreateMultiLineInvoiceButton'
import GenerateConsolidatedInvoicesButton from './GenerateConsolidatedInvoicesButton'
import ReconcilePayrollBillingButton from './ReconcilePayrollBillingButton'
import GenerateOwnShareInvoiceButton from './GenerateOwnShareInvoiceButton'
import LedgerRow from '@/components/LedgerRow'
import DepartmentModeCard from '@/components/department/DepartmentModeCard'
import { loadDepartmentMode } from '@/lib/department-mode-server'
import { startRead } from '@/lib/start-read'
import { fetchAllRowsAsWritten, fetchByKeys } from '@/lib/paginate'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function BillingView({ searchParams }: Props) {
  const user = await requirePermission('billing')
  // Each button asks for the action its Server Action asks (2026-10-08, PR2):
  // invoices and contracts are Billing · Create; a non-billable payment is a
  // voucher, Treasury · Create.
  const canFinanceCreate = canDo(user, 'billing', 'create')
  const canRaiseVoucher = canDo(user, 'treasury', 'create')
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')

  // The month's venture-pool movements, by the office's calendar: a bare date
  // bound is UTC midnight, which put the 1st's first eight hours in last month.
  const periodStart = officeDayStart(period)
  const periodEnd = officeTime(periodStart).endOf('month').toISOString()

  // ── Every read the page needs, in two stages (2026-10-08) ─────────────
  // One after another they were eleven round trips (~690 ms in production),
  // and Finance's mode switch below only began a twelfth once the page had
  // every figure. Now everything that needs nothing is asked at once, and what
  // hangs off the invoices — their lines, receipts, credit notes and batch
  // settlement vouchers — the moment both invoice lists are in, without
  // waiting for the rest. The answers are then put together exactly as before.
  const invoicesRead = startRead(
    supabase
      .from('invoices')
      .select('id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, created_at, settlement_voucher_id')
      .eq('period_month', period)
      .order('billing_mode', { ascending: true }),
  )
  // 跨月合并结算 (2026-08-20): a payer often clears several months' invoices
  // with ONE transfer, but this page is period-scoped — fetch OTHER periods'
  // still-issued invoices too, and InvoicesList reveals them behind a 跨月
  // toggle so they can be ticked into the same receipt. Period totals stay
  // period-only.
  const otherOpenRead = startRead(
    supabase
      .from('invoices')
      .select('id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, created_at')
      .eq('status', 'issued')
      .neq('period_month', period)
      .order('period_month', { ascending: false }),
  )
  const firstReads = startRead(
    Promise.all([
      supabase.rpc('get_submitted_hr_summary', { p_period: period }).maybeSingle(),
      supabase
        .from('service_contracts')
        .select(
          'id, description, amount, status, start_date, end_date, company_id, approved_by'
        )
        .eq('billing_mode', 'marketing_project')
        .order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('short_code'),
      supabase
        .from('venture_pool')
        .select('id, created_at, transaction_type, amount, description, reference_table')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: false }),
      // is_internal=false — the 'Venture Office' pseudo-dept must not appear in
      // the invoice "bill to" department picker (it is not a billable dept).
      supabase.from('departments').select('id, name').eq('is_internal', false).order('name'),
      // Post-mig 238: payment_categories is gone. Pull every active leaf
      // account from chart_of_accounts so the invoice "category" picker can
      // route the credit side anywhere — revenue (5000s), other_income (9000)
      // for recoveries, or balance-sheet codes (e.g. clearing a receivable
      // originally booked when HV paid on someone's behalf).
      // Mig 246 adds parent_code so downstream pickers can hide headers.
      supabase
        .from('chart_of_accounts')
        .select('code, name, type, parent_code')
        .eq('is_active', true)
        // By code — sort_order is unset on most rows, which left the pickers in
        // insertion order (user 2026-09-28: "这个太乱了，应该顺序").
        .order('code'),
      // For the batch-settle modal in InvoicesList.
      supabase
        .from('bank_accounts')
        .select('id, bank_name, account_number, gl_account_code, is_primary')
        .eq('status', 'active')
        .order('is_primary', { ascending: false }),
      // The live payroll_run's per-dept OPEX totals (payrollSubmitted below).
      supabase
        .from('payroll_runs')
        .select(
          'marketing_opex_total, hr_opex_total, finance_opex_total, director_office_total, it_opex_total, revenue_opex_total, director_salary_total, approved_at'
        )
        .eq('period_month', period)
        .neq('status', 'rejected')
        .maybeSingle(),
      // Staff billing allocation, dept × company aggregates (allocByDept below).
      supabase.rpc('get_staff_billing_allocation', { p_period_month: period }),
      // The Director Payroll Submission snapshot (directorSubmitted below).
      supabase
        .from('director_salary_submissions')
        .select('total_gross, total_payroll_gross, total_invoice, total_saving, director_count, by_company, submitted_at')
        .eq('period_month', period)
        .maybeSingle(),
    ]),
  )
  // Finance's mode switch (DepartmentModeCard below), begun with the page's
  // reads rather than once the page is done. It never throws: a failed read
  // is logged and the card draws nothing, as before.
  const departmentModeRead = loadDepartmentMode('finance')

  const [{ data: invoices }, { data: otherOpenRaw }] = await Promise.all([invoicesRead, otherOpenRead])
  const invoiceList = invoices ?? []
  const otherOpenInvoices = otherOpenRaw ?? []
  const invoiceIds = invoiceList.map((i) => i.id)
  const issuedIds = [
    ...invoiceList.filter((i) => i.status === 'issued').map((i) => i.id as string),
    ...otherOpenInvoices.map((i) => i.id as string),
  ]
  const allInvoiceIds = [
    ...invoiceList.map((i) => i.id as string),
    ...otherOpenInvoices.map((i) => i.id as string),
  ]
  const allInvoiceRows = [...(invoices ?? []), ...otherOpenInvoices] as Array<{
    id: string
    settlement_voucher_id?: string | null
  }>
  const settleVoucherIds = [
    ...new Set(allInvoiceRows.map((i) => i.settlement_voucher_id).filter(Boolean) as string[]),
  ]
  // The other months' open invoices ride along in every list below, so the
  // ids are not one month's any more: past ~500 the URL fails outright. 100
  // ids a time (fetchByKeys), and each answer kept as the page always read it.
  // A failed read still leaves its rows out, as before.
  const leftOutOnError = <T,>(read: Promise<T[]>) => read.then((data) => ({ data }), () => ({ data: null }))
  // `created_at DESC` as Postgres sorts it, to the millisecond (NULLS FIRST).
  // Rows the database already ordered stay where they are: the sort is stable.
  const newestFirst = (at: string | null | undefined) => (at ? Date.parse(at) : Infinity)
  const [{ data: lineRows }, paidMap, { data: cnRows }, { data: rcptRows }, { data: svRows }] = await Promise.all([
    // Line items for this period's invoices — the edit modal mirrors the
    // multi-line create form, so drafts need their lines prefilled.
    invoiceIds.length > 0
      ? supabase
          .from('invoice_lines')
          .select('invoice_id, line_no, description, amount, category_code, segment')
          .in('invoice_id', invoiceIds)
          .order('line_no')
      : { data: null },
    // Σ receipts per issued invoice (paidByInvoice below).
    fetchPaidByInvoice(supabase as unknown as Parameters<typeof fetchPaidByInvoice>[0], issuedIds),
    // Credit notes against the listed invoices (cnByInvoice below). The
    // Credit Notes section lists them newest first, so the chunks' answers are
    // put back in that order (a stable sort — one chunk is left exactly as is).
    allInvoiceIds.length
      ? leftOutOnError(
          fetchByKeys(allInvoiceIds, (chunk) =>
            supabase
              .from('credit_notes')
              .select('id, credit_note_no, invoice_id, amount, reason, status, category_code, billing_mode, created_at')
              .in('invoice_id', chunk)
              .order('created_at', { ascending: false }),
          ).then((rows) => rows.sort((a, b) => newestFirst(b.created_at) - newestFirst(a.created_at))),
        )
      : { data: [] as never[] },
    // Direct-linked receipts per invoice (receiptsByInvoice below). Every
    // receipt of one invoice sits in its invoice's chunk, in payment-date
    // order; a chunk that reaches PostgREST's 1000-row cap is read again in
    // pages, `id` breaking the date's ties (fetchAllRowsAsWritten).
    allInvoiceIds.length
      ? leftOutOnError(
          fetchByKeys(allInvoiceIds, async (chunk) => ({
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
    // The batch settlement voucher each paid invoice points at (same).
    settleVoucherIds.length > 0
      ? leftOutOnError(
          fetchByKeys(settleVoucherIds, (chunk) =>
            supabase
              .from('payment_vouchers')
              .select('id, voucher_no, payment_date, amount')
              .in('id', chunk),
          ),
        )
      : { data: null },
  ])
  const [
    { error: hrSummaryError },
    { data: marketingContracts },
    { data: companies },
    { data: nonBillableTxns },
    { data: departments },
    { data: categories },
    { data: banks },
    { data: payrollRun },
    { data: staffAllocRows, error: staffAllocError },
    { data: directorSubmission },
  ] = await firstReads

  const bankList = (banks ?? []).map((b) => ({
    id: b.id as string,
    bank_name: b.bank_name as string,
    account_number: (b.account_number as string | null) ?? null,
  }))

  const linesByInvoice: Record<string, Array<{ description: string | null; amount: number; category_code: string | null }>> = {}
  for (const l of lineRows ?? []) {
    const arr = linesByInvoice[l.invoice_id] ?? []
    arr.push({
      description: l.description ?? null,
      amount: Number(l.amount),
      category_code: l.category_code ?? null,
    })
    linesByInvoice[l.invoice_id] = arr
  }

  // Shape categories as { code, label, type, parent_code } so the downstream
  // CreateInvoiceButton can pass them straight into AccountPicker (mig 246).
  // Keeps the legacy "label" string the rest of the UI already prints.
  const categoryList: Array<{
    code: string
    label: string
    type: AccountType
    parent_code: string | null
  }> = (categories ?? []).map((c) => ({
    code: c.code,
    label: c.name,
    type: c.type as AccountType,
    parent_code: (c as { parent_code: string | null }).parent_code ?? null,
  }))

  if (hrSummaryError) {
    console.error('get_submitted_hr_summary failed:', hrSummaryError.message)
  }

  const marketingContractsActive = (marketingContracts ?? []).filter(
    (c) => c.status === 'active'
  ).length

  // Partial payments: Σ receipts per issued invoice so the list can show
  // part-paid badges and the settle modal collects the REMAINING balance.
  const paidByInvoice: Record<string, number> = {}
  for (const [id, paid] of paidMap) {
    if (paid > 0) paidByInvoice[id] = paid
  }

  // CN v2 (2026-08-19): credit notes against this period's invoices. Approved
  // sums net off the settle balance (cnByInvoice); the full rows power the
  // Credit Notes section below the invoice list. Bounded .in() — one period's
  // invoice ids, same shape as fetchPaidByInvoice above.
  const cnByInvoice: Record<string, number> = {}
  for (const cn of cnRows ?? []) {
    if (cn.status !== 'approved') continue
    cnByInvoice[cn.invoice_id as string] =
      Math.round(((cnByInvoice[cn.invoice_id as string] ?? 0) + Number(cn.amount)) * 100) / 100
  }

  // Detail-modal enrichments (2026-08-29, user: "点了单号显示的资料太少了"):
  // every receipt against every listed invoice — direct-linked credit
  // vouchers plus the batch settlement voucher each paid invoice points at
  // via settlement_voucher_id (batch receipts carry no invoice_id) — and the
  // full credit-note rows per invoice.
  const receiptsByInvoice: Record<
    string,
    Array<{ voucherNo: string | null; date: string | null; amount: number; batch?: boolean }>
  > = {}
  const directVoucherNos = new Set<string>()
  for (const r of rcptRows ?? []) {
    const arr = receiptsByInvoice[r.invoice_id as string] ?? []
    arr.push({
      voucherNo: (r.voucher_no as string | null) ?? null,
      date: (r.payment_date as string | null) ?? null,
      amount: Number(r.amount),
    })
    receiptsByInvoice[r.invoice_id as string] = arr
    if (r.voucher_no) directVoucherNos.add(`${r.invoice_id}|${r.voucher_no}`)
  }
  if (settleVoucherIds.length > 0) {
    const svById = new Map(
      ((svRows ?? []) as Array<{ id: string; voucher_no: string | null; payment_date: string | null; amount: number }>).map(
        (v) => [v.id, v],
      ),
    )
    for (const inv of allInvoiceRows) {
      if (!inv.settlement_voucher_id) continue
      const v = svById.get(inv.settlement_voucher_id)
      if (!v) continue
      if (v.voucher_no && directVoucherNos.has(`${inv.id}|${v.voucher_no}`)) continue
      const arr = receiptsByInvoice[inv.id] ?? []
      arr.push({
        voucherNo: v.voucher_no,
        date: v.payment_date,
        amount: Number(v.amount),
        batch: true,
      })
      receiptsByInvoice[inv.id] = arr
    }
  }
  const cnDetailByInvoice: Record<
    string,
    Array<{ cnNo: string | null; amount: number; status: string; reason: string | null }>
  > = {}
  for (const cn of cnRows ?? []) {
    const arr = cnDetailByInvoice[cn.invoice_id as string] ?? []
    arr.push({
      cnNo: (cn.credit_note_no as string | null) ?? null,
      amount: Number(cn.amount),
      status: cn.status as string,
      reason: (cn.reason as string | null) ?? null,
    })
    cnDetailByInvoice[cn.invoice_id as string] = arr
  }

  // Pull the per-dept OPEX totals from the live payroll_run. Since mig 278
  // HR's Submit lands the run directly in status='approved' (approved_at set
  // at submit) — no Principal gate. Rejected rows are reopen history, skip.
  const payrollSubmitted = !!payrollRun?.approved_at
  const marketingFromPayroll = payrollSubmitted ? Number(payrollRun?.marketing_opex_total ?? 0) : 0
  const hrFromPayroll = payrollSubmitted ? Number(payrollRun?.hr_opex_total ?? 0) : 0
  const financeFromPayroll = payrollSubmitted ? Number(payrollRun?.finance_opex_total ?? 0) : 0
  const directorOfficeFromPayroll = payrollSubmitted ? Number(payrollRun?.director_office_total ?? 0) : 0
  // IT rides the dept-registry billing path (it_attribution) rather than a
  // legacy DeptCostCard; it still belongs in the pre-generation hero total.
  const itFromPayroll = payrollSubmitted ? Number(payrollRun?.it_opex_total ?? 0) : 0
  const revenueFromPayroll = payrollSubmitted ? Number(payrollRun?.revenue_opex_total ?? 0) : 0

  // Staff billing allocation (2026-07-03): HR splits each employee's employer
  // cost across subsidiaries by % (/hr-costing/allocation). The RPC returns
  // dept × company aggregates only — no names, no individual salaries — so
  // Finance can read it. Amounts reconcile against the dept OPEX cards: the
  // gap between a dept's OPEX total and its allocated sum is HV's own share.
  if (staffAllocError) {
    console.error('get_staff_billing_allocation failed:', staffAllocError.message)
  }
  const allocByDept = new Map<
    string,
    Array<{
      company_id: string | null // NULL = the HV own-share row
      company_short_code: string
      company_name: string
      amount: number
      salary: number
      allowance: number
      epf: number
      socso: number
      eis: number
    }>
  >()
  for (const r of staffAllocRows ?? []) {
    const list = allocByDept.get(r.department_name) ?? []
    list.push({
      company_id: r.company_id,
      company_short_code: r.company_short_code,
      company_name: r.company_name,
      amount: Number(r.amount),
      salary: Number(r.salary_amount),
      allowance: Number(r.allowance_amount),
      epf: Number(r.epf_amount),
      socso: Number(r.socso_amount),
      eis: Number(r.eis_amount),
    })
    allocByDept.set(r.department_name, list)
  }

  // Director salary is decoupled from the staff run (mig 278/279) — Finance
  // reads the Director Payroll Submission snapshot. Legacy runs (pre-278)
  // still carry director_salary_total, so fall back to that.
  const directorSubmitted = !!directorSubmission
  // What Finance bills for director salary is the submission's per-company
  // CTC, not its payroll gross (2026-10-06: the card read "over RM 19,396.25"
  // against five drafts that matched the submission to the sen).
  const directorFromPayroll = directorSubmitted
    ? directorBillingTarget(directorSubmission)
    : payrollSubmitted
      ? Number(payrollRun?.director_salary_total ?? 0)
      : 0
  interface DirectorByCompanyRow {
    company_id: string
    company_name: string
    company_short_code: string
    // Component breakdown (2026-07-13) — legacy snapshots only carry total_ctc.
    basic?: number | null
    kpi?: number | null
    allowance?: number | null
    epf_er?: number | null
    socso_er?: number | null
    eis_er?: number | null
    total_ctc: number
  }
  const directorByCompany: DirectorByCompanyRow[] = directorSubmitted
    ? (((directorSubmission?.by_company ?? []) as unknown) as DirectorByCompanyRow[]).map(r => ({
        ...r,
        basic: r.basic == null ? null : Number(r.basic),
        kpi: r.kpi == null ? null : Number(r.kpi),
        allowance: r.allowance == null ? null : Number(r.allowance),
        epf_er: r.epf_er == null ? null : Number(r.epf_er),
        socso_er: r.socso_er == null ? null : Number(r.socso_er),
        eis_er: r.eis_er == null ? null : Number(r.eis_er),
        total_ctc: Number(r.total_ctc),
      }))
    : []
  const directorSumOrDash = (pick: (r: DirectorByCompanyRow) => number | null | undefined) => {
    const vals = directorByCompany.map(pick).filter((v): v is number => v != null)
    return vals.length === 0 ? '—' : formatMoney(vals.reduce((s, v) => s + v, 0))
  }

  // The sheet's cards and the folded payroll basis (lib/billing-sheet.ts).
  const summary = invoiceSummary(invoiceList, paidByInvoice, cnByInvoice)
  const basisLines = payrollBillingLines({
    fromPayroll: {
      hr: hrFromPayroll,
      finance: financeFromPayroll,
      director_office: directorOfficeFromPayroll,
      it: itFromPayroll,
      revenue: revenueFromPayroll,
      director: directorFromPayroll,
      marketing: marketingFromPayroll,
    },
    invoices: invoiceList,
    lines: (lineRows ?? []).map((l) => ({
      invoice_id: l.invoice_id,
      amount: l.amount,
      segment: (l as { segment?: string | null }).segment ?? null,
    })),
  })
  const payrollBasis = payrollSubmitted && directorSubmitted ? 'Submitted' : payrollSubmitted || directorSubmitted ? 'Partly' : 'Pending'
  const payrollBasisNote = [
    `HR ${payrollSubmitted && payrollRun?.approved_at ? officeTime(payrollRun.approved_at).format('D MMM') : 'pending'}`,
    `Director salary ${directorSubmitted && directorSubmission?.submitted_at ? officeTime(directorSubmission.submitted_at).format('D MMM') : 'pending'}`,
    `${marketingContractsActive} marketing contract${marketingContractsActive === 1 ? '' : 's'}`,
  ].join(' · ')
  const periodMonth = dayjs(period).format('YYYY-MM')

  const companyList = companies ?? []
  const companyMap = new Map(
    companyList.map((c) => [c.id, { name: c.name as string, code: c.short_code as string }])
  )
  // Dynamic full departments (2026-08-24): their billing modes join every
  // invoice/CN modal's pool dropdown.
  const extraModes = extraBillingModeOptions(primedRegistryRows())
  // Inter-billing: invoices may target a dept_pool (billable_to_type='dept_pool')
  // instead of a subsidiary, so InvoicesList needs to resolve dept name from
  // billable_to_department_id rather than falling through to '—'.
  const departmentMap = new Map<string, string>(
    (departments ?? []).map((d) => [d.id as string, d.name as string])
  )

  // CN v2: display rows for the Credit Notes section — party + invoice no +
  // category label resolved server-side so the client list stays dumb.
  const invoiceById = new Map(invoiceList.map((i) => [i.id as string, i]))
  const coaNameByCode = new Map((categories ?? []).map((c) => [c.code as string, c.name as string]))
  const categoryByInvoice: Record<string, string> = {}
  for (const inv of invoiceList) {
    const names = [
      ...new Set(
        (linesByInvoice[inv.id] ?? [])
          .map((l) => (l.category_code ? (coaNameByCode.get(l.category_code) ?? l.category_code) : null))
          .filter((n): n is string => !!n),
      ),
    ]
    if (names.length > 0) categoryByInvoice[inv.id] = names.join(' + ')
    else if (inv.category_code) categoryByInvoice[inv.id] = coaNameByCode.get(inv.category_code) ?? inv.category_code
  }
  const showBasis = basisLines.length > 0 || (directorSubmitted && directorByCompany.length > 0) || allocByDept.size > 0
  // Section shows the PERIOD's CNs only — other-period invoices are fetched
  // just for the 跨月 settle toggle, their CNs belong to their own month view.
  const creditNoteRows = (cnRows ?? []).filter((cn) => invoiceById.has(cn.invoice_id as string)).map((cn) => {
    const inv = invoiceById.get(cn.invoice_id as string)
    let party = inv?.billable_to_freetext_name ?? '—'
    if (inv?.company_id) party = companyMap.get(inv.company_id)?.name ?? '—'
    else if (inv?.billable_to_type === 'dept_pool' && inv.billable_to_department_id)
      party = departmentMap.get(inv.billable_to_department_id) ?? '—'
    return {
      id: cn.id as string,
      credit_note_no: (cn.credit_note_no as string | null) ?? null,
      invoice_no: (inv?.invoice_no as string | null) ?? null,
      party,
      amount: Number(cn.amount),
      reason: (cn.reason as string) ?? '',
      status: (cn.status as string) ?? 'draft',
      category_label: cn.category_code
        ? `${cn.category_code} · ${coaNameByCode.get(cn.category_code as string) ?? ''}`.trim()
        : null,
      created_at: (cn.created_at as string) ?? null,
    }
  })

  return (
    <div>
      <div className="page-head sticky top-0 z-20 bg-paper pt-2">
        <div className="shrink-0">
          <div className="page-eyebrow">
            <em>I.</em> BILLING · SERVICE INVOICES
          </div>
          <h1 className="page-title">Service Billing</h1>
        </div>
        {/* Six controls do not fit beside the title on the sheet (user
            2026-10-07: "超过格子了"): they wrap onto a second line rather than
            run past the sheet's edge. */}
        <div className="flex items-center gap-3">
          <PeriodSelector currentPeriod={period} />
        </div>
      </div>

      {/* Every control on show, in three captioned groups (2026-10-07; the
          user: all of them visible, but the month, the creating and the
          exporting no longer in one line). */}
      <div className="act-band">
        {canFinanceCreate ? (
          <>
            <div className="act-group">
              <div className="cap">From payroll</div>
              <div className="btns">
                <GenerateConsolidatedInvoicesButton currentPeriod={period} categories={categoryList} />
                <ReconcilePayrollBillingButton currentPeriod={period} />
                <GenerateOwnShareInvoiceButton currentPeriod={period} categories={categoryList} />
              </div>
            </div>
            <div className="act-group">
              <div className="cap">Create</div>
              <div className="btns">
                <CreateInvoiceButton
                  companies={companyList}
                  currentPeriod={period}
                  departments={departments ?? []}
                  categories={categoryList}
                  extraModes={extraModes}
                />
                <CreateMultiLineInvoiceButton
                  companies={companyList}
                  currentPeriod={period}
                  departments={departments ?? []}
                  categories={categoryList}
                  extraModes={extraModes}
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="act-group">
          <div className="cap">Export</div>
          <div className="btns">
            <Link href={`/statements/export?format=xlsx&period=${periodMonth}`} className="btn-quiet-sheet">
              Excel
            </Link>
            <Link href={`/statements/export?format=pdf&period=${periodMonth}`} className="btn-quiet-sheet" title="Export the invoice list as a single-page table">
              PDF · list
            </Link>
            <Link
              href={`/billing/invoice-doc?period=${periodMonth}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-quiet-sheet"
              title="Export each invoice as its own document page (batch PDF)"
            >
              PDF · per invoice
            </Link>
          </div>
        </div>
      </div>

      {/* Cost center or centralized — Finance's own switch (2026-09-30). */}      {/* Cost center or centralized — Finance's own switch (2026-09-30). */}
      <DepartmentModeCard segmentKey="finance" department={departmentModeRead} />

      <StatCards label="Service Billing">
        <StatCard
          tone="primary"
          label={`Invoiced · ${dayjs(period).format('MMMM')}`}
          value={formatMoney(summary.invoiced)}
          icon="receipt"
          note={`${summary.invoicedCount} ${summary.invoicedCount === 1 ? 'invoice' : 'invoices'}${
            summary.voidedCount > 0 ? ` · ${summary.voidedCount} voided left out` : ''
          }`}
        />
        <StatCard
          tone={summary.outstanding > 0.005 ? 'alert' : 'default'}
          label="Outstanding"
          value={formatMoney(summary.outstanding)}
          icon="clock"
          note={`${summary.issuedCount} issued${
            summary.partPaidCount > 0 ? ` · ${summary.partPaidCount} part-paid` : summary.issuedCount > 0 ? ' · nothing part-paid' : ''
          }`}
        />
        <StatCard label="Received" value={formatMoney(summary.received)} icon="bank" note={`${summary.paidCount} paid`} />
        <StatCard label="Payroll basis" value={payrollBasis} icon="people" note={payrollBasisNote} />
      </StatCards>

      {/* The payroll basis — what each department's payroll costs and what
          its invoices bill (the consolidated ones' lines counted by
          department), with the Director Salary Submission and the Staff
          Billing Allocation inside, folded (2026-10-07). */}
      {showBasis ? (
        <details className="fin-fold">
          <summary>
            Payroll basis
            <small>{basisLines.length > 0 ? `BILLED / FROM PAYROLL — ${payrollBasisSummary(basisLines)}` : 'nothing from payroll yet'}</small>
          </summary>
          <div className="fin-fold-inner">
      {/* Director Payroll Submission — per-subsidiary contribution (mig 279).      {/* Director Payroll Submission — per-subsidiary contribution (mig 279).
          This is what Finance bills each subsidiary for director salary;
          Create Invoice → Director attribution auto-fills from the same data. */}
      {directorSubmitted && directorByCompany.length > 0 && (
        <section className="mb-8">
          <div className="sect-head">
            <h2>Director Salary Submission</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {directorByCompany.length} SUBSIDIAR{directorByCompany.length === 1 ? 'Y' : 'IES'}
            </span>
          </div>
          <div className="font-mono text-xs text-muted mb-4">
            Submitted {directorSubmission?.submitted_at ? officeTime(directorSubmission.submitted_at).format('D MMM YYYY HH:mm') : ''} ·{' '}
            {Number(directorSubmission?.director_count ?? 0)} director{Number(directorSubmission?.director_count ?? 0) === 1 ? '' : 's'} ·{' '}
            payroll gross {formatMoney(Number(directorSubmission?.total_gross ?? 0))} · billed as CTC{' '}
            {formatMoney(directorBillingTarget(directorSubmission))}
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Subsidiary</th>
                  <th className="right m-hide">Basic</th>
                  <th className="right m-hide">KPI</th>
                  <th className="right m-hide">Allowance</th>
                  <th className="right m-hide">EPF ER</th>
                  <th className="right m-hide">SOCSO ER</th>
                  <th className="right m-hide">EIS ER</th>
                  <th className="right">Total</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {directorByCompany.map(r => (
                  <LedgerRow key={r.company_id}>
                    <td>
                      <div className="font-serif text-[15px] text-ink">{r.company_short_code}</div>
                      <div className="font-mono text-[11px] text-graphite mt-0.5">{r.company_name}</div>
                    </td>
                    <td className="num m-hide" data-label="Basic">{r.basic == null ? '—' : formatMoney(r.basic)}</td>
                    <td className="num m-hide" data-label="KPI">{r.kpi == null ? '—' : formatMoney(r.kpi)}</td>
                    <td className="num m-hide" data-label="Allowance">{r.allowance == null ? '—' : formatMoney(r.allowance)}</td>
                    <td className="num m-hide" data-label="EPF ER">{r.epf_er == null ? '—' : formatMoney(r.epf_er)}</td>
                    <td className="num m-hide" data-label="SOCSO ER">{r.socso_er == null ? '—' : formatMoney(r.socso_er)}</td>
                    <td className="num m-hide" data-label="EIS ER">{r.eis_er == null ? '—' : formatMoney(r.eis_er)}</td>
                    <td className="num font-semibold">{formatMoney(r.total_ctc)}</td>
                  </LedgerRow>
                ))}
                <tr>
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num font-semibold m-hide">{directorSumOrDash(r => r.basic)}</td>
                  <td className="num font-semibold m-hide">{directorSumOrDash(r => r.kpi)}</td>
                  <td className="num font-semibold m-hide">{directorSumOrDash(r => r.allowance)}</td>
                  <td className="num font-semibold m-hide">{directorSumOrDash(r => r.epf_er)}</td>
                  <td className="num font-semibold m-hide">{directorSumOrDash(r => r.socso_er)}</td>
                  <td className="num font-semibold m-hide">{directorSumOrDash(r => r.eis_er)}</td>
                  <td className="num font-semibold">
                    {formatMoney(directorByCompany.reduce((s, r) => s + r.total_ctc, 0))}
                  </td>
                  <td className="lt-toggle" />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Staff Billing Allocation — per-employee % splits entered by HR
          (/hr-costing/allocation), aggregated per dept × subsidiary. These are
          the amounts to bill each company for shared-services staff; the
          unallocated remainder stays with HV and is not billed. */}
      {allocByDept.size > 0 && (
        <section className="mb-4">
          <div className="sect-head">
            <h2>Staff Billing Allocation</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {allocByDept.size} DEPARTMENT{allocByDept.size === 1 ? '' : 'S'}
            </span>
          </div>
          <div className="font-mono text-xs text-muted mb-4">
            Per-staff % splits from HR · employer cost basis (gross + EPF/SOCSO/EIS ER) ·
            components sum to the total · unallocated share stays with HV
          </div>
          <div className="space-y-8">
            {[...allocByDept.entries()].map(([deptName, rows]) => {
              const companyRows = rows.filter((r) => r.company_id !== null)
              const hvRow = rows.find((r) => r.company_id === null)
              const sum = (pick: (r: (typeof rows)[number]) => number) =>
                Math.round(companyRows.reduce((s, r) => s + pick(r), 0) * 100) / 100
              return (
                <div key={deptName} className="overflow-x-auto">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>{deptName}</th>
                        <th className="right m-hide">Salary</th>
                        <th className="right m-hide">Allowance</th>
                        <th className="right m-hide">EPF</th>
                        <th className="right m-hide">SOCSO</th>
                        <th className="right m-hide">EIS</th>
                        <th className="right">Total</th>
                        <th className="lt-toggle" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {companyRows.map((r) => (
                        <LedgerRow key={r.company_id}>
                          <td>
                            <div className="font-serif text-[15px] text-ink">
                              {r.company_short_code}
                            </div>
                            <div className="font-mono text-[11px] text-graphite mt-0.5">
                              {r.company_name}
                            </div>
                          </td>
                          <td className="num m-hide" data-label="Salary">{formatMoney(r.salary)}</td>
                          <td className="num m-hide" data-label="Allowance">{formatMoney(r.allowance)}</td>
                          <td className="num m-hide" data-label="EPF">{formatMoney(r.epf)}</td>
                          <td className="num m-hide" data-label="SOCSO">{formatMoney(r.socso)}</td>
                          <td className="num m-hide" data-label="EIS">{formatMoney(r.eis)}</td>
                          <td className="num font-semibold">{formatMoney(r.amount)}</td>
                        </LedgerRow>
                      ))}
                      <tr>
                        <td className="font-serif italic text-accent">Billable total</td>
                        <td className="num m-hide">{formatMoney(sum((r) => r.salary))}</td>
                        <td className="num m-hide">{formatMoney(sum((r) => r.allowance))}</td>
                        <td className="num m-hide">{formatMoney(sum((r) => r.epf))}</td>
                        <td className="num m-hide">{formatMoney(sum((r) => r.socso))}</td>
                        <td className="num m-hide">{formatMoney(sum((r) => r.eis))}</td>
                        <td className="num font-semibold">{formatMoney(sum((r) => r.amount))}</td>
                        <td className="lt-toggle" />
                      </tr>
                      {hvRow && (
                        <LedgerRow>
                          <td>
                            <div className="font-serif italic text-graphite">
                              HV — HOUZS Venture
                            </div>
                            <div className="font-mono text-[11px] text-muted mt-0.5">
                              own share · not billed
                            </div>
                          </td>
                          <td className="num text-graphite m-hide" data-label="Salary">{formatMoney(hvRow.salary)}</td>
                          <td className="num text-graphite m-hide" data-label="Allowance">{formatMoney(hvRow.allowance)}</td>
                          <td className="num text-graphite m-hide" data-label="EPF">{formatMoney(hvRow.epf)}</td>
                          <td className="num text-graphite m-hide" data-label="SOCSO">{formatMoney(hvRow.socso)}</td>
                          <td className="num text-graphite m-hide" data-label="EIS">{formatMoney(hvRow.eis)}</td>
                          <td className="num text-graphite">{formatMoney(hvRow.amount)}</td>
                        </LedgerRow>
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </section>
      )}

          </div>
        </details>
      ) : null}

      <InvoicesList invoices={invoiceList} extraOpenInvoices={otherOpenInvoices} companyMap={companyMap} departmentMap={departmentMap} period={period} categories={categoryList} bankAccounts={bankList} invoiceLines={linesByInvoice} paidByInvoice={paidByInvoice} cnByInvoice={cnByInvoice} extraModes={extraModes} receiptsByInvoice={receiptsByInvoice} cnDetailByInvoice={cnDetailByInvoice} categoryByInvoice={categoryByInvoice} canSetDefault={canFinanceCreate} />

      {creditNoteRows.length > 0 ? <CreditNotesList rows={creditNoteRows} /> : null}

      <MarketingProjectList
        contracts={(marketingContracts ?? [])
          .filter((c): c is typeof c & { company_id: string } => c.company_id !== null)}
        companyMap={companyMap}
        canCreate={canFinanceCreate}
        headerAction={
          canFinanceCreate ? (
            <GenerateInvoicesButton
              currentPeriod={period}
              modes={['marketing_project']}
              label="Generate Marketing invoices"
            />
          ) : null
        }
      />
      <NonBillableList
        transactions={(nonBillableTxns ?? []).map((t) => ({
          id: t.id,
          created_at: t.created_at,
          transaction_type: t.transaction_type,
          amount: Number(t.amount),
          description: t.description,
          reference_table: t.reference_table,
        }))}
        period={period}
        canAdd={canRaiseVoucher}
      />
    </div>
  )
}

// Per-dept OPEX card. Shows three stacked states based on payroll approval +
// invoice state:
//   1. Payroll not approved yet → muted zero + "awaiting HR costing"
//   2. Payroll approved, no invoice → required amount + "from payroll — no invoice"
//      (Finance uses this number when creating invoices)
//   3. Payroll approved, invoices exist → invoice total + invoice count, plus a
//      tiny gap indicator if invoiced ≠ required
// Each card hosts its own "+ Create Invoice" button (compact link style) for
// Finance, pre-filled with this dept's billing_mode.
