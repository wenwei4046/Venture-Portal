import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import DeptPoolTabs from '../_components/DeptPoolTabs'
import HistoryTable from '../_components/HistoryTable'
import MarketingPnlView from '../_components/MarketingPnlView'
import RequestPaymentForm from '../_components/RequestPaymentForm'
import RequestCreditForm from '../_components/RequestCreditForm'

interface Props {
  searchParams: Promise<{ tab?: string; filter?: string }>
}

export default async function MarketingDeptPoolPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const { tab: rawTab, filter: rawFilter } = await searchParams
  const activeTab =
    rawTab === 'history'
      ? 'history'
      : rawTab === 'pnl'
        ? 'pnl'
        : rawTab === 'request-payment'
          ? 'request-payment'
          : rawTab === 'request-credit'
            ? 'request-credit'
            : 'overview'
  const historyFilter =
    rawFilter === 'in' ? 'in' : rawFilter === 'out' ? 'out' : 'all'

  // Find Marketing dept
  const { data: marketing } = await supabase
    .from('departments')
    .select('id, name')
    .eq('name', 'Marketing')
    .single()

  if (!marketing) notFound()

  // Dept Manager restriction: must be Marketing's manager
  if (user.role === 'dept_manager' && user.department_id !== marketing.id) {
    notFound()
  }

  const period = getPeriodMonth()
  const isOwnDept = user.department_id === marketing.id

  // ── Overview-only data ─────────────────────────────────────────────────────
  // Compute NP (calculate_dept_np returns a single-row set)
  const { data: npData } = activeTab === 'overview'
    ? await supabase.rpc('calculate_dept_np', {
        p_dept_id: marketing.id,
        p_period: period,
      })
    : { data: null }
  const npRow = ((npData ?? []) as unknown as Array<{
    out_revenue: number | string
    out_staff_cost: number | string
    out_expenses: number | string
    out_net_profit: number | string
  }>)[0]

  const np = {
    revenue: Number(npRow?.out_revenue ?? 0),
    staff_cost: Number(npRow?.out_staff_cost ?? 0),
    expenses: Number(npRow?.out_expenses ?? 0),
    net_profit: Number(npRow?.out_net_profit ?? 0),
  }

  // Running balance from the view
  const { data: balanceRow } = await supabase
    .from('dept_pool_balances')
    .select('balance')
    .eq('department_id', marketing.id)
    .maybeSingle()

  const balance = Number(balanceRow?.balance ?? 0)
  const canSubmitExpense = user.role === 'dept_manager' && user.department_id === marketing.id

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Dept Pools
      </Link>

      {/* ───────── Header ───────── */}
      <div className="flex items-baseline justify-between mt-3 mb-8">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">
            Department pool
          </p>
          <h1 className="font-serif text-3xl text-ink">Marketing</h1>
          <p className="font-mono text-xs text-muted mt-1">
            Period {dayjs(period).format('MMMM YYYY')}
          </p>
        </div>
      </div>

      <DeptPoolTabs
        basePath="/dept-pool/marketing"
        role={user.role}
        isOwnDept={isOwnDept}
        extraTabs={[{ key: 'pnl', label: 'P&L' }]}
      />

      {activeTab === 'overview' ? (
        <>
          {/* ───────── Hero balance + NP ───────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
            <div className="lg:col-span-7">
              <div className="font-serif italic text-graphite text-sm mb-1">
                Pool balance
              </div>
              <div className="font-serif text-[44px] md:text-hero leading-none">
                <span className={balance < 0 ? 'text-danger' : 'text-ink'}>
                  {formatMoney(balance)}
                </span>
              </div>
              <div className="font-mono text-xs text-muted mt-2">
                {balance === 0
                  ? 'No NP or expenses booked yet'
                  : 'Running balance — see History tab for full ledger'}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-graphite text-md">Revenue</em>
                <span className="text-ink tabular">{formatMoney(np.revenue)}</span>
              </div>
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-graphite text-md">Staff cost</em>
                <span className="text-ink tabular">{formatMoney(-np.staff_cost)}</span>
              </div>
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-graphite text-md">Dept expenses</em>
                <span className="text-ink tabular">{formatMoney(-np.expenses)}</span>
              </div>
              <div className="flex items-baseline justify-between font-mono text-sm border-t border-hairline pt-2 mt-2">
                <em className="font-serif text-ink text-md">Net profit</em>
                <span className={`font-serif italic text-md ${np.net_profit < 0 ? 'text-danger' : 'text-ink'}`}>
                  {formatMoney(np.net_profit)}
                </span>
              </div>
            </div>
          </div>

          {canSubmitExpense ? (
            <section className="border-t border-hairline pt-8">
              <p className="font-serif italic text-graphite text-sm">
                To request a vendor payment, use the <em>Request Payment</em> tab. To bill a
                subsidiary, use <em>Request Credit</em>.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {activeTab === 'history' ? (
        <HistoryTable deptId={marketing.id} filter={historyFilter} />
      ) : null}

      {activeTab === 'pnl' ? (
        <MarketingPnlView deptId={marketing.id} period={period} />
      ) : null}

      {activeTab === 'request-payment' && canSubmitExpense ? (
        <RequestPaymentTabContent deptId={marketing.id} />
      ) : null}

      {activeTab === 'request-credit' && canSubmitExpense ? (
        <RequestCreditTabContent deptId={marketing.id} />
      ) : null}
    </div>
  )
}

async function RequestCreditTabContent({ deptId }: { deptId: string }) {
  const supabase = await createClient()
  const [{ data: subsidiaries }, { data: requests }] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase
      .from('invoice_submission_requests')
      .select('id, requested_at, period_month, description, line_items, status, generated_invoice_ids')
      .eq('department_id', deptId)
      .in('status', ['pending', 'rejected'])
      .order('requested_at', { ascending: false })
      .limit(20),
  ])

  const STATUS_LABEL: Record<string, string> = {
    pending: 'Awaiting Finance',
    rejected: 'Rejected — re-submit',
    generated: 'Generated',
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-serif text-xl text-ink mb-1">New invoice request</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Submits a draft invoice to Finance for generation. One row per subsidiary becomes one
          invoice. Marketing pool credits when the subsidiary settles the invoice.
        </p>
        <RequestCreditForm subsidiaries={subsidiaries ?? []} />
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink mb-1">Recent requests</h2>
        {(requests ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No invoice requests yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Submitted</th>
                  <th className="text-left py-3 pr-4 font-medium">Period</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-left py-3 pr-4 font-medium">Lines</th>
                  <th className="text-left py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(requests ?? []).map((r) => {
                  const lineCount = Array.isArray(r.line_items) ? r.line_items.length : 0
                  return (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {dayjs(r.requested_at).format('D MMM HH:mm')}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-graphite">
                        {dayjs(r.period_month).format('MMM YYYY')}
                      </td>
                      <td className="py-3 pr-4 font-serif italic text-graphite">{r.description}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-graphite">{lineCount}</td>
                      <td className="py-3">
                        <span
                          className={
                            r.status === 'rejected'
                              ? 'text-xs font-serif italic text-danger'
                              : 'text-xs font-serif italic text-accent'
                          }
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

async function RequestPaymentTabContent({ deptId }: { deptId: string }) {
  const supabase = await createClient()
  const [{ data: companies }, { data: categories }, { data: requests }] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('payment_categories').select('code, label').eq('is_active', true).order('sort_order'),
    supabase
      .from('dept_payment_requests')
      .select('id, amount, payee_name, description, status, requested_at, pv_id')
      .eq('department_id', deptId)
      .in('status', [
        'pending_principal_expense',
        'pending_finance_pv',
        'pending_principal_pv',
      ])
      .order('requested_at', { ascending: false }),
  ])

  const STATUS_LABEL: Record<string, string> = {
    pending_principal_expense: 'Awaiting Principal',
    pending_finance_pv: 'Awaiting Finance PV',
    pending_principal_pv: 'Awaiting Principal PV',
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-serif text-xl text-ink mb-1">New request</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Submits to Principal for expense approval, then to Finance to generate the PV, then back
          to Principal to approve the PV. Pool is debited at Principal sign-off; cash leaves the
          bank when the PV is approved + executed.
        </p>
        <RequestPaymentForm companies={companies ?? []} categories={categories ?? []} />
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink mb-1">In flight</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Submitted requests that haven&rsquo;t completed yet.
        </p>
        {(requests ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No requests in flight.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Submitted</th>
                  <th className="text-left py-3 pr-4 font-medium">Payee</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-left py-3 pr-4 font-medium">Status</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(requests ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {dayjs(r.requested_at).format('D MMM HH:mm')}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">{r.payee_name}</td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">{r.description}</td>
                    <td className="py-3 pr-4">
                      <span className="text-xs font-serif italic text-accent">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(Number(r.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
