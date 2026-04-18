import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function PnLPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  const [
    { data: loanInterest },
    { data: penalties },
    { data: invoices },
    { data: fundSources },
    { data: deptPools },
    { data: hrSummary },
  ] = await Promise.all([
    supabase.from('loans').select('principal, effective_rate').eq('status', 'active'),
    supabase.from('overdue_records').select('penalty_amount').eq('period_month', period),
    supabase.from('invoices').select('billing_mode, total_amount').eq('period_month', period).in('status', ['issued', 'paid']),
    supabase.from('fund_sources').select('amount, cost_rate').eq('status', 'active'),
    supabase.from('dept_pools').select('department_id, transaction_type, amount'),
    supabase.rpc('get_hr_cost_summary'),
  ])

  // ── TREASURY (Bank Model) ──
  const interestIncome = (loanInterest ?? []).reduce(
    (s, l) => s + Number(l.principal) * Number(l.effective_rate), 0
  )
  const penaltyIncome = (penalties ?? []).reduce((s, p) => s + Number(p.penalty_amount ?? 0), 0)
  const interestExpense = (fundSources ?? []).reduce(
    (s, f) => s + Number(f.amount) * Number(f.cost_rate), 0
  )
  const netInterest = interestIncome + penaltyIncome - interestExpense

  // ── MARKETING (Only dept with real P&L) ──
  const invoiceByMode = (mode: string) =>
    (invoices ?? []).filter(i => i.billing_mode === mode).reduce((s, i) => s + Number(i.total_amount ?? 0), 0)
  const marketingRevenue = invoiceByMode('marketing_project')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mkRow = (hrSummary as any[])?.find((r: { department_name: string }) => r.department_name === 'Marketing')
  const marketingStaffCost = Number(mkRow?.total_basic ?? 0)
  const marketingExpenses = (deptPools ?? [])
    .filter(d => d.transaction_type === 'expense_out')
    .reduce((s, d) => s + Number(d.amount), 0)
  const marketingNP = marketingRevenue - marketingStaffCost - marketingExpenses

  // ── SHARED SERVICES (Pass-through — billed to subs to recover cost) ──
  // Post-Stage-3b: HR / Finance / Fixed Split modes removed. Shared-services
  // bill-back will come back in via the manual Create Invoice flow; until
  // that's wired, this section is stubbed at zero so the rest of the P&L
  // still renders.
  const totalBillback = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hrRow = (hrSummary as any[])?.find((r: { department_name: string }) => r.department_name === 'HR')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finRow = (hrSummary as any[])?.find((r: { department_name: string }) => r.department_name === 'Finance')
  const sharedServicesCost = Number(hrRow?.total_basic ?? 0) + Number(finRow?.total_basic ?? 0)
  const netBillback = totalBillback - sharedServicesCost

  // ── HV NET PROFIT ──
  const hvNetProfit = netInterest + marketingNP + netBillback

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mt-6 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">HV Profit & Loss</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {periodLabel} — Bank model: interest spread + marketing + shared services
          </p>
        </div>
        <form>
          <input
            type="month"
            name="period"
            defaultValue={dayjs(period).format('YYYY-MM')}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </form>
      </div>

      <div className="max-w-3xl space-y-10">
        {/* ── SECTION 1: Treasury / Interest Spread ── */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-4">
            Treasury — Interest Spread
          </h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Interest income (from loans)</span>
              <span className="font-mono tabular text-base font-medium text-ink">{formatMoney(interestIncome)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Penalty income</span>
              <span className="font-mono tabular text-base font-medium text-ink">{formatMoney(penaltyIncome)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Interest expense (to depositors)</span>
              <span className="font-mono tabular text-base font-medium text-danger">{formatMoney(-interestExpense)}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-base text-ink font-medium">Net Interest Income</span>
            <span className={`font-mono tabular text-lg font-semibold ${netInterest >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(netInterest)}
            </span>
          </div>
        </section>

        {/* ── SECTION 2: Marketing P&L ── */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-4">
            Marketing Department — P&L
          </h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Project revenue</span>
              <span className="font-mono tabular text-base font-medium text-ink">{formatMoney(marketingRevenue)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Staff cost</span>
              <span className="font-mono tabular text-base font-medium text-danger">{formatMoney(-marketingStaffCost)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Department expenses</span>
              <span className="font-mono tabular text-base font-medium text-danger">{formatMoney(-marketingExpenses)}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-base text-ink font-medium">Marketing Net Profit</span>
            <span className={`font-mono tabular text-lg font-semibold ${marketingNP >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(marketingNP)}
            </span>
          </div>
        </section>

        {/* ── SECTION 3: Shared Services (Pass-through) ── */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-info font-semibold mb-4">
            Shared Services — Bill-back to Subsidiaries
          </h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Bill-back revenue</span>
              <span className="font-mono tabular text-base font-medium text-muted italic">pending new flow</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-base text-ink">Shared services staff cost</span>
              <span className="font-mono tabular text-base font-medium text-danger">{formatMoney(-sharedServicesCost)}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-base text-ink font-medium">Net Bill-back</span>
            <span className={`font-mono tabular text-lg font-semibold ${netBillback >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(netBillback)}
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-2">
            Pass-through: HV bills subsidiaries to recover HR + Finance staff costs. Net should be ~RM 0.
          </p>
        </section>

        {/* ── HV NET PROFIT ── */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between mb-4">
            <span className="font-serif text-2xl text-ink">HV Net Profit</span>
            <span className={`font-serif text-2xl font-semibold ${hvNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(hvNetProfit)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="font-serif italic text-graphite">Treasury</div>
              <div className={`font-mono tabular font-medium ${netInterest >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(netInterest)}
              </div>
            </div>
            <div className="text-center">
              <div className="font-serif italic text-graphite">Marketing</div>
              <div className={`font-mono tabular font-medium ${marketingNP >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(marketingNP)}
              </div>
            </div>
            <div className="text-center">
              <div className="font-serif italic text-graphite">Shared Svc</div>
              <div className={`font-mono tabular font-medium ${netBillback >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(netBillback)}
              </div>
            </div>
          </div>
          <p className="font-serif italic text-muted text-xs mt-4">
            Director salary is pass-through (CTC in from subs → payouts to directors). Not included in HV P&L.
          </p>
        </div>
      </div>
    </div>
  )
}
