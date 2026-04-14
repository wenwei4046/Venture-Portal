import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import PeriodSelector from './_components/PeriodSelector'
import GenerateInvoicesButton from './_components/GenerateInvoicesButton'
import HRPoolSplitSection from './_components/HRPoolSplitSection'
import FinanceAttributionSection from './_components/FinanceAttributionSection'
import FinanceMgmtFeeSection from './_components/FinanceMgmtFeeSection'
import MarketingProjectList from './_components/MarketingProjectList'
import FixedSplitPanel from './_components/FixedSplitPanel'
import NonBillableList from './_components/NonBillableList'
import InvoicesList from './_components/InvoicesList'

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

export default async function BillingPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')

  // Fetch in parallel — each query is Finance-safe via RLS or dedicated RPC
  const [
    { data: hrSummary, error: hrSummaryError },
    { data: marketingContracts },
    { data: invoices },
    { data: companies },
    { data: headcountRows },
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
  ])

  // hrSummary errors (e.g. RLS / RPC failure) — log but render empty state
  if (hrSummaryError) {
    console.error('get_submitted_hr_summary failed:', hrSummaryError.message)
  }

  const submitted = !!hrSummary
  const deptSummaries = submitted
    ? (((hrSummary?.dept_summaries ?? {}) as unknown) as Record<string, DeptSummary>)
    : null

  // Totals for the hero card
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

  const companyList = companies ?? []
  const companyMap = new Map(
    companyList.map((c) => [c.id, { name: c.name as string, code: c.short_code as string }])
  )

  return (
    <div>
      {/* ───────── Header ───────── */}
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

      {/* ───────── Overview hero ───────── */}
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

      {/* ───────── Invoices list (fills in once Step 5 ships) ───────── */}
      <InvoicesList invoices={invoiceList} companyMap={companyMap} period={period} />

      {/* ───────── Billing modes (per-department generation) ───────── */}
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
              modes={['finance_attribution', 'finance_mgmt_fee']}
              label="Generate Finance invoices"
            />
          </div>
        ) : null}
        <FinanceAttributionSection deptSummaries={deptSummaries} submitted={submitted} />
      </div>

      <FinanceMgmtFeeSection submitted={submitted} />
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
      <FixedSplitPanel
        currentPeriod={period}
        canGenerate={user.role === 'finance'}
        companies={companyList.map((c) => ({ id: c.id, name: c.name, short_code: c.short_code }))}
        savedHeadcounts={(headcountRows ?? []).map((h) => ({
          company_id: h.company_id,
          headcount: Number(h.headcount),
        }))}
      />
      <NonBillableList />
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
