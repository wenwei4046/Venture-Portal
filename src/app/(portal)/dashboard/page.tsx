import Link from 'next/link'
import dayjs from 'dayjs'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'

type Subsidiary = {
  id: string
  name: string
  short_code: string
  tier: string
  savings_deposited: number
  loans_outstanding: number
  net_position: number
  position: 'creditor' | 'debtor' | 'even'
  has_overdue: boolean
}

type PendingApproval = {
  id: string
  request_type: string
  description: string | null
  amount: number | null
  submitted_by_name: string | null
  created_at: string
}

type Alert = {
  type: 'overdue' | 'buffer' | 'maturity'
  severity: 'danger' | 'warning' | 'info'
  message: string
}

type MarketingNp = {
  period_month: string
  revenue: number
  staff_cost: number
  expenses: number
  net_profit: number
}

type DashboardSummary = {
  role: 'principal' | 'finance' | 'hr' | 'dept_manager'
  total_pool: number
  loans_outstanding: number
  free_cash: number
  buffer_amount: number | null
  buffer_breach: boolean
  weighted_cost_rate: number | null
  current_base_rate: number | null
  net_spread: number | null
  monthly_interest_income: number
  monthly_interest_expense: number
  net_interest_income: number
  pending_approvals_count: number | null
  pending_approvals: PendingApproval[] | null
  subsidiaries: Subsidiary[]
  alerts: Alert[]
  // Phase 2 extensions
  dept_pool_total: number
  billing_float: number
  marketing_np_this_month: MarketingNp
  // Phase 3 extensions
  salary_pool_total: number | null
  payouts_pending: number | null
  hv_fund_balance: number | null
  invoice_pool_balance: number | null
  total_advance: number | null
  total_saving: number | null
}

export default async function DashboardPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: raw, error } = await supabase.rpc('dashboard_summary')
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif italic text-danger">Failed to load dashboard.</p>
        <p className="font-mono text-xs text-muted mt-2">{error.message}</p>
      </div>
    )
  }

  const summary = raw as unknown as DashboardSummary
  const today = dayjs().format('D MMMM YYYY')

  const hasAnyData =
    summary.total_pool > 0 || summary.loans_outstanding > 0

  const aboveBuffer = summary.free_cash
  const bufferAmount = Number(summary.buffer_amount ?? 0)

  const isPrincipal = summary.role === 'principal'
  const pendingApprovals = summary.pending_approvals ?? []
  const pendingCount = summary.pending_approvals_count ?? 0
  const subsidiaries = summary.subsidiaries ?? []
  const alerts = summary.alerts ?? []

  return (
    <div>
      {/* ───────── Hero grid: 7+5 broadsheet ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 mb-16">
        {/* LEFT 7 columns — Free pool hero */}
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Free pool
          </div>
          <div className="font-serif text-hero text-ink leading-none mb-3">
            {hasAnyData ? (
              summary.free_cash < 0 ? (
                <span className="text-danger">
                  ({formatMoney(Math.abs(summary.free_cash)).replace('RM ', '')})
                </span>
              ) : (
                formatMoney(summary.free_cash)
              )
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-xs text-muted">
            As of {today}
            {hasAnyData ? ' · live from dashboard_summary' : ' · no fund sources yet'}
          </div>

          {/* Sparkline placeholder — 12-month trend belongs to /reports */}
          <svg
            className="w-full h-12 my-7"
            viewBox="0 0 600 48"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {hasAnyData ? (
              <>
                <path
                  d="M 0 30 L 40 28 L 80 32 L 120 25 L 160 22 L 200 20 L 240 24 L 280 18 L 320 15 L 360 17 L 400 12 L 440 14 L 480 10 L 520 13 L 560 8 L 600 6"
                  fill="none"
                  stroke="#1A1613"
                  strokeWidth="1.25"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1="0"
                  y1="40"
                  x2="600"
                  y2="40"
                  stroke="#DFD4BE"
                  strokeWidth="0.5"
                  strokeDasharray="3,3"
                />
              </>
            ) : (
              <line
                x1="0"
                y1="40"
                x2="600"
                y2="40"
                stroke="#DFD4BE"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
            )}
          </svg>

          {hasAnyData ? (
            <div className="text-sm text-graphite">
              Pool{' '}
              <span className="font-mono tabular text-ink">
                {formatMoney(summary.total_pool)}
              </span>{' '}
              ·{' '}
              <em className="font-serif text-graphite">
                lent{' '}
                <span className="font-mono tabular not-italic">
                  {formatMoney(summary.loans_outstanding)}
                </span>
              </em>
              {' · '}
              {summary.buffer_breach ? (
                <em className="font-serif text-danger">
                  Below buffer by {formatMoney(Math.abs(aboveBuffer))}
                </em>
              ) : (
                <>
                  Above buffer by{' '}
                  <span className="font-mono tabular text-ledger">
                    {formatMoney(aboveBuffer + bufferAmount)}
                  </span>
                </>
              )}{' '}
              · Buffer{' '}
              <span className="font-mono tabular">{formatMoney(bufferAmount)}</span>
            </div>
          ) : (
            <div className="mt-4">
              <p className="font-serif italic text-graphite text-base mb-4">
                No fund sources yet. Start by recording the first one.
              </p>
              <Link
                href="/fund-in"
                className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-md font-serif italic text-sm transition-colors"
              >
                Record first fund source
              </Link>
            </div>
          )}
        </div>

        {/* RIGHT 5 columns — Pending your hand (Principal only) */}
        <div className="lg:col-span-5">
          {isPrincipal ? (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif italic text-xl text-ink">
                  Pending your hand
                </h2>
                <span className="font-mono text-xs text-muted">
                  {pendingCount} {pendingCount === 1 ? 'item' : 'items'}
                </span>
              </div>

              {pendingCount === 0 ? (
                <div className="border border-hairline rounded-md bg-surface p-6 text-center">
                  <p className="font-serif italic text-ledger text-base">
                    All caught up.
                  </p>
                  <p className="text-xs text-muted mt-1">
                    No approvals waiting.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingApprovals.slice(0, 5).map((req) => (
                    <Link
                      key={req.id}
                      href={`/approvals/${req.id}`}
                      className="block border-b border-hairline pb-3 hover:bg-surface-2/40 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                          {req.request_type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-xs text-muted">
                          {dayjs(req.created_at).format('D MMM')}
                        </span>
                      </div>
                      <div className="font-serif text-sm text-ink leading-tight">
                        {req.description ?? '—'}
                      </div>
                      <div className="font-mono text-xs text-muted mt-1">
                        {req.amount != null ? formatMoney(Number(req.amount)) : '—'}
                        {req.submitted_by_name
                          ? ` · by ${req.submitted_by_name}`
                          : ''}
                      </div>
                    </Link>
                  ))}
                  {pendingCount > 5 ? (
                    <Link
                      href="/approvals"
                      className="block text-center text-sm text-accent hover:text-accent-hover font-serif italic pt-2"
                    >
                      See all {pendingCount} →
                    </Link>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif italic text-xl text-ink">
                  Margin panel
                </h2>
                <span className="font-mono text-xs text-muted">monthly</span>
              </div>
              <MarginPanel summary={summary} />
            </>
          )}
        </div>
      </div>

      {/* ───────── Margin panel (Principal sees this below hero) ───────── */}
      {isPrincipal && hasAnyData ? (
        <section className="mb-16">
          <h2 className="font-serif text-2xl text-ink mb-1">Margin panel</h2>
          <p className="font-serif italic text-graphite text-sm mb-6">
            Weighted cost vs. lending rate, <em>this month</em>
          </p>
          <MarginPanel summary={summary} />
        </section>
      ) : null}

      {/* ───────── Subsidiaries ───────── */}
      <section className="mb-16">
        <h2 className="font-serif text-2xl text-ink mb-1">Subsidiaries</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          {subsidiaries.length} entities, <em>net position as of this morning</em>
        </p>

        {subsidiaries.length === 0 ? (
          <div className="py-10 text-center border-t border-hairline">
            <p className="font-serif italic text-muted text-base">
              No companies configured. Visit Settings to add subsidiaries.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-right py-3 pr-4 font-medium">Savings</th>
                  <th className="text-right py-3 pr-4 font-medium">Loans</th>
                  <th className="text-right py-3 pr-4 font-medium">Net</th>
                  <th className="text-left py-3 pr-4 font-medium">Position</th>
                </tr>
              </thead>
              <tbody>
                {subsidiaries.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                  >
                    <td className="py-4 pr-4">
                      <div className="font-serif text-md text-ink">{sub.name}</div>
                      <div className="font-mono text-xs text-muted">
                        {sub.short_code} · Tier {sub.tier}
                        {sub.has_overdue ? (
                          <span className="text-danger"> · overdue</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-right font-mono tabular text-graphite">
                      {sub.savings_deposited > 0
                        ? formatMoney(sub.savings_deposited)
                        : '—'}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono tabular text-graphite">
                      {sub.loans_outstanding > 0
                        ? formatMoney(sub.loans_outstanding)
                        : '—'}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono tabular">
                      {sub.net_position === 0 ? (
                        <span className="text-muted">—</span>
                      ) : sub.net_position > 0 ? (
                        <span className="text-ledger font-semibold">
                          +{formatMoney(sub.net_position).replace('RM ', '')}
                        </span>
                      ) : (
                        <span className="text-danger font-semibold">
                          ({formatMoney(Math.abs(sub.net_position)).replace('RM ', '')})
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <PositionLabel position={sub.position} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Alerts ───────── */}
      {alerts.length > 0 ? (
        <section className="mb-16">
          <h2 className="font-serif text-2xl text-ink mb-1">Alerts</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            {alerts.length} item{alerts.length === 1 ? '' : 's'} to watch
          </p>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="border-b border-hairline pb-2 flex items-baseline gap-3"
              >
                <span
                  className={
                    alert.severity === 'danger'
                      ? 'font-mono text-[10px] uppercase tracking-wider text-danger'
                      : alert.severity === 'warning'
                        ? 'font-mono text-[10px] uppercase tracking-wider text-alert'
                        : 'font-mono text-[10px] uppercase tracking-wider text-muted'
                  }
                >
                  {alert.type}
                </span>
                <span className="font-serif italic text-sm text-graphite">
                  {alert.message}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ───────── Phase 2 — Billing + Dept Pool snapshot ───────── */}
      <section className="mb-16">
        <h2 className="font-serif text-2xl text-ink mb-1">Billing &amp; Dept Pool</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Phase 2 live view: unpaid invoices, dept pool totals, Marketing P&amp;L{' '}
          <em>this month</em>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">
              Billing float
            </div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.billing_float ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              Unpaid invoices (draft + issued)
            </p>
          </div>

          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">
              Dept pool total
            </div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.dept_pool_total ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              Sum of positive dept pool balances
            </p>
          </div>

          <MarketingNpCard mkNp={summary.marketing_np_this_month} />
        </div>
      </section>

      {/* ───────── Phase 3 — Director Salary + Pools ───────── */}
      <section className="mb-12 pb-12 border-b border-hairline">
        <h2 className="font-serif text-2xl text-ink mb-1">Director Salary</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Phase 3 director salary engine, operating fund, invoice pool.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">Salary Pool</div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.salary_pool_total ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              {summary.payouts_pending ?? 0} draft payouts pending
            </p>
          </div>

          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">Operating Fund</div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.hv_fund_balance ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              5% saving + statutory surplus
            </p>
          </div>

          <div className="border border-hairline rounded-md bg-surface p-5">
            <div className="font-serif italic text-accent text-sm mb-1">Invoice Pool</div>
            <div className="font-serif text-2xl text-ink leading-none">
              {formatMoney(Number(summary.invoice_pool_balance ?? 0))}
            </div>
            <p className="font-mono text-xs text-muted mt-2">
              25% director invoice accumulation
            </p>
          </div>
        </div>
      </section>

      {/* ───────── Phase status note ───────── */}
      <div className="mt-16 pt-8 border-t border-hairline">
        <p className="font-mono text-xs text-muted">
          Phase 3 Director Salary + HR Costing + Reports · 9 steps shipped · live via{' '}
          <em className="font-serif">dashboard_summary()</em> RPC
        </p>
      </div>
    </div>
  )
}

function MarketingNpCard({ mkNp }: { mkNp: MarketingNp | undefined }) {
  const revenue = Number(mkNp?.revenue ?? 0)
  const staffCost = Number(mkNp?.staff_cost ?? 0)
  const expenses = Number(mkNp?.expenses ?? 0)
  const netProfit = Number(mkNp?.net_profit ?? 0)
  const isLoss = netProfit < 0

  return (
    <div className="border border-hairline rounded-md bg-surface p-5">
      <div className="font-serif italic text-accent text-sm mb-1">
        Marketing NP this month
      </div>
      <div
        className={
          isLoss
            ? 'font-serif text-2xl text-danger leading-none'
            : 'font-serif text-2xl text-ink leading-none'
        }
      >
        {isLoss
          ? `(${formatMoney(Math.abs(netProfit)).replace('RM ', '')})`
          : formatMoney(netProfit)}
      </div>
      <div className="font-mono text-xs text-muted mt-2 space-y-0.5">
        <div>Revenue {formatMoney(revenue)}</div>
        <div>− Staff {formatMoney(staffCost)}</div>
        <div>− Expenses {formatMoney(expenses)}</div>
      </div>
    </div>
  )
}

function PositionLabel({ position }: { position: Subsidiary['position'] }) {
  if (position === 'creditor') {
    return (
      <em className="font-serif text-ledger text-sm" title="HV owes this subsidiary">
        creditor
      </em>
    )
  }
  if (position === 'debtor') {
    return (
      <em className="font-serif text-alert text-sm" title="Subsidiary owes HV">
        debtor
      </em>
    )
  }
  return <em className="font-serif text-muted text-sm">even</em>
}

function MarginPanel({ summary }: { summary: DashboardSummary }) {
  const weightedCost = summary.weighted_cost_rate
  const baseRate = summary.current_base_rate
  const netSpread = summary.net_spread
  const netInterest = summary.net_interest_income

  const spreadNegative = netSpread != null && netSpread < 0
  const interestNegative = netInterest < 0

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-serif italic text-sm text-graphite">
          Weighted cost of capital
        </span>
        <span className="font-mono tabular text-sm text-ink">
          {weightedCost != null ? `${(weightedCost * 100).toFixed(3)}%/mo` : '—'}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-serif italic text-sm text-graphite">
          Current base rate
        </span>
        <span className="font-mono tabular text-sm text-ink">
          {baseRate != null ? `${(baseRate * 100).toFixed(3)}%/mo` : '—'}
        </span>
      </div>
      <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
        <span className="font-serif italic text-sm text-accent">Net spread</span>
        <span
          className={
            spreadNegative
              ? 'font-mono tabular text-md text-danger'
              : 'font-mono tabular text-md text-ledger'
          }
        >
          {netSpread != null ? `${(netSpread * 100).toFixed(3)}%/mo` : '—'}
        </span>
      </div>

      <div className="pt-3 border-t border-hairline space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-xs text-graphite">
            Interest income
          </span>
          <span className="font-mono tabular text-xs text-ink">
            {formatMoney(summary.monthly_interest_income)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-xs text-graphite">
            Interest expense
          </span>
          <span className="font-mono tabular text-xs text-graphite">
            ({formatMoney(summary.monthly_interest_expense).replace('RM ', '')})
          </span>
        </div>
        <div className="flex items-baseline justify-between pt-1 border-t border-hairline">
          <span className="font-serif italic text-sm text-accent">
            Net interest
          </span>
          <span
            className={
              interestNegative
                ? 'font-mono tabular text-sm text-danger'
                : 'font-mono tabular text-sm text-ledger'
            }
          >
            {interestNegative
              ? `(${formatMoney(Math.abs(netInterest)).replace('RM ', '')})`
              : formatMoney(netInterest)}
          </span>
        </div>
      </div>
    </div>
  )
}
