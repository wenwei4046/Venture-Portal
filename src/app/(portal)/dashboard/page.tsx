import Link from 'next/link'
import dayjs from 'dayjs'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeTime, officeToday } from '@/lib/office-time'
import { requireAuth } from '@/lib/auth'
import { isPrincipalView, onFinanceView } from '@/lib/finance-view'
import { REVENUE_SUB_COOKIE } from '@/lib/hr-view'
import { canAccessRevenue } from '@/lib/roles'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts } from '@/lib/dept-statements'
import { readsDeptStatements, revenueNavData, revenueSubsOf, type NavData } from '@/components/layout/nav-config'
import { listSubDepartments } from '../revenue/_lib/sub-departments'
import FinanceOverview from './_components/FinanceOverview'
import HrOverview from './_components/HrOverview'
import { loadFinanceOverviewCounts } from './_lib/finance-overview'
import { loadPrincipalOverview } from './_lib/principal-overview'
import { loadHrOverview } from './_lib/hr-overview'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { resolveLiveApprovalAmounts, type ApprovalAmountRow } from '@/lib/approval-amounts'
import { startRead } from '@/lib/start-read'
import { decidesEverything, overviewFor, raisesForSignOff } from '@/lib/surfaces'
import { lensOverview } from '@/lib/view-as'
import { canDo } from '@/lib/permission-actions'
import { bookWindow, loadRepaymentBook, type BookDeal } from '@/lib/repayment-book'
import { fetchAllRows } from '@/lib/paginate'
import { fetchDeptInvoiceSettlements } from '@/lib/dept-receipt-payment'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { DecidedTable, InstalmentsTable, PendingTable, SubsidiariesTable } from './_components/OverviewTables'
import { KpiCard, KpiCards, netTone } from './_components/KpiCards'
import { RequestChip } from './_components/cells'

// Always re-fetch on request — dept pool balances change after every approve
// & pay, so cached renders go stale within seconds.
export const dynamic = 'force-dynamic'

// The Overview sits on the white sheet (DESIGN.md › "Sheet theme",
// lib/sheet-routes.ts) for every role at once — one route, four dashboards.
// Each opens the way every sheet page does: the page head, then summary cards
// with one walnut `primary` (the figure the dashboard is opened for), then
// tables in the month's style with a closing total in <tfoot>. Statuses are
// chips, never coloured words.

/** The sheet's two button weights, as on HR Costing. */
const PRIMARY_BUTTON =
  'inline-block bg-accent hover:bg-accent-hover text-ink text-sm font-medium px-4 py-2 rounded-control transition-colors'

/** An empty section: a quiet well that says what is missing. */
const EMPTY_WELL = 'border border-hairline rounded-card bg-surface-2 p-6 text-center'

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

// payroll_run keeps its own read-only detail page (4-OPEX drill-down) at
// /approvals/payroll-run/[ref]; everything else uses the generic
// /approvals/[id] route. NOTE: payroll_run no longer enters the live approval
// queue (submit creates the run already-approved), so this branch only fires
// for legacy/read-only deep-links — the /approvals/page.tsx helper dropped it.
function approvalHref(req: {
  id: string
  request_type: string
  reference_id?: string | null
}): string {
  if (req.request_type === 'payroll_run' && req.reference_id) {
    return `/approvals/payroll-run/${req.reference_id}`
  }
  return `/approvals/${req.id}`
}

type Alert = {
  /** Not sent by dashboard_summary() today — only severity and message. */
  type?: 'overdue' | 'buffer' | 'maturity'
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

type PoolBreakdown = {
  fund_sources: number
  dept_pool: number
  venture_pool: number
  total: number
}

type FundSourceBreakdownItem = {
  source_type: string
  count: number
  amount: number
}

type DeptPoolBreakdownItem = {
  department_id: string
  department_name: string
  balance: number
}

type DashboardSummary = {
  role: 'principal' | 'finance' | 'hr' | 'dept_manager'
  total_pool: number
  fund_sources_total: number
  loans_outstanding: number
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
  // Phase 4 extensions
  pool_breakdown: PoolBreakdown
  fund_source_breakdown: FundSourceBreakdownItem[]
  dept_pool_breakdown: DeptPoolBreakdownItem[]
}

export default async function DashboardPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  // Which Overview, read off the viewer's own cells (2026-10-09, Q7 — it was
  // the account's kind, so a Director's title holding Treasury · View drew
  // the "Principal and Finance only" well): treasury for whoever reads the
  // treasury, HR's for whoever reads payroll, a department's for whoever reads
  // their own department's pool (lib/surfaces.ts). App-layer, so the
  // Principal's view-as mask is honoured — the masked account's actions.
  // HR's and Finance's views are lenses over the account's own power (2026-10-11):
  // the view picks the Overview, never the account's cells.
  const overview = lensOverview(user) ?? overviewFor(user)

  // Finance's view opens on its own Overview (2026-10-14, the Finance revamp
  // v2 — D01): the greeting, what waits, the quick actions, the categories.
  // The Principal's own view too since 2026-10-17 (the user: "the same totally
  // view with finance"), with what waits for its decision and a row of the
  // treasury's figures (`loadPrincipalOverview`); the treasury dashboard below
  // is left to whoever reads the treasury off Finance's view.
  if (overview === 'treasury' && onFinanceView(user)) {
    const navData: NavData = { revenueSubDepts: [], ...(readsDeptStatements(user) ? { deptPoolDepts: statementDepts(primedRegistryRows()) } : {}) }
    const principalRead = isPrincipalView(user) ? startRead(loadPrincipalOverview(supabase as unknown as SupabaseClient, user)) : null
    const counts = await loadFinanceOverviewCounts(supabase as unknown as SupabaseClient, user)
    const principal = principalRead ? await principalRead : null
    return <FinanceOverview user={user} navData={navData} counts={counts} principal={principal} />
  }
  // HR's Overview (2026-10-14, the same handoff's H01): Finance's layout for HR's view.
  if (overview === 'hr') {
    const [data, revenueSub] = await Promise.all([
      loadHrOverview(supabase as unknown as SupabaseClient, user),
      (async () => {
        if (!canAccessRevenue(user)) return null
        const [subs, jar] = await Promise.all([listSubDepartments(), cookies()])
        // Each Revenue page's own, of those the viewer reaches there (2026-10-16).
        return revenueSubsOf(revenueNavData(subs, user.reach, jar.get(REVENUE_SUB_COOKIE)?.value))
      })(),
    ])
    return <HrOverview user={user} data={data} revenueSub={revenueSub} />
  }

  const roleDashboard = overview !== 'treasury'

  // Inside the treasury Overview: the sign-off queue for whoever approves
  // everything, Finance's own queues for whoever raises what somebody else
  // signs off.
  const isPrincipal = decidesEverything(user)
  const isFinance = raisesForSignOff(user)

  // ── The treasury dashboard's reads, started together (2026-10-08) ──────
  // The bank accounts and Finance's two queues need nothing from
  // dashboard_summary, yet waited for it and then for one another. They are
  // asked beside it now, each queue's live amounts the moment its rows are in;
  // only the Principal's approval refs wait for the summary, which names the
  // approvals. Each answer is used below, where it always was.
  const summaryRead = roleDashboard ? null : startRead(supabase.rpc('dashboard_summary'))
  // Bank accounts (Phase 4: direct query, RLS-gated)
  const bankAccountsRead = roleDashboard
    ? null
    : startRead(
        supabase
          .from('bank_accounts')
          .select('id, bank_name, account_number, current_balance, is_primary, status')
          .eq('status', 'active')
          .order('is_primary', { ascending: false }),
      )
  // Every live deal's repayment plan (2026-10-09, the handoff's "Overdue
  // instalments" and "Coming up"), asked beside the summary. A read that fails
  // leaves those two sections empty rather than the Overview down.
  const bookRead = roleDashboard
    ? null
    : startRead(loadRepaymentBook(supabase, officeToday()).catch((): BookDeal[] => []))
  // An approval queue and the live amount of each of its rows — read through
  // to the target row (lib/approval-amounts.ts).
  const withLiveAmounts = <R extends ApprovalAmountRow>(queue: PromiseLike<{ data: R[] | null }>) =>
    startRead(
      Promise.resolve(queue).then(async ({ data }) => ({
        rows: data,
        live: await resolveLiveApprovalAmounts(supabase, data ?? []),
      })),
    )
  // Finance sees "Awaiting Principal sign-off" — their own submitted approval_requests
  // (new_loan, new_contract, advance, etc) still pending Principal decision. This is
  // the mirror image of Principal's "Pending your hand" — Finance submits, Principal
  // approves, each sees their own queue on the dashboard.
  const financePendingRead =
    !roleDashboard && isFinance
      ? withLiveAmounts(
          supabase
            .from('approval_requests')
            .select('id, request_type, description, amount, reference_id, reference_table, created_at')
            .eq('submitted_by', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10),
        )
      : null
  // Finance sees "Recent actions" — their submitted requests that have been decided
  const financeRecentRead =
    !roleDashboard && isFinance
      ? withLiveAmounts(
          supabase
            .from('approval_requests')
            .select('id, request_type, description, amount, reference_id, reference_table, status, approved_at, created_at')
            .eq('submitted_by', user.id)
            .in('status', ['approved', 'rejected'])
            .order('approved_at', { ascending: false })
            .limit(5),
        )
      : null

  const { data: raw, error } = summaryRead
    ? await summaryRead
    : { data: null, error: null }
  if (error) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> OVERVIEW
            </div>
            <h1 className="page-title">Overview</h1>
          </div>
        </div>
        <div className="sheet-danger">
          <p className="font-medium">Failed to load the dashboard.</p>
          <p className="font-mono text-xs mt-1">{error.message}</p>
        </div>
      </div>
    )
  }

  // The RPC also returns { error: 'Access denied' } for a real HR/dept_manager
  // session (not a Supabase error) — kept as a belt-and-braces fallback.
  if (roleDashboard || (raw && typeof raw === 'object' && 'error' in raw && (raw as Record<string, unknown>).error === 'Access denied')) {
    if (overview === 'department') {
      // Dept Manager Dashboard — shows the manager's own department pool
      // state + their submitted expense requests awaiting Principal sign-off.
      if (!user.department_id) {
        return <UnplacedDashboard message="No department assigned. Contact Principal to set this up." />
      }

      const period = officeTime().startOf('month').format('YYYY-MM-DD')

      const { data: dept } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', user.department_id)
        .single()

      if (!dept) {
        return <UnplacedDashboard message="Department not found." />
      }

      const [
        { data: npData },
        { data: balanceRow },
        { data: pendingSubmissions },
        { data: recentExpenses },
        { data: dmInvoices },
        { data: dmSettlements },
      ] = await Promise.all([
        supabase.rpc('calculate_dept_np', { p_dept_id: dept.id, p_period: period }),
        supabase.from('dept_pool_balances').select('balance').eq('department_id', dept.id).maybeSingle(),
        supabase
          .from('approval_requests')
          .select('id, request_type, description, amount, reference_id, reference_table, created_at')
          .eq('submitted_by', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('dept_pools')
          .select('id, amount, description, created_at')
          .eq('department_id', dept.id)
          .eq('transaction_type', 'expense_out')
          .order('created_at', { ascending: false })
          .limit(5),
        // My Billing cards (2026-08-20): own-segment invoices via RLS + the
        // receipts/CN sums RPC → 本月开单 and 未收 figures. Every one of them,
        // in 1000-row pages (2026-10-08): both are whole-history, and an
        // invoice past PostgREST's cap would silently drop out of 未收. A
        // failed read still counts as none, as before.
        fetchAllRows((lo, hi) =>
          supabase.from('invoices').select('id, total_amount, status, period_month').order('id').range(lo, hi),
        ).then((data) => ({ data }), () => ({ data: null })),
        fetchDeptInvoiceSettlements(supabase as never).then((data) => ({ data }), () => ({ data: null })),
      ])

      type NpRow = {
        out_revenue: number | string
        out_staff_cost: number | string
        out_expenses: number | string
        out_net_profit: number | string
      }
      const npRow = ((npData ?? []) as unknown as NpRow[])[0]
      const np = {
        revenue: Number(npRow?.out_revenue ?? 0),
        staff_cost: Number(npRow?.out_staff_cost ?? 0),
        expenses: Number(npRow?.out_expenses ?? 0),
        net_profit: Number(npRow?.out_net_profit ?? 0),
      }
      const balance = Number(balanceRow?.balance ?? 0)
      // Read amounts through to the target row — approval_requests.amount is a
      // stale submit-time snapshot once the request is edited (see
      // lib/approval-amounts.ts).
      const deptLive = await resolveLiveApprovalAmounts(supabase, pendingSubmissions ?? [])
      const pendingList = (pendingSubmissions ?? []).map((r) => ({
        ...r,
        amount: deptLive.get(r.id) ?? null,
      }))
      const pendingCount = pendingList.length
      const pendingTotal = pendingList.reduce((s, r) => s + Number(r.amount ?? 0), 0)
      const recentList = recentExpenses ?? []
      const deptDetailHref =
        dept.name.toLowerCase() === 'marketing' ? '/dept-pool/marketing' : '/dept-pool'

      // My Billing figures: 本月开单 (issued+paid invoices in this period) and
      // 未收 (issued balances net of receipts/approved CNs from the RPC).
      type DmInv = { id: string; total_amount: number; status: string; period_month: string }
      const dmInvList = (dmInvoices ?? []) as DmInv[]
      const dmSumById = new Map<string, { receipts: number; credits: number }>()
      for (const s of ((dmSettlements ?? []) as unknown as Array<{ invoice_id: string; receipts: number; credits: number }>)) {
        dmSumById.set(s.invoice_id, { receipts: Number(s.receipts), credits: Number(s.credits) })
      }
      const dmIssuedFamily = new Set(['issued', 'paid', 'paid_via_netting'])
      const billedThisMonth = dmInvList
        .filter((i) => dmIssuedFamily.has(i.status) && i.period_month.startsWith(dayjs(period).format('YYYY-MM')))
        .reduce((s, i) => s + Number(i.total_amount), 0)
      const dmOutstanding = dmInvList
        .filter((i) => i.status === 'issued')
        .reduce((s, i) => {
          const m = dmSumById.get(i.id)
          return s + Math.max(0, Number(i.total_amount) - (m?.receipts ?? 0) - (m?.credits ?? 0))
        }, 0)

      const monthShort = dayjs(period).format('MMM')

      return (
        <div>
          <div className="page-head">
            <div>
              <div className="page-eyebrow">
                <em>·</em> {dept.name.toUpperCase()} · OVERVIEW · {dayjs(period).format('MMMM YYYY').toUpperCase()}
              </div>
              <h1 className="page-title">{dept.name} Department</h1>
            </div>
          </div>

          {/* The department's month in six figures. The pool balance is what
              the page is opened for — walnut, or red while it is below zero. */}
          <StatCards label={`${dept.name} department this month`}>
            <StatCard
              label="Pool balance"
              value={formatMoney(balance)}
              icon="wallet"
              tone={balance < 0 ? 'danger' : 'primary'}
              note="Running NP − approved expenses"
            />
            <StatCard
              label={`Revenue ${monthShort}`}
              value={formatMoney(np.revenue)}
              icon="trend"
              note="From approved project invoices"
            />
            <StatCard
              label="This month NP"
              value={formatMoney(np.net_profit)}
              icon="chart"
              tone={np.net_profit < 0 ? 'danger' : 'default'}
              note="Revenue − staff cost − expenses"
            />
            <StatCard
              label="Awaiting Principal"
              value={String(pendingCount)}
              icon="clock"
              tone={pendingCount > 0 ? 'alert' : 'default'}
              note={pendingCount > 0 ? `${formatMoney(pendingTotal)} total` : 'Nothing waiting'}
            />
            <StatCard
              label={`本月开单 Billed ${monthShort}`}
              value={formatMoney(billedThisMonth)}
              icon="receipt"
              href="/my-billing"
              note="My Billing"
            />
            <StatCard
              label="未收 To collect"
              value={formatMoney(dmOutstanding)}
              icon="inbox"
              tone={dmOutstanding > 0 ? 'alert' : 'default'}
              note="Issued invoices net of receipts / CN"
            />
          </StatCards>

          {/* Your submissions awaiting Principal sign-off */}
          <section className="mb-10">
            <div className="sect-head">
              <h2>Awaiting Principal sign-off</h2>
              <span className="rule" aria-hidden />
              <span className="count">{pendingCount} REQUEST{pendingCount === 1 ? '' : 'S'} · POSTS TO POOL ONCE APPROVED</span>
            </div>
            {pendingCount === 0 ? (
              <div className={EMPTY_WELL}>
                <p className="text-sm font-medium">All caught up.</p>
                <p className="text-xs mt-1">Nothing waiting on Principal.</p>
              </div>
            ) : (
              <div className="table-frame">
                <div className="table-frame-scroll">
                  <table className="ledger-table [&_td.num]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="m-hide">Request</th>
                        <th className="right">Amount</th>
                        <th className="right m-hide">Submitted</th>
                        <th className="lt-toggle" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {pendingList.slice(0, 5).map((r) => (
                        <LedgerRow key={r.id}>
                          <td>
                            <Link href={deptDetailHref}>{r.description ?? '—'}</Link>
                          </td>
                          <td className="m-hide" data-label="Request">
                            <RequestChip type={r.request_type} />
                          </td>
                          <td className="num">{formatMoney(Number(r.amount))}</td>
                          <td className="right m-hide font-mono text-xs" data-label="Submitted">
                            {officeTime(r.created_at).format('D MMM')}
                          </td>
                        </LedgerRow>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pendingList.length > 5 ? (
                  <div className="table-frame-foot">
                    <span>Showing 5 of {pendingList.length}</span>
                    <Link href={deptDetailHref} className="underline underline-offset-4">
                      See all {pendingList.length} →
                    </Link>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* Recent approved expenses */}
          <section className="mb-10">
            <div className="sect-head">
              <h2>Recent approved</h2>
              <span className="rule" aria-hidden />
              <span className="count">LAST {Math.min(5, recentList.length || 5)} · POSTED TO POOL</span>
            </div>
            {recentList.length === 0 ? (
              <div className={EMPTY_WELL}>
                <p className="text-sm">No approved expenses yet.</p>
                <Link href={deptDetailHref} className="inline-block text-sm underline underline-offset-4 mt-2">
                  See full pool →
                </Link>
              </div>
            ) : (
              <div className="table-frame">
                <div className="table-frame-scroll">
                  <table className="ledger-table [&_td.num]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="right">Amount</th>
                        <th className="right">Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentList.map((e) => (
                        <tr key={e.id}>
                          <td>{e.description ?? '—'}</td>
                          <td className="num">
                            <span className="neg">{formatMoney(-Number(e.amount))}</span>
                          </td>
                          <td className="right font-mono text-xs whitespace-nowrap">
                            {officeTime(e.created_at).format('D MMM YYYY')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-frame-foot">
                  <span>Posted to the {dept.name} pool</span>
                  <Link href={deptDetailHref} className="underline underline-offset-4">
                    See full pool →
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      )
    }

    // Nobody's Overview of their own: no treasury, payroll or department pool
    // among their cells (an Executive office, Staff · Basic).
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>·</em> OVERVIEW
            </div>
            <h1 className="page-title">Dashboard</h1>
          </div>
        </div>
        <div className={EMPTY_WELL}>
          <p className="text-sm font-medium">Your title opens no treasury, payroll or department figures to sum up here.</p>
          <p className="text-xs mt-1">Use the sidebar to open your modules.</p>
        </div>
      </div>
    )
  }

  const summary = raw as unknown as DashboardSummary
  const today = officeTime().format('D MMMM YYYY')

  const pendingApprovals = summary.pending_approvals ?? []

  // dashboard_summary RPC doesn't return reference_id for pending approvals.
  // Supplementary query so Overview links can deep-link to /approvals/payroll-run/[ref]
  // the same way the Approvals tab does. It also carries the amount through to
  // the target row — the RPC hands back approval_requests.amount, a submit-time
  // snapshot that goes stale the moment the request is edited (see
  // lib/approval-amounts.ts). Asked the moment the summary is in, while the
  // reads begun beside it finish.
  const approvalRefsRead =
    isPrincipal && pendingApprovals.length > 0
      ? withLiveAmounts(
          supabase
            .from('approval_requests')
            .select('id, amount, reference_id, reference_table')
            .in(
              'id',
              pendingApprovals.map((p: PendingApproval) => p.id),
            ),
        )
      : null

  // Bank accounts (Phase 4: direct query, RLS-gated) — asked beside the summary.
  const { data: bankAccounts } = bankAccountsRead ? await bankAccountsRead : { data: null }
  const banks = bankAccounts ?? []
  const totalBankBalance = banks.reduce((sum, b) => sum + Number(b.current_balance), 0)

  const hasAnyData =
    summary.total_pool > 0 || summary.loans_outstanding > 0

  const pendingCount = summary.pending_approvals_count ?? 0
  const subsidiaries = summary.subsidiaries ?? []
  const summaryAlerts = summary.alerts ?? []

  const pendingApprovalRefs = new Map<string, string | null>()
  const pendingApprovalAmounts = new Map<string, number | null>()
  if (approvalRefsRead) {
    const { rows: refData, live } = await approvalRefsRead
    for (const row of refData ?? []) {
      pendingApprovalRefs.set(row.id, row.reference_id as string | null)
    }
    for (const [id, amt] of live) pendingApprovalAmounts.set(id, amt)
  }

  // Finance's two queues (read above, beside the summary). No queue — any
  // other role — reads as an empty one, exactly as before.
  const noQueue = { rows: null, live: new Map<string, number | null>() }
  const { rows: financePending, live: financePendingLive } = financePendingRead
    ? await financePendingRead
    : noQueue
  const financePendingList = (financePending ?? []).map((r) => ({
    ...r,
    amount: financePendingLive.get(r.id) ?? null,
  }))

  const { rows: financeRecent, live: financeRecentLive } = financeRecentRead
    ? await financeRecentRead
    : noQueue
  const financeRecentList = (financeRecent ?? []).map((r) => ({
    ...r,
    amount: financeRecentLive.get(r.id) ?? null,
  }))

  // Where the margin panel stood before: beside the hero for anybody but the
  // Principal, and below it for the Principal once there is money to measure.
  const showMargin = !isPrincipal || hasAnyData
  const hvBalance = Number(summary.hv_fund_balance ?? 0)

  // The head and the book around today (2026-10-09, the handoff): Daily Bank
  // for whoever reads the treasury, Record payment for whoever raises a
  // voucher (the Payments page's own test), and the installments behind and
  // coming up from every live deal's plan. Whoever may record a payment may
  // also set the Overview tables' arrangement as everyone's default, as on
  // Fund IN / OUT (2026-10-10).
  const monthTitle = officeTime().format('MMMM YYYY')
  const canRecordPayment = canDo(user, 'treasury', 'create')
  const book = bookWindow(bookRead ? await bookRead : [], officeToday())
  // A company is overdue when one of its loans has an instalment past its day
  // unpaid (2026-10-12) — the book, as the Overdue page reads it; no longer
  // the records Detect overdue wrote (dashboard_summary's has_overdue).
  const overdueCompanies = new Set(book.overdue.filter((e) => e.kind === 'collect' && e.companyId).map((e) => e.companyId as string))
  // …and so is the overdue alert: the loans with an instalment past its day,
  // in place of the summary's count of those records.
  const overdueLoans = new Set(book.overdue.filter((e) => e.kind === 'collect').map((e) => e.id)).size
  const alerts: Alert[] = [
    ...(overdueLoans > 0
      ? [{ severity: 'warning' as const, message: `Overdue: ${overdueLoans} ${overdueLoans === 1 ? 'loan' : 'loans'} with an instalment past its day` }]
      : []),
    ...summaryAlerts.filter((a) => !a.message.startsWith('Overdue: ')),
  ]

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> OVERVIEW · TREASURY · {monthTitle.toUpperCase()}
          </div>
          <h1 className="page-title">Overview</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canRecordPayment ? (
            <>
              {/* 2026-10-10 — the handoff: a phone's head keeps only the
                  primary action. A wrapper, since .btn-quiet-sheet's own
                  display would out-rank a utility on the link itself. */}
              <span className="hidden md:inline-flex">
                <Link href="/daily-bank" className="btn-quiet-sheet">
                  Daily Bank
                </Link>
              </span>
              <Link href="/payments/new" className="btn-pri-sheet">
                Record payment
              </Link>
            </>
          ) : (
            // The head's only action stays on a phone too.
            <Link href="/daily-bank" className="btn-quiet-sheet">
              Daily Bank
            </Link>
          )}
        </div>
      </div>

      {/* ───────── The treasury in four figures ─────────
          The Venture Pool was the page's walnut hero; on the sheet it is the
          one walnut card, with the pool and what is lent out beside it and the
          queue that waits on somebody's hand. */}
      <StatCards label={`Treasury as of ${today}`}>
        <StatCard
          label="Venture Pool"
          value={hasAnyData ? formatMoney(hvBalance) : '—'}
          icon="wallet"
          tone={hasAnyData && hvBalance < 0 ? 'danger' : 'primary'}
          note={hasAnyData ? `As of ${today} · live ledger` : 'No fund sources yet'}
        />
        <StatCard
          label="Pool"
          value={hasAnyData ? formatMoney(summary.total_pool) : '—'}
          icon="layers"
          note="Dept pools + Venture Pool"
        />
        <StatCard
          label="Lent out"
          value={hasAnyData ? formatMoney(summary.loans_outstanding) : '—'}
          icon="send"
          note="Loans outstanding"
        />
        {isPrincipal ? (
          <StatCard
            label="Pending your hand"
            value={String(pendingCount)}
            icon="inbox"
            tone={pendingCount > 0 ? 'wait' : 'default'}
            href="/approvals"
            note={pendingCount === 0 ? 'All caught up' : `${pendingCount === 1 ? 'Approval' : 'Approvals'} waiting`}
          />
        ) : (
          <StatCard
            label="Awaiting Principal"
            value={String(financePendingList.length)}
            icon="clock"
            tone={financePendingList.length > 0 ? 'wait' : 'default'}
            note={financePendingList.length === 0 ? 'Nothing waiting on Principal' : 'Your requests, not yet decided'}
          />
        )}
      </StatCards>

      {hasAnyData ? (
        summary.pool_breakdown ? (
          <details className="fin-fold">
            <summary>Pool breakdown</summary>
            <div className="fin-fold-inner grid grid-cols-1 lg:grid-cols-3 gap-x-7 gap-y-6">
              {/* The three sources, side by side. They are not added up
                  here: the pool is the dept pools plus the Venture Pool, and
                  the fund sources are what fed them. 2026-10-10 — the
                  handoff: each table under its own title, its first column
                  headed for what it lists. */}
              <section className="min-w-0">
                <div className="sect-head">
                  <h2>Source</h2>
                  <span className="rule" aria-hidden />
                </div>
                <div className="overflow-x-auto">
                  <table className="ledger-table [&_td.num]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th className="right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Fund sources</td>
                        <td className="num">{formatMoney(summary.pool_breakdown.fund_sources)}</td>
                      </tr>
                      <tr>
                        <td>Dept pool</td>
                        <td className="num">{formatMoney(summary.pool_breakdown.dept_pool)}</td>
                      </tr>
                      <tr>
                        <td>Venture Pool</td>
                        <td className="num">{formatMoney(summary.pool_breakdown.venture_pool)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Fund source type breakdown */}
              {summary.fund_source_breakdown?.length > 0 ? (
                <section className="min-w-0">
                  <div className="sect-head">
                    <h2>By fund source type</h2>
                    <span className="rule" aria-hidden />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="ledger-table [&_td.num]:whitespace-nowrap">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th className="right">Count</th>
                          <th className="right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.fund_source_breakdown.map((fs) => (
                          <tr key={fs.source_type}>
                            <td className="capitalize">{fs.source_type.replace(/_/g, ' ')}</td>
                            <td className="num">{fs.count}</td>
                            <td className="num">{formatMoney(Number(fs.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {/* Dept pool by department (+ Venture from corporate+treasury GL) */}
              {(() => {
                const rows: Array<{ key: string; name: string; balance: number }> = [
                  ...(summary.dept_pool_breakdown ?? []).map((dp) => ({
                    key: dp.department_id,
                    name: dp.department_name,
                    balance: Number(dp.balance),
                  })),
                ]
                const venture = Number(summary.hv_fund_balance ?? 0)
                if (Math.abs(venture) >= 0.005) {
                  rows.push({ key: 'venture', name: 'Venture (Office)', balance: venture })
                }
                rows.sort((a, b) => b.balance - a.balance)
                if (rows.length === 0) return null
                return (
                  <section className="min-w-0">
                    <div className="sect-head">
                      <h2>Dept pool by department</h2>
                      <span className="rule" aria-hidden />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="ledger-table [&_td.num]:whitespace-nowrap">
                        <thead>
                          <tr>
                            <th>Department</th>
                            <th className="right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.key}>
                              <td>{r.name}</td>
                              <td className="num">
                                {/* Negatives red (README › Tables). */}
                                {r.balance < 0 ? <span className="neg text-danger">{formatMoney(r.balance)}</span> : formatMoney(r.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )
              })()}
            </div>
          </details>
        ) : null
      ) : (
        <div className={`${EMPTY_WELL} mb-10`}>
          <p className="text-sm">No fund sources yet. Start by recording the first one.</p>
          <Link href="/fund-in" className={`${PRIMARY_BUTTON} mt-3`}>
            Record first fund source
          </Link>
        </div>
      )}

      {/* ───────── The queue beside the margin ─────────
          Principal: what waits on their hand. Finance: what they submitted
          and what Principal decided. The margin panel on the right for both —
          the Principal's only once there is money to measure. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-2 mb-2">
        <div className={showMargin ? 'lg:col-span-7 min-w-0' : 'lg:col-span-12 min-w-0'}>
          {isPrincipal ? (
            <section className="mb-10">
              <div className="sect-head">
                <h2>Pending your hand</h2>
                <span className="rule" aria-hidden />
                <span className="count">
                  {pendingCount} {pendingCount === 1 ? 'ITEM' : 'ITEMS'}
                </span>
              </div>
              {pendingCount === 0 ? (
                <div className={EMPTY_WELL}>
                  <p className="text-sm font-medium">All caught up.</p>
                  <p className="text-xs mt-1">No approvals waiting.</p>
                </div>
              ) : (
                <>
                  {/* 2026-10-10 — the handoff: a sheet table (OverviewTables). */}
                  <PendingTable
                    canSetDefault={canRecordPayment}
                    rows={pendingApprovals.slice(0, 5).map((req) => ({
                      id: req.id,
                      href: approvalHref({
                        id: req.id,
                        request_type: req.request_type,
                        reference_id: pendingApprovalRefs.get(req.id) ?? null,
                      }),
                      description: req.description,
                      requestType: req.request_type,
                      amount: pendingApprovalAmounts.has(req.id)
                        ? (pendingApprovalAmounts.get(req.id) ?? null)
                        : req.amount == null
                          ? null
                          : Number(req.amount),
                      by: req.submitted_by_name,
                      submittedAt: req.created_at,
                    }))}
                  />
                  {pendingCount > 5 ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 px-0.5 text-[11px]">
                      <span>Showing 5 of {pendingCount}</span>
                      <Link href="/approvals" className="underline underline-offset-4">
                        See all {pendingCount} →
                      </Link>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {isFinance ? (
            <>
              {/* Awaiting Principal sign-off — Finance's own submitted
                  approval_requests (new_loan, new_contract, advance, etc)
                  still pending the Principal's decision. */}
              <section className="mb-10">
                <div className="sect-head">
                  <h2>Awaiting Principal sign-off</h2>
                  <span className="rule" aria-hidden />
                  <span className="count">
                    {financePendingList.length} {financePendingList.length === 1 ? 'ITEM' : 'ITEMS'}
                  </span>
                </div>
                {financePendingList.length === 0 ? (
                  <div className={EMPTY_WELL}>
                    <p className="text-sm font-medium">All caught up.</p>
                    <p className="text-xs mt-1">Nothing waiting on Principal.</p>
                  </div>
                ) : (
                  <div className="table-frame">
                    <div className="table-frame-scroll">
                      <table className="ledger-table [&_td.num]:whitespace-nowrap">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th className="m-hide">Request</th>
                            <th className="right">Amount</th>
                            <th className="right m-hide">Submitted</th>
                            <th className="lt-toggle" aria-hidden />
                          </tr>
                        </thead>
                        <tbody>
                          {financePendingList.slice(0, 5).map((req) => (
                            <LedgerRow key={req.id}>
                              <td>
                                <Link href={approvalHref(req)}>{req.description ?? '—'}</Link>
                              </td>
                              <td className="m-hide" data-label="Request">
                                <RequestChip type={req.request_type} />
                              </td>
                              <td className="num">
                                {req.amount != null ? formatMoney(Number(req.amount)) : '—'}
                              </td>
                              <td className="right m-hide font-mono text-xs" data-label="Submitted">
                                {officeTime(req.created_at).format('D MMM')}
                              </td>
                            </LedgerRow>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {financePendingList.length > 5 ? (
                      <div className="table-frame-foot">
                        <span>+ {financePendingList.length - 5} more pending</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>

              {/* Recent actions — their submitted requests Principal has decided */}
              <section className="mb-10">
                <div className="sect-head">
                  <h2>Recent actions</h2>
                  <span className="rule" aria-hidden />
                  <span className="count">
                    {financeRecentList.length} {financeRecentList.length === 1 ? 'ITEM' : 'ITEMS'}
                  </span>
                </div>
                {financeRecentList.length === 0 ? (
                  <div className={EMPTY_WELL}>
                    <p className="text-sm font-medium">No recent actions.</p>
                    <p className="text-xs mt-1">Decisions will appear here once Principal acts.</p>
                  </div>
                ) : (
                  // 2026-10-10 — the handoff: a sheet table (OverviewTables).
                  <DecidedTable
                    canSetDefault={canRecordPayment}
                    rows={financeRecentList.map((req) => ({
                      id: req.id,
                      href: approvalHref(req),
                      description: req.description,
                      requestType: req.request_type,
                      decision: req.status,
                      amount: req.amount != null ? Number(req.amount) : null,
                      decidedAt: req.approved_at || req.created_at,
                    }))}
                  />
                )}
              </section>
            </>
          ) : null}
        </div>

        {showMargin ? (
          <div className="lg:col-span-5 min-w-0">
            <section className="mb-10">
              <div className="sect-head">
                <h2>Margin panel</h2>
                <span className="rule" aria-hidden />
                <span className="count">MONTHLY</span>
              </div>
              <MarginPanel summary={summary} />
            </section>
            <section className="mb-10">
              <div className="sect-head">
                <h2>Interest this month</h2>
                <span className="rule" aria-hidden />
                <span className="count">{monthTitle.toUpperCase()}</span>
              </div>
              <InterestPanel summary={summary} />
            </section>
          </div>
        ) : null}
      </div>

      {/* ───────── Subsidiaries ───────── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Subsidiaries</h2>
          <span className="rule" aria-hidden />
          <span className="count">{subsidiaries.length} ENTITIES · NET POSITION TODAY</span>
        </div>

        {subsidiaries.length === 0 ? (
          <div className={EMPTY_WELL}>
            <p className="text-sm">No companies configured. Visit Settings to add subsidiaries.</p>
          </div>
        ) : (
          // 2026-10-10 — the handoff: a sheet table (OverviewTables); its
          // foot totals the companies on show.
          <SubsidiariesTable
            canSetDefault={canRecordPayment}
            rows={subsidiaries.map((sub) => ({
              id: sub.id,
              name: sub.name,
              shortCode: sub.short_code,
              savings: Number(sub.savings_deposited ?? 0),
              loans: Number(sub.loans_outstanding ?? 0),
              net: Number(sub.net_position ?? 0),
              position: sub.position,
              hasOverdue: overdueCompanies.has(sub.id),
            }))}
          />
        )}
      </section>

      {/* ───────── Alerts ─────────
          2026-10-10 — the handoff: a table, Type and Message. */}
      {alerts.length > 0 ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Alerts</h2>
            <span className="rule" aria-hidden />
            <span className="count">{alerts.length} OPEN</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Type</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert, i) => (
                  <tr key={i}>
                    <td>
                      {/* dashboard_summary() sends a severity and a message; the
                          chip names the severity when no type comes with it. */}
                      <span className={`${ALERT_CHIP[alert.severity] ?? 'chip'} whitespace-nowrap`}>
                        <span className="dot" />
                        {alert.type ?? alert.severity}
                      </span>
                    </td>
                    <td>{alert.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ───────── Phase 4 — Bank Accounts ───────── */}
      {banks.length > 0 ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Bank accounts</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {banks.length} ACTIVE
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Account number</th>
                  <th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {banks.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="font-medium">{b.bank_name}</span>
                      {b.is_primary ? <span className="chip accent ml-2">Primary</span> : null}
                    </td>
                    <td className="font-mono text-xs">{b.account_number}</td>
                    <td className="num">{formatMoney(Number(b.current_balance))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total balance</td>
                  <td>
                    {/* The footer is set in 600; the caption is not a figure. */}
                    <span className="text-xs font-normal">across all accounts</span>
                  </td>
                  <td className="num">{formatMoney(totalBankBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {/* ───────── Phase 2 — Billing + Dept Pool snapshot ─────────
          2026-10-10 — the handoff's KPI rows: plain cards (KpiCards). */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Billing &amp; dept pool</h2>
          <span className="rule" aria-hidden />
          <span className="count">THIS MONTH</span>
        </div>
        <KpiCards label="Billing and department pools">
          <KpiCard
            label="Billing float"
            value={formatMoney(Number(summary.billing_float ?? 0))}
            tone="primary"
            note="Unpaid invoices (draft + issued)"
          />
          <KpiCard
            label="Dept pool total"
            value={formatMoney(Number(summary.dept_pool_total ?? 0))}
            tone={Number(summary.dept_pool_total ?? 0) < 0 ? 'danger' : 'default'}
            note="Sum of positive dept pool balances"
          />
          <MarketingNpCard mkNp={summary.marketing_np_this_month} />
        </KpiCards>
      </section>

      {/* ───────── Phase 3 — Director Salary + Director Pool ───────── */}
      <section className="mb-4">
        <div className="sect-head">
          <h2>Director salary</h2>
          <span className="rule" aria-hidden />
          <Link href="/director-pool" className="count underline underline-offset-4">
            DIRECTOR POOL →
          </Link>
        </div>
        <KpiCards label="Director salary and pools">
          <KpiCard
            label="Director Pool"
            value={formatMoney(Number(summary.salary_pool_total ?? 0))}
            tone="primary"
            note={
              (summary.payouts_pending ?? 0) === 0
                ? 'No draft payouts'
                : `${summary.payouts_pending} draft payout${summary.payouts_pending === 1 ? '' : 's'} pending`
            }
          />
          <KpiCard
            label="Venture Pool"
            value={formatMoney(hvBalance)}
            tone={hvBalance < 0 ? 'danger' : 'default'}
            note="HV group-level running balance"
          />
          <KpiCard
            label="Director Invoice"
            value={formatMoney(Number(summary.invoice_pool_balance ?? 0))}
            note="25% director invoice accumulation"
          />
        </KpiCards>
      </section>

      {/* ───────── The book around today (2026-10-09, the handoff) ─────────
          Every live deal's installments from its repayment plan — the same
          rows as its own page's Repayment schedule: what is behind, and what
          falls due in the next 14 days with the net of it. */}
      {book.overdue.length > 0 ? (
        <section className="mb-10 mt-10">
          <div className="sect-head">
            <h2>Overdue instalments</h2>
            <span className="rule" aria-hidden />
            <span className="count">{book.overdue.length} BEHIND</span>
          </div>
          <InstalmentsTable entries={book.overdue} late canSetDefault={canRecordPayment} />
        </section>
      ) : null}
      <section className={book.overdue.length > 0 ? 'mb-4' : 'mb-4 mt-10'}>
        <div className="sect-head">
          <h2>Coming up · next 14 days</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {book.upcoming.length} {book.upcoming.length === 1 ? 'INSTALMENT' : 'INSTALMENTS'}
          </span>
        </div>
        {book.upcoming.length === 0 ? (
          <div className={EMPTY_WELL}>
            <p className="text-sm">Nothing due in the next 14 days.</p>
          </div>
        ) : (
          // Its Net is of the instalments on show (all of them until a ▽ narrows the list).
          <InstalmentsTable entries={book.upcoming} late={false} net canSetDefault={canRecordPayment} />
        )}
      </section>
    </div>
  )
}

/** Alert severity → the chip that carries it: red for overdue money, amber
 *  for a buffer or a maturity coming up, grey for anything informational. */
const ALERT_CHIP: Record<Alert['severity'], string> = {
  danger: 'chip danger',
  warning: 'chip alert',
  info: 'chip info',
}

/** A department manager the portal cannot place yet: the page head, and why. */
function UnplacedDashboard({ message }: { message: string }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>·</em> OVERVIEW
          </div>
          <h1 className="page-title">Dashboard</h1>
        </div>
      </div>
      <div className={EMPTY_WELL}>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}

// The net is a figure like any other (2026-10-10, the handoff): green as a
// profit, red as a loss.
function MarketingNpCard({ mkNp }: { mkNp: MarketingNp | undefined }) {
  const revenue = Number(mkNp?.revenue ?? 0)
  const staffCost = Number(mkNp?.staff_cost ?? 0)
  const expenses = Number(mkNp?.expenses ?? 0)
  const netProfit = Number(mkNp?.net_profit ?? 0)

  return (
    <KpiCard
      label="Marketing NP this month"
      value={formatMoney(netProfit)}
      tone={netTone(netProfit)}
      note={`Revenue ${formatMoney(revenue)} − Staff ${formatMoney(staffCost)} − Expenses ${formatMoney(expenses)}`}
    />
  )
}

// The margin: the base rate over the weighted cost of capital, closing on
// the spread — green while positive, red once it is not.
function MarginPanel({ summary }: { summary: DashboardSummary }) {
  const netSpread = summary.net_spread
  const spreadNegative = netSpread != null && netSpread < 0
  const pct = (rate: number | null) => (rate != null ? `${(rate * 100).toFixed(3)}%/mo` : '—')

  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th>Spread</th>
          <th className="right">Rate</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Weighted cost of capital</td>
          <td className="num">{pct(summary.weighted_cost_rate)}</td>
        </tr>
        <tr>
          <td>Current base rate</td>
          <td className="num">{pct(summary.current_base_rate)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>Net spread</td>
          {/* The colour rides on a span: a `.num` cell sets its own ink. */}
          <td className="num">
            <span className={spreadNegative ? 'text-danger' : 'text-ledger'}>{pct(netSpread)}</span>
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

/** The month's interest — its own panel under the margin since 2026-10-09 (the handoff). */
function InterestPanel({ summary }: { summary: DashboardSummary }) {
  const netInterest = summary.net_interest_income
  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th>Interest</th>
          <th className="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Interest income</td>
          <td className="num">{formatMoney(summary.monthly_interest_income)}</td>
        </tr>
        <tr>
          <td>Interest expense</td>
          <td className="num">
            <span className="text-danger">{formatMoney(-Math.abs(summary.monthly_interest_expense))}</span>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>Net interest</td>
          <td className="num">
            <span className={netInterest < 0 ? 'text-danger' : 'text-ledger'}>{formatMoney(netInterest)}</span>
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
