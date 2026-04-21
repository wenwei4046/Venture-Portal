// Phase 7 Step 11: extracted from billing/page.tsx so both the /billing redirect
// and the /statements/invoices tab can share one implementation. All internal
// component paths are preserved.

import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import type { CreateInvoiceMode } from '../actions'
import PeriodSelector from './PeriodSelector'
import GenerateInvoicesButton from './GenerateInvoicesButton'
import MarketingProjectList from './MarketingProjectList'
import NonBillableList from './NonBillableList'
import InvoicesList from './InvoicesList'
import CreateInvoiceButton from './CreateInvoiceButton'

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
      .select('id, invoice_no, company_id, period_month, billing_mode, total_amount, status')
      .eq('period_month', period)
      .order('billing_mode', { ascending: true }),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('short_code'),
    supabase
      .from('venture_pool')
      .select('id, created_at, transaction_type, amount, description, reference_table')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .order('created_at', { ascending: false }),
  ])

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

  // Pull the 5 per-dept OPEX totals the approved payroll_run captured at
  // Stage A (Principal approved HR costing). Finance uses these as the
  // REQUIRED amount per dept — once they've created + issued invoices for
  // the dept, the card flips to showing the invoice total instead.
  const { data: payrollRun } = await supabase
    .from('payroll_runs')
    .select(
      'marketing_opex_total, hr_opex_total, finance_opex_total, director_office_total, director_salary_total'
    )
    .eq('period_month', period)
    .maybeSingle()
  const payrollApproved = !!payrollRun
  const marketingFromPayroll = Number(payrollRun?.marketing_opex_total ?? 0)
  const hrFromPayroll = Number(payrollRun?.hr_opex_total ?? 0)
  const financeFromPayroll = Number(payrollRun?.finance_opex_total ?? 0)
  const directorOfficeFromPayroll = Number(payrollRun?.director_office_total ?? 0)
  const directorFromPayroll = Number(payrollRun?.director_salary_total ?? 0)

  const companyList = companies ?? []
  const companyMap = new Map(
    companyList.map((c) => [c.id, { name: c.name as string, code: c.short_code as string }])
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Service Billing</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Department OPEX billing and marketing contracts feed the monthly consolidated statement.{' '}
            <em>Finance creates + issues invoices, Principal approves new contracts.</em>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PeriodSelector currentPeriod={period} />
          {user.role === 'finance' && (
            <CreateInvoiceButton companies={companyList} currentPeriod={period} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {dayjs(period).format('MMMM YYYY')}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {invoiceList.length > 0 ? formatMoney(invoiceTotal) : formatMoney(hrTotalCtc)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {invoiceList.length > 0 ? (
              <>
                {invoiceList.length} invoice{invoiceList.length === 1 ? '' : 's'}
                {' · '}
                <em className="font-serif italic">generated</em>
              </>
            ) : submitted ? (
              <>
                HR submitted · {formatMoney(hrTotalCtc)} total CTC ·{' '}
                <em className="font-serif italic">ready for invoice generation</em>
              </>
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
          payrollApproved={payrollApproved}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
        />
        <DeptCostCard
          label="Finance OPEX"
          required={financeFromPayroll}
          invoiced={financeAttributionTotal}
          invoiceCount={financeInvoiceCount}
          invoiceMode="finance_attribution"
          payrollApproved={payrollApproved}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
        />
        <DeptCostCard
          label="Director Office OPEX"
          required={directorOfficeFromPayroll}
          invoiced={directorOfficeTotal}
          invoiceCount={directorOfficeInvoiceCount}
          invoiceMode="director_office_attribution"
          payrollApproved={payrollApproved}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
        />
        <DeptCostCard
          label="Director OPEX"
          required={directorFromPayroll}
          invoiced={directorAttributionTotal}
          invoiceCount={directorAttributionInvoiceCount}
          invoiceMode="director_attribution"
          payrollApproved={payrollApproved}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
        />
        <DeptCostCard
          label="Marketing OPEX"
          required={marketingFromPayroll}
          invoiced={marketingTotal}
          invoiceCount={marketingInvoiceCount}
          invoiceMode="marketing_project"
          payrollApproved={payrollApproved}
          canCreate={user.role === 'finance'}
          companies={companyList}
          currentPeriod={period}
          marketingNote
        />
      </div>

      <InvoicesList invoices={invoiceList} companyMap={companyMap} period={period} />

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
  payrollApproved,
  canCreate,
  companies,
  currentPeriod,
  marketingNote,
}: {
  label: string
  required: number
  invoiced: number
  invoiceCount: number
  invoiceMode: CreateInvoiceMode
  payrollApproved: boolean
  canCreate: boolean
  companies: Array<{ id: string; name: string; short_code: string }>
  currentPeriod: string
  marketingNote?: boolean
}) {
  const hasInvoices = invoiceCount > 0
  const hasRequired = required > 0.005
  const amount = hasInvoices ? invoiced : required
  const muted = !hasInvoices && !hasRequired

  let note: string
  if (!payrollApproved) {
    note = 'awaiting HR costing'
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
      {canCreate && payrollApproved && (
        <div className="mt-3 pt-3 border-t border-hairline">
          <CreateInvoiceButton
            companies={companies}
            currentPeriod={currentPeriod}
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
