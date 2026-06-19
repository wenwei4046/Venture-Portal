// Phase 7 Step 11 + 2026-05-15 tab reorder: extracted so both the /billing
// redirect and the /statements page (Invoices landing after the reorder) can
// share one implementation. All internal component paths are preserved.

import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import type { CreateInvoiceMode } from '../actions'
import type { AccountType } from '@/lib/coa'
import PeriodSelector from './PeriodSelector'
import GenerateInvoicesButton from './GenerateInvoicesButton'
import MarketingProjectList from './MarketingProjectList'
import NonBillableList from './NonBillableList'
import InvoicesList from './InvoicesList'
import CreateInvoiceButton from './CreateInvoiceButton'
import CreateMultiLineInvoiceButton from './CreateMultiLineInvoiceButton'

interface Props {
  searchParams: Promise<{ period?: string }>
}

interface DeptSummary {
  department_id: string
  staff_count: number
  total_basic: number
  total_statutory: number
  total_allowance: number
  total_ctc: number
}

export default async function BillingView({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')

  const periodStart = dayjs(period).startOf('month').toISOString()
  const periodEnd = dayjs(period).endOf('month').toISOString()

  const [
    { data: hrSummary, error: hrSummaryError },
    { data: marketingContracts },
    { data: invoices },
    { data: companies },
    { data: nonBillableTxns },
    { data: departments },
    { data: categories },
    { data: banks },
  ] = await Promise.all([
    supabase.rpc('get_submitted_hr_summary', { p_period: period }).maybeSingle(),
    supabase
      .from('service_contracts')
      .select(
        'id, description, amount, status, start_date, end_date, company_id, approved_by'
      )
      .eq('billing_mode', 'marketing_project')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, description, invoice_date, due_date, reference_no, category_code, created_at')
      .eq('period_month', period)
      .order('billing_mode', { ascending: true }),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('short_code'),
    supabase
      .from('venture_pool')
      .select('id, created_at, transaction_type, amount, description, reference_table')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .order('created_at', { ascending: false }),
    supabase.from('departments').select('id, name').order('name'),
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
      .order('sort_order'),
    // For the batch-settle modal in InvoicesList.
    supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number, gl_account_code, is_primary')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])

  const bankList = (banks ?? []).map((b) => ({
    id: b.id as string,
    bank_name: b.bank_name as string,
    account_number: (b.account_number as string | null) ?? null,
  }))

  // Line items for this period's invoices — the edit modal mirrors the
  // multi-line create form, so drafts need their lines prefilled.
  const invoiceIds = (invoices ?? []).map((i) => i.id)
  const { data: lineRows } =
    invoiceIds.length > 0
      ? await supabase
          .from('invoice_lines')
          .select('invoice_id, line_no, description, amount, category_code')
          .in('invoice_id', invoiceIds)
          .order('line_no')
      : { data: null }
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

  const submitted = !!hrSummary
  const deptSummaries = submitted
    ? (((hrSummary?.dept_summaries ?? {}) as unknown) as Record<string, DeptSummary>)
    : null

  const hrTotalCtc = deptSummaries
    ? Object.values(deptSummaries).reduce(
        (acc, d) => acc + Number(d?.total_ctc ?? 0),
        0
      )
    : 0

  const marketingContractsActive = (marketingContracts ?? []).filter(
    (c) => c.status === 'active'
  ).length

  const invoiceList = invoices ?? []
  const invoiceTotal = invoiceList.reduce((acc, i) => acc + Number(i.total_amount), 0)

  // Per-mode invoice sums (shown in the cost cards).
  const marketingTotal = invoiceList
    .filter((i) => i.billing_mode === 'marketing_project')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const directorOfficeTotal = invoiceList
    .filter((i) => i.billing_mode === 'director_office_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const directorAttributionTotal = invoiceList
    .filter((i) => i.billing_mode === 'director_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const hrAttributionTotal = invoiceList
    .filter((i) => i.billing_mode === 'hr_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const financeAttributionTotal = invoiceList
    .filter((i) => i.billing_mode === 'finance_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)

  const hrInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'hr_attribution').length
  const financeInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'finance_attribution').length
  const directorOfficeInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'director_office_attribution').length
  const directorAttributionInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'director_attribution').length
  const marketingInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'marketing_project').length

  // Pull the per-dept OPEX totals from the live payroll_run. Since mig 278
  // HR's Submit lands the run directly in status='approved' (approved_at set
  // at submit) — no Principal gate. Rejected rows are reopen history, skip.
  const { data: payrollRun } = await supabase
    .from('payroll_runs')
    .select(
      'marketing_opex_total, hr_opex_total, finance_opex_total, director_office_total, director_salary_total, approved_at'
    )
    .eq('period_month', period)
    .neq('status', 'rejected')
    .maybeSingle()
  const payrollSubmitted = !!payrollRun?.approved_at
  const marketingFromPayroll = payrollSubmitted ? Number(payrollRun?.marketing_opex_total ?? 0) : 0
  const hrFromPayroll = payrollSubmitted ? Number(payrollRun?.hr_opex_total ?? 0) : 0
  const financeFromPayroll = payrollSubmitted ? Number(payrollRun?.finance_opex_total ?? 0) : 0
  const directorOfficeFromPayroll = payrollSubmitted ? Number(payrollRun?.director_office_total ?? 0) : 0

  // Director salary is decoupled from the staff run (mig 278/279) — Finance
  // reads the Director Payroll Submission snapshot. Legacy runs (pre-278)
  // still carry director_salary_total, so fall back to that.
  const { data: directorSubmission } = await supabase
    .from('director_salary_submissions')
    .select('total_gross, total_payroll_gross, total_invoice, total_saving, director_count, by_company, submitted_at')
    .eq('period_month', period)
    .maybeSingle()
  const directorSubmitted = !!directorSubmission
  const directorFromPayroll = directorSubmitted
    ? Number(directorSubmission?.total_gross ?? 0)
    : payrollSubmitted
      ? Number(payrollRun?.director_salary_total ?? 0)
      : 0
  const directorCostReady =
    directorSubmitted || (payrollSubmitted && Number(payrollRun?.director_salary_total ?? 0) > 0)
  const directorByCompany: Array<{
    company_id: string
    company_name: string
    company_short_code: string
    total_ctc: number
  }> = directorSubmitted
    ? (((directorSubmission?.by_company ?? []) as unknown) as Array<{
        company_id: string
        company_name: string
        company_short_code: string
        total_ctc: number
      }>).map(r => ({ ...r, total_ctc: Number(r.total_ctc) }))
    : []

  const companyList = companies ?? []
  const companyMap = new Map(
    companyList.map((c) => [c.id, { name: c.name as string, code: c.short_code as string }])
  )
  // Inter-billing: invoices may target a dept_pool (billable_to_type='dept_pool')
  // instead of a subsidiary, so InvoicesList needs to resolve dept name from
  // billable_to_department_id rather than falling through to '—'.
  const departmentMap = new Map<string, string>(
    (departments ?? []).map((d) => [d.id as string, d.name as string])
  )

  return (
    <div>
      <div className="page-head sticky top-0 z-20 bg-paper pt-2">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> BILLING · SERVICE INVOICES
          </div>
          <h1 className="page-title">Service Billing</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PeriodSelector currentPeriod={period} />
          {user.role === 'finance' && (
            <>
              <CreateMultiLineInvoiceButton
                companies={companyList}
                currentPeriod={period}
                departments={departments ?? []}
                categories={categoryList}
              />
              <CreateInvoiceButton
                companies={companyList}
                currentPeriod={period}
                departments={departments ?? []}
                categories={categoryList}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {dayjs(period).format('MMMM YYYY')}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {invoiceList.length > 0
              ? formatMoney(invoiceTotal)
              : payrollSubmitted || directorSubmitted
                ? formatMoney(
                    marketingFromPayroll +
                      hrFromPayroll +
                      financeFromPayroll +
                      directorOfficeFromPayroll +
                      directorFromPayroll,
                  )
                : formatMoney(0)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {invoiceList.length > 0 ? (
              <>
                {invoiceList.length} invoice{invoiceList.length === 1 ? '' : 's'}
                {' · '}
                <em className="font-serif italic">generated</em>
              </>
            ) : payrollSubmitted ? (
              <>
                HR submitted · {formatMoney(hrTotalCtc)} HR CTC ·{' '}
                <em className="font-serif italic">ready for invoice generation</em>
              </>
            ) : directorSubmitted ? (
              <em className="font-serif italic">Director salary submitted — staff payroll pending</em>
            ) : (
              <em className="font-serif italic">HR has not submitted this period yet</em>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2">
          <StatRow
            label="HR snapshot"
            value={submitted ? 'submitted' : 'pending'}
            muted={!submitted}
          />
          <StatRow
            label="Marketing contracts"
            value={`${marketingContractsActive} active`}
            muted={marketingContractsActive === 0}
          />
          <StatRow
            label="Invoices this period"
            value={`${invoiceList.length}`}
            muted={invoiceList.length === 0}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <DeptCostCard
          label="HR OPEX"
          required={hrFromPayroll}
          invoiced={hrAttributionTotal}
          invoiceCount={hrInvoiceCount}
          invoiceMode="hr_attribution"
          payrollSubmitted={payrollSubmitted}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
          categories={categoryList}
        />
        <DeptCostCard
          label="Finance OPEX"
          required={financeFromPayroll}
          invoiced={financeAttributionTotal}
          invoiceCount={financeInvoiceCount}
          invoiceMode="finance_attribution"
          payrollSubmitted={payrollSubmitted}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
          categories={categoryList}
        />
        <DeptCostCard
          label="Director Office OPEX"
          required={directorOfficeFromPayroll}
          invoiced={directorOfficeTotal}
          invoiceCount={directorOfficeInvoiceCount}
          invoiceMode="director_office_attribution"
          payrollSubmitted={payrollSubmitted}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
          categories={categoryList}
        />
        <DeptCostCard
          label="Director OPEX"
          required={directorFromPayroll}
          invoiced={directorAttributionTotal}
          invoiceCount={directorAttributionInvoiceCount}
          invoiceMode="director_attribution"
          payrollSubmitted={directorCostReady}
          awaitingNote="awaiting Director Salary submission"
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
          categories={categoryList}
        />
        <DeptCostCard
          label="Marketing OPEX"
          required={marketingFromPayroll}
          invoiced={marketingTotal}
          invoiceCount={marketingInvoiceCount}
          invoiceMode="marketing_project"
          payrollSubmitted={payrollSubmitted}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
          categories={categoryList}
          marketingNote
        />
      </div>

      {/* Director Payroll Submission — per-subsidiary contribution (mig 279).
          This is what Finance bills each subsidiary for director salary;
          Create Invoice → Director attribution auto-fills from the same data. */}
      {directorSubmitted && directorByCompany.length > 0 && (
        <section className="mb-12">
          <div className="sect-head">
            <h2>Director Salary Submission</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {directorByCompany.length} SUBSIDIAR{directorByCompany.length === 1 ? 'Y' : 'IES'}
            </span>
          </div>
          <div className="font-mono text-xs text-muted mb-4">
            Submitted {directorSubmission?.submitted_at ? dayjs(directorSubmission.submitted_at).format('D MMM YYYY HH:mm') : ''} ·{' '}
            {Number(directorSubmission?.director_count ?? 0)} director{Number(directorSubmission?.director_count ?? 0) === 1 ? '' : 's'} ·{' '}
            total {formatMoney(Number(directorSubmission?.total_gross ?? 0))}
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Subsidiary</th>
                  <th className="right">CTC Contribution</th>
                </tr>
              </thead>
              <tbody>
                {directorByCompany.map(r => (
                  <tr key={r.company_id}>
                    <td>
                      <div className="font-serif text-[15px] text-ink">{r.company_short_code}</div>
                      <div className="font-mono text-[11px] text-graphite mt-0.5">{r.company_name}</div>
                    </td>
                    <td className="num">{formatMoney(r.total_ctc)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num font-semibold">
                    {formatMoney(directorByCompany.reduce((s, r) => s + r.total_ctc, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <InvoicesList invoices={invoiceList} companyMap={companyMap} departmentMap={departmentMap} period={period} categories={categoryList} bankAccounts={bankList} invoiceLines={linesByInvoice} />

      <MarketingProjectList
        contracts={(marketingContracts ?? [])
          .filter((c): c is typeof c & { company_id: string } => c.company_id !== null)}
        companyMap={companyMap}
        canCreate={user.role === 'finance'}
        headerAction={
          user.role === 'finance' ? (
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
        canAdd={user.role === 'finance'}
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
function DeptCostCard({
  label,
  required,
  invoiced,
  invoiceCount,
  invoiceMode,
  payrollSubmitted,
  awaitingNote,
  canCreate,
  companies,
  currentPeriod,
  categories,
  marketingNote,
}: {
  label: string
  required: number
  invoiced: number
  invoiceCount: number
  invoiceMode: CreateInvoiceMode
  payrollSubmitted: boolean
  awaitingNote?: string
  canCreate: boolean
  companies: Array<{ id: string; name: string; short_code: string }>
  currentPeriod: string
  departments?: Array<{ id: string; name: string }>
  categories?: Array<{
    code: string
    label: string
    type: AccountType
    parent_code: string | null
  }>
  marketingNote?: boolean
}) {
  const hasInvoices = invoiceCount > 0
  const hasRequired = required > 0.005
  // Main number: invoiced total once invoices exist; otherwise the
  // approved-payroll target (Finance uses this to know what to bill).
  // payrollSubmitted gating happens upstream (required is forced to 0 when
  // Principal hasn't approved), so reaching this branch implies approval.
  const amount = hasInvoices ? invoiced : required
  const muted = !hasInvoices && !hasRequired

  let note: string
  if (!payrollSubmitted) {
    note = awaitingNote ?? 'awaiting HR costing'
  } else if (hasInvoices) {
    const gap = Math.round((required - invoiced) * 100) / 100
    if (Math.abs(gap) < 0.01) {
      note = `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`
    } else if (gap > 0) {
      note = `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'} · short RM ${gap.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
    } else {
      note = `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'} · over RM ${(-gap).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
    }
  } else if (marketingNote) {
    note = 'from payroll — no invoice'
  } else {
    note = 'from payroll — no invoice yet'
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 flex flex-col">
      <div className="font-serif italic text-accent text-sm mb-1">{label}</div>
      <div className={`font-serif text-3xl leading-none ${muted ? 'text-muted' : 'text-ink'}`}>
        {formatMoney(amount)}
      </div>
      <div className="font-mono text-xs text-muted mt-2">{note}</div>
      {canCreate && payrollSubmitted && (
        <div className="mt-3 pt-3 border-t border-hairline">
          <CreateInvoiceButton
            companies={companies}
            currentPeriod={currentPeriod}
            departments={[]}
            categories={categories ?? []}
            prefillMode={invoiceMode}
            targetAmount={required}
            alreadyInvoiced={invoiced}
            compact
            label="+ Create Invoice"
          />
        </div>
      )}
    </div>
  )
}

function StatRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between font-mono text-sm">
      <em className="font-serif text-md text-graphite">{label}</em>
      <span
        className={
          muted
            ? 'font-serif italic text-muted text-sm'
            : 'font-serif italic text-ink text-sm'
        }
      >
        {value}
      </span>
    </div>
  )
}
