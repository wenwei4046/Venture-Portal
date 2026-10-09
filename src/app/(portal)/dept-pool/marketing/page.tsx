import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import DeptPoolTabs from '../_components/DeptPoolTabs'
import HistoryTable from '../_components/HistoryTable'
import MarketingPnlView from '../_components/MarketingPnlView'
import RequestPaymentForm from '../_components/RequestPaymentForm'
import RequestCreditForm from '../_components/RequestCreditForm'
import StageBadge from '../_components/StageBadge'
import LedgerRow from '@/components/LedgerRow'
import { ownDepartmentOnly, raisesDepartmentRequests } from '@/lib/surfaces'

interface Props {
  searchParams: Promise<{ tab?: string; filter?: string }>
}

export default async function MarketingDeptPoolPage({ searchParams }: Props) {
  const user = await requirePermission('dept_pool')
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
  if (ownDepartmentOnly(user, 'dept_pool') && user.department_id !== marketing.id) {
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
  const canSubmitExpense = raisesDepartmentRequests(user) && user.department_id === marketing.id

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Dept Pools
      </Link>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · MARKETING POOL · {dayjs(period).format('MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Marketing</h1>
        </div>
      </div>

      <DeptPoolTabs
        basePath="/dept-pool/marketing"
        raisesRequests={raisesDepartmentRequests(user)}
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
              <div className={`statement-amount ${balance < 0 ? 'text-danger' : 'text-num-ink'}`}>
                {formatMoney(balance)}
              </div>
              <div className="font-mono text-xs text-muted mt-2">
                {balance === 0
                  ? 'No NP or expenses booked yet'
                  : 'Running balance — see History tab for full ledger'}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <em className="font-serif text-graphite text-md">Revenue</em>
                <span className="num">{formatMoney(np.revenue)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <em className="font-serif text-graphite text-md">Staff cost</em>
                <span className="num">{formatMoney(-np.staff_cost)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <em className="font-serif text-graphite text-md">Dept expenses</em>
                <span className="num">{formatMoney(-np.expenses)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm border-t border-hairline pt-2 mt-2">
                <em className="font-serif text-ink text-md">Net profit</em>
                <span className={`num text-md ${np.net_profit < 0 ? 'neg' : 'text-num-ink'}`}>
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
        <HistoryTable deptId={marketing.id} filter={historyFilter} seesPayroll={canSeePayrollPayouts(user)} />
      ) : null}

      {activeTab === 'pnl' ? (
        <MarketingPnlView deptId={marketing.id} period={period} seesPayroll={canSeePayrollPayouts(user)} />
      ) : null}

      {activeTab === 'request-payment' && canSubmitExpense ? (
        <RequestPaymentTabContent deptId={marketing.id} balance={balance} />
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
        <div className="sect-head">
          <h2>New invoice request</h2>
          <span className="rule" aria-hidden />
          <span className="count">DRAFT · ONE ROW PER SUBSIDIARY</span>
        </div>
        <RequestCreditForm subsidiaries={subsidiaries ?? []} />
      </section>

      <section>
        <div className="sect-head">
          <h2>Recent requests</h2>
          <span className="rule" aria-hidden />
          <span className="count">{(requests ?? []).length} REQUEST{(requests ?? []).length === 1 ? '' : 'S'} · LATEST 20</span>
        </div>
        {(requests ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No invoice requests yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th className="m-hide">Period</th>
                  <th className="m-hide">Description</th>
                  <th className="right m-hide">Lines</th>
                  <th>Status</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {(requests ?? []).map((r) => {
                  const lineCount = Array.isArray(r.line_items) ? r.line_items.length : 0
                  return (
                    <LedgerRow key={r.id}>
                      <td>
                        <div className="font-mono text-xs text-muted">
                          {officeTime(r.requested_at).format('D MMM HH:mm')}
                        </div>
                      </td>
                      <td className="m-hide" data-label="Period">
                        <div className="font-mono text-xs text-graphite">
                          {dayjs(r.period_month).format('MMM YYYY')}
                        </div>
                      </td>
                      <td className="m-hide" data-label="Description">
                        <div className="font-serif italic text-graphite">{r.description}</div>
                      </td>
                      <td className="num text-graphite m-hide" data-label="Lines">{lineCount}</td>
                      <td>
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
                    </LedgerRow>
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

async function RequestPaymentTabContent({
  deptId,
  balance,
}: {
  deptId: string
  balance: number
}) {
  const supabase = await createClient()
  const [{ data: companies }, { data: coaRows }, { data: requests }, { data: inflightRows }] = await Promise.all([
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    // Post-mig 238: payment_categories is gone. Pull expense/cost accounts
    // from chart_of_accounts for the dept-pool payment-request category picker.
    supabase
      .from('chart_of_accounts')
      .select('code, name, type')
      .in('type', ['expense', 'cost'])
      .eq('is_active', true)
      .order('code'),
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
    // P0-3: compute in-flight total to mirror what the RPC uses for available balance.
    supabase
      .from('dept_payment_requests')
      .select('amount')
      .eq('department_id', deptId)
      .eq('status', 'pending_principal_expense'),
  ])

  const inflight = (inflightRows ?? []).reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0,
  )
  const available = balance - inflight

  return (
    <div className="space-y-10">
      <section>
        <div className="sect-head">
          <h2>New request</h2>
          <span className="rule" aria-hidden />
          <span className="count">PRINCIPAL → FINANCE → PRINCIPAL · 3-STAGE FLOW</span>
        </div>
        <RequestPaymentForm
          companies={companies ?? []}
          categories={(coaRows ?? []).map((c) => ({ code: c.code, label: c.name }))}
          availableBalance={available}
        />
      </section>

      <section>
        <div className="sect-head">
          <h2>In flight</h2>
          <span className="rule" aria-hidden />
          <span className="count">{(requests ?? []).length} REQUEST{(requests ?? []).length === 1 ? '' : 'S'} · NOT YET COMPLETED</span>
        </div>
        {(requests ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">No requests in flight.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th className="m-hide">Payee</th>
                  <th className="m-hide">Description</th>
                  <th className="m-hide">Stage</th>
                  <th className="right">Amount</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {(requests ?? []).map((r) => (
                  <LedgerRow key={r.id}>
                    <td>
                      <div className="font-mono text-xs text-muted">
                        {officeTime(r.requested_at).format('D MMM HH:mm')}
                      </div>
                    </td>
                    <td className="m-hide" data-label="Payee">
                      <div className="font-serif italic text-graphite">{r.payee_name}</div>
                    </td>
                    <td className="m-hide" data-label="Description">
                      <div className="font-serif italic text-graphite">{r.description}</div>
                    </td>
                    <td className="m-hide" data-label="Stage">
                      <StageBadge status={r.status} />
                    </td>
                    <td className="num">{formatMoney(Number(r.amount))}</td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
