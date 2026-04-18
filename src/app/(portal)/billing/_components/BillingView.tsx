// Phase 7 Step 11: extracted from billing/page.tsx so both the /billing redirect
// and the /statements/invoices tab can share one implementation. All internal
// component paths are preserved.

import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import PeriodSelector from './PeriodSelector'
import GenerateInvoicesButton from './GenerateInvoicesButton'
import HRPoolSplitSection from './HRPoolSplitSection'
import FinanceAttributionSection from './FinanceAttributionSection'
import MarketingProjectList from './MarketingProjectList'
import FixedSplitPanel from './FixedSplitPanel'
import NonBillableList from './NonBillableList'
import InvoicesList from './InvoicesList'
import ManualOpexSection, { type ExistingInvoice } from './ManualOpexSection'

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
    { data: headcountRows },
    { data: directorSummary },
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
      .from('monthly_headcounts')
      .select('company_id, headcount')
      .eq('period_month', period),
    supabase.rpc('get_director_payout_summary', { p_period: period }).maybeSingle(),
    supabase
      .from('hv_operating_fund')
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

  const hrTotal = invoiceList
    .filter((i) => i.billing_mode === 'hr_pool_split')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const financeTotal = invoiceList
    .filter((i) => i.billing_mode === 'finance_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const marketingTotal = invoiceList
    .filter((i) => i.billing_mode === 'marketing_project')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const directorOfficeTotal = invoiceList
    .filter((i) => i.billing_mode === 'director_office_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const directorAttributionTotal = invoiceList
    .filter((i) => i.billing_mode === 'director_attribution')
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const directorOpexTotal = Number(directorSummary?.out_total_payroll_gross ?? 0)
  const directorPayoutCount = Number(directorSummary?.out_payout_count ?? 0)
  const hrInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'hr_pool_split').length
  const financeInvoiceCount = invoiceList.filter(
    (i) => i.billing_mode === 'finance_attribution'
  ).length
  const marketingInvoiceCount = invoiceList.filter((i) => i.billing_mode === 'marketing_project').length

  // Task 4: Marketing OPEX visibility sourced from the submitted payroll_run,
  // not from invoices (Marketing pays its own staff from contract revenue,
  // doesn't bill subsidiaries). Shown so Finance can still see the number.
  const { data: payrollRun } = await supabase
    .from('payroll_runs')
    .select('marketing_opex_total')
    .eq('period_month', period)
    .maybeSingle()
  const marketingOpexFromPayroll = Number(payrollRun?.marketing_opex_total ?? 0)

  // Director Office + Director OPEX sections need existing invoices keyed per
  // company so the manual form can block double-billing.
  const directorOfficeExisting: ExistingInvoice[] = invoiceList
    .filter((i) => i.billing_mode === 'director_office_attribution')
    .map((i) => ({
      id: i.id,
      invoice_no: i.invoice_no ?? '',
      company_id: i.company_id,
      total_amount: Number(i.total_amount),
      status: i.status,
    }))
  const directorAttributionExisting: ExistingInvoice[] = invoiceList
    .filter((i) => i.billing_mode === 'director_attribution')
    .map((i) => ({
      id: i.id,
      invoice_no: i.invoice_no ?? '',
      company_id: i.company_id,
      total_amount: Number(i.total_amount),
      status: i.status,
    }))

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
            Five billing modes feed the monthly consolidated statement.{' '}
            <em>Finance reviews + issues invoices, Principal approves new contracts.</em>
          </p>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <PeriodSelector currentPeriod={period} />
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
        <CostCard label="HR OPEX" amount={hrTotal} count={hrInvoiceCount} unit="invoice" />
        <CostCard label="Finance OPEX" amount={financeTotal} count={financeInvoiceCount} unit="invoice" />
        <CostCard
          label="Marketing OPEX"
          amount={marketingOpexFromPayroll > 0 ? marketingOpexFromPayroll : marketingTotal}
          count={marketingInvoiceCount}
          unit="invoice"
          note={marketingOpexFromPayroll > 0 ? 'from payroll — no invoice' : undefined}
        />
        <CostCard label="Director Office OPEX" amount={directorOfficeTotal} count={directorOfficeExisting.length} unit="invoice" />
        <CostCard label="Director OPEX" amount={directorAttributionTotal} count={directorAttributionExisting.length} unit="invoice" />
      </div>

      <InvoicesList invoices={invoiceList} companyMap={companyMap} period={period} />

      <div className="relative">
        {user.role === 'finance' && submitted ? (
          <div className="absolute right-0 top-10">
            <GenerateInvoicesButton
              currentPeriod={period}
              modes={['hr_pool_split']}
              label="Generate HR invoices"
            />
          </div>
        ) : null}
        <HRPoolSplitSection deptSummaries={deptSummaries} submitted={submitted} />
      </div>

      <div className="relative">
        {user.role === 'finance' && submitted ? (
          <div className="absolute right-0 top-10">
            <GenerateInvoicesButton
              currentPeriod={period}
              modes={['finance_attribution']}
              label="Generate Finance invoices"
            />
          </div>
        ) : null}
        <FinanceAttributionSection deptSummaries={deptSummaries} submitted={submitted} />
      </div>

      <div className="relative">
        {user.role === 'finance' ? (
          <div className="absolute right-0 top-10">
            <GenerateInvoicesButton
              currentPeriod={period}
              modes={['marketing_project']}
              label="Generate Marketing invoices"
            />
          </div>
        ) : null}
        <MarketingProjectList
          contracts={(marketingContracts ?? [])
            .filter((c): c is typeof c & { company_id: string } => c.company_id !== null)}
          companyMap={companyMap}
          canCreate={user.role === 'finance'}
        />
      </div>
      <ManualOpexSection
        title="Director Office OPEX"
        poolLabel="Director Office Department Pool"
        description="Bill subsidiaries for Director Office staff costs."
        billingMode="director_office_attribution"
        period={period}
        companies={companyList}
        existing={directorOfficeExisting}
        canCreate={user.role === 'finance'}
      />

      <ManualOpexSection
        title="Director OPEX"
        poolLabel="Director Department Pool"
        description="Bill subsidiaries for Director OPEX. Invoice payments credit the Director Dept Pool where directors get paid from."
        billingMode="director_attribution"
        period={period}
        companies={companyList}
        existing={directorAttributionExisting}
        canCreate={user.role === 'finance'}
      />

      <FixedSplitPanel
        currentPeriod={period}
        canGenerate={user.role === 'finance'}
        companies={companyList.map((c) => ({ id: c.id, name: c.name, short_code: c.short_code }))}
        savedHeadcounts={(headcountRows ?? []).map((h) => ({
          company_id: h.company_id,
          headcount: Number(h.headcount),
        }))}
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

function CostCard({
  label,
  amount,
  count,
  unit,
  note,
}: {
  label: string
  amount: number
  count: number
  unit: string
  note?: string
}) {
  const muted = amount === 0
  return (
    <div className="border border-hairline rounded-md bg-surface p-5">
      <div className="font-serif italic text-accent text-sm mb-1">{label}</div>
      <div className={`font-serif text-3xl leading-none ${muted ? 'text-muted' : 'text-ink'}`}>
        {formatMoney(amount)}
      </div>
      <div className="font-mono text-xs text-muted mt-2">
        {note ?? `${count} ${unit}${count === 1 ? '' : 's'}`}
      </div>
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
