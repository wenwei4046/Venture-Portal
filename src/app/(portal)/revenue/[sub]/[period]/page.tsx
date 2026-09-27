import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { salesByFair } from '@/lib/venues'
import { agentKeyOf } from '@/lib/erp-sync/contract'
import SchemeSwitches from './_components/SchemeSwitches'
import { requireSubDepartment } from '../../_lib/sub-departments'
import { loadMonthOrders } from '../../_lib/month-orders'
import { monthCommissionableValue } from '@/lib/commission/director-pay'
import { loadMonthUpsales, loadPendingAdjustments } from '../../_lib/upsales'
import { loadCommissionWorkbench } from '../../_lib/commission-workbench'
import { loadErpFeedMonth } from '../../_lib/erp-feed-month'
import { loadOpenBillMonthSetting, resolveOpenBill } from '../../_lib/open-bill-month'
import { loadDoubleClaims } from '../../_lib/double-claims'
import { carriedFromUnpaidMonths, claimsInMonth } from '@/lib/commission/double-claims'
import CommissionWorkbench from './_components/CommissionWorkbench'
import ErpFeedChip from './_components/ErpFeedChip'
import DoubleClaimPanel from './_components/DoubleClaimPanel'
import ErpChangesPanel from './_components/ErpChangesPanel'
import FairMovesPanel from './_components/FairMovesPanel'
import { loadFairMoves } from '../../_lib/fair-calendar'
import { loadSalespersonCloses } from '../../_lib/salesperson-closes'
import workbenchStyles from './_components/commission-workbench.module.css'

interface PageProps {
  params: Promise<{ sub: string; period: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

interface RunRow {
  id: string
  status: 'draft' | 'computed' | 'applied' | 'locked'
  applied_at: string | null
}

interface BatchRow {
  id: string
  file_name: string
  source: string
  order_count: number
  out_of_period_count: number
  cancelled_count: number
  unmatched_agent_count: number
}

interface SchemeRow {
  enable_open_bill: boolean
  enable_kpi: boolean
  enable_margin_penalty: boolean
  enable_margin_incentive: boolean
}

/**
 * What the page still reads off the saved run's statements: whose they are and
 * what each came to — once the run is in payroll, that IS what payroll holds.
 */
interface StatementRow {
  id: string
  staff_id: string
  total_commission: number | string
}

/**
 * One month's commission: the ERP's bills, what the rules make of them, and
 * what of it is in payroll.
 *
 * The commission is worked out LIVE — the workbench runs the engine over the
 * month's bills every time the page opens. Payroll holds only what was SENT,
 * and the payroll bar under the month's cards says which (2026-09-27). It
 * replaced *Payroll & source tools*, a folded section at the foot of the page
 * that held the saved run, its warnings, the button that sent it (Recompute &
 * sync payroll), the Open Bill cost and the upsales HR typed by hand: the
 * live figure read as money already in payroll — September had never been
 * sent — and every drop and upsell now comes from the ERP (user 2026-09-27).
 *
 * ONE RAIL AT THE TOP (2026-09-26): the workbench's tabs — Total Sales
 * Orders, KPI Items, Open Bill, Below deposit and Sales by venue — are every
 * cut of the month's bills, in one table design.
 */
export default async function CommissionPeriodPage({ params }: PageProps) {
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  // In flight while the permission is checked; only awaited once it passes,
  // so a reader without it is redirected, never shown a 404.
  const subDeptLookup = requireSubDepartment(sub)
  subDeptLookup.catch(() => {})
  await requirePermission('revenue')
  const subDept = await subDeptLookup
  const supabase = (await createClient()) as unknown as SupabaseClient

  // ── Every read the month needs, started at once (2026-09-26) ───────────
  // One after another they were twenty-odd round trips before the first byte
  // of the page; opening a month took 3–10 s. Only what truly depends on an
  // earlier answer waits for it: the statements on the run, the workbench on
  // the month's orders and the run.
  //
  // `once` pins a query to a single request: a PostgREST builder sends its
  // request again every time something awaits it, and several reads below
  // hang off the same one.
  const once = <T,>(query: PromiseLike<T>): Promise<T> => Promise.resolve(query)

  const batchRowRead = once(
    supabase
      .from('sales_import_batches')
      .select('id, file_name, source, order_count, out_of_period_count, cancelled_count, unmatched_agent_count, created_at')
      .eq('period_month', period)
      .eq('sub_department_id', subDept.id)
      .eq('status', 'committed')
      .maybeSingle(),
  ).then(({ data }) => data as BatchRow | null)

  // One RPC for the whole month rather than a select per fact. The LINES in
  // particular cannot be read from the page: a Fair month has ~1,700 of them
  // and PostgREST hands back the first thousand without saying so, which is
  // how "lines without a cost" used to under-report by a third. Asked beside
  // the batch rather than after it: a month with no import answers nothing.
  const monthOrdersRead = Promise.all([batchRowRead, loadMonthOrders(supabase, subDept.id, period)])
    .then(([batchRow, rows]) => (batchRow ? rows : []))

  // The switches this month pays under are a scheme setting, so THIS sub-department's.
  const schemeRead = subDept.schemeId
    ? once(
        supabase
          .from('comm_schemes')
          .select('enable_open_bill, enable_kpi, enable_margin_penalty, enable_margin_incentive')
          .eq('id', subDept.schemeId)
          .maybeSingle(),
      ).then(({ data }) => data as SchemeRow | null)
    : Promise.resolve(null)

  // One run per sub-department per month (uq_comm_run_per_sub_dept_period):
  // the batch above is the whole department's, this is only ours.
  const runRead = once(
    supabase
      .from('comm_runs')
      .select('id, status, applied_at')
      .eq('period_month', period)
      .eq('sub_department_id', subDept.id)
      .maybeSingle(),
  ).then(({ data }) => data as RunRow | null)

  const statementsRead = runRead.then(async run => {
    if (!run) return [] as StatementRow[]
    const { data } = await supabase
      .from('comm_statements')
      .select('id, staff_id, total_commission')
      .eq('run_id', run.id)
    return (data ?? []) as unknown as StatementRow[]
  })

  // Whether THIS month pays Open Bill: its own setting over Rules (2026-09-26 —
  // on for August, which the claim form paid; September follows Rules).
  const openBillMonthRead = Promise.all([
    schemeRead,
    subDept.schemeId ? loadOpenBillMonthSetting(supabase, subDept.id, period) : Promise.resolve(null),
  ]).then(([scheme, month]) => resolveOpenBill(Boolean(scheme?.enable_open_bill), month))

  // Can the month's payroll still take commission? Asked of the same guard the
  // send uses, so the bar can say so before anybody clicks. Unanswerable (the
  // function not there yet, say) = assume it can: the send will say if not.
  const payrollClosedRead = once(supabase.rpc('commission_payroll_closed', { p_period: period }))
    .then(({ data, error }) => (error ? null : (data as string | null)))

  // The month's workbench starts the moment its own inputs are in, not after
  // everything else on the page.
  const workbenchRead = Promise.all([batchRowRead, monthOrdersRead, runRead]).then(([batchRow, rows, run]) =>
    batchRow && subDept.schemeId ? loadCommissionWorkbench(supabase, subDept.id, period, rows, run?.id) : null,
  )

  // Which EARLIER months' bills can no longer be taken out (2026-09-27): a
  // salesperson's ledger carries bills in from them, and their menu answers
  // to the bill's own month — `revenue_exclude_order` refuses a paid one
  // (23RUN). This month's own answer is the month lock below. A month that
  // cannot be read is left open: the database still refuses it.
  const earlierLocksRead = workbenchRead.then(async workbench => {
    const earlier = [...new Set((workbench?.input.orders ?? [])
      .filter(o => !o.upsale && o.periodMonth !== period).map(o => o.periodMonth))]
    const answers = await Promise.all(earlier.map(month => once(
      supabase.rpc('commission_order_period_locked', { p_sub_department_id: subDept.id, p_period: month }),
    )))
    return earlier.filter((_, i) => answers[i].data === true)
  })

  // Who has been closed this month (2026-09-27): their row shows what was
  // locked, and the list says how far the month has been closed. A failed
  // read turns closing off for the visit rather than taking the month down.
  const closesRead = loadSalespersonCloses(supabase, subDept.id, period)
    .then(rows => ({ rows, error: null as string | null }))
    .catch((err: unknown) => ({ rows: [], error: err instanceof Error ? err.message : 'Could not read who is closed.' }))

  const [
    batchRow,
    monthOrders,
    scheme,
    run,
    statements,
    [paidAdjustments, monthLock],
    workbench,
    [feedMonth, doubleClaims, { data: paidRunRows }, pendingAdjustments, fairMoves],
    openBillMonth,
    payrollClosed,
    earlierLocks,
    closes,
  ] = await Promise.all([
    batchRowRead,
    monthOrdersRead,
    schemeRead,
    runRead,
    statementsRead,
    // The drops and upsells the ERP found that somebody paid into this month
    // (Undo sends one back), and whether the month is in payroll.
    Promise.all([
      loadMonthUpsales(supabase, subDept.id, period).then(rows => rows.filter(row => row.source === 'erp')),
      once(supabase.rpc('commission_order_period_locked', { p_sub_department_id: subDept.id, p_period: period })),
    ]),
    workbenchRead,
    // ── The feed, and bills claimed twice (2026-09-26) ───────────────────
    // Whether the ERP may still change this month, and whether any bill here
    // is on another bill's paper or rides in from a month no run of ours paid.
    batchRowRead.then(hasBatch =>
      Promise.all([
        hasBatch ? loadErpFeedMonth(supabase, subDept.id, period) : Promise.resolve(null),
        hasBatch ? loadDoubleClaims(supabase, subDept.id) : Promise.resolve(null),
        once(
          supabase.from('comm_runs').select('period_month')
            .eq('sub_department_id', subDept.id).in('status', ['applied', 'locked']),
        ),
        // Drops and upsells the ERP found on settled bills, from any month —
        // they are paid into the month somebody confirms them in (2026-09-26).
        loadPendingAdjustments(supabase, subDept.id),
        // Bills in another month than the fair the ERP names (2026-09-27).
        hasBatch ? loadFairMoves(supabase, subDept.id) : Promise.resolve([]),
      ]),
    ),
    openBillMonthRead,
    payrollClosedRead,
    earlierLocksRead,
    closesRead,
  ])
  if (monthLock.error) throw new Error(`Could not check the commission run: ${monthLock.error.message}`)

  // A live month carries its excluded orders (cancelled, held, draft) so the
  // feed can bring them back; the money below is the live ones'.
  const orders = monthOrders.filter(o => !o.cancelled)

  const linesWithoutCost = orders.reduce((a, o) => a + o.linesWithoutCost, 0)

  const unmatched = orders.filter(o => !o.staffId)
  const total = orders.reduce((a, o) => a + o.orderTotal, 0)
  // The part of the same bills that earns: every line in a group the scheme
  // pays on (the RPC's margin base is exactly that sum). Transport, disposal
  // and other service lines are the difference (user 2026-09-26). The
  // directors' incentive threshold reads this same figure (2026-09-27).
  const commissionableTotal = monthCommissionableValue(monthOrders)

  // Sales by venue (2026-09-26, the workbench's tab): every live bill —
  // matched or not, so it adds up to Total sales value — at the fair the
  // calendar placed it at. The fair is the workbench's own read of
  // `sales_orders.fair_event_id`, so the tab and the bill rows beside it name
  // the same venue, days and organiser.
  const fairOf = new Map((workbench?.orders ?? []).map(meta => [meta.orderId, meta]))
  const venueRows = salesByFair(
    orders.map(o => {
      const meta = fairOf.get(o.orderId)
      return {
        venue: o.venue,
        groupKey: o.venueGroupKey,
        groupName: o.venueGroupName,
        fair: meta?.fair ?? null,
        event: meta?.eventName ?? null,
        organizer: meta?.organizer ?? o.organizer,
        staffKey: o.staffId ?? o.agentName,
        amount: o.orderTotal,
        commissionable: o.marginRevenue,
      }
    }),
  )

  const ordersPath = revenuePath(subDept.slug, period, 'orders')
  const inPayroll = Boolean(monthLock.data)

  // A month before the first the portal pays was settled by hand: it takes no
  // run, and nothing on its page goes to payroll (2026-09-26).
  const settledBefore = feedMonth?.closed?.reason === 'before_cutover' && feedMonth.firstPaidMonth
    ? label(feedMonth.firstPaidMonth)
    : null

  const paidMonths = new Set(((paidRunRows ?? []) as Array<{ period_month: string }>).map(r => r.period_month))
  const carriedUnpaid = workbench ? carriedFromUnpaidMonths(workbench.input.orders, period, paidMonths) : []
  const doubleClaimPanel = doubleClaims ? (
    <DoubleClaimPanel
      key="double-claims"
      period={period}
      subDepartmentId={subDept.id}
      basePath={revenuePath(subDept.slug)}
      groups={claimsInMonth(doubleClaims.groups, period)}
      carried={carriedUnpaid}
      unavailable={doubleClaims.unavailable}
    />
  ) : null
  // Keyed: handed to a client component as a list of server-built children.
  const erpChangesPanel = (
    <Fragment key="erp-changes">
      <ErpChangesPanel period={period} pending={pendingAdjustments} paid={paidAdjustments} locked={inPayroll}
        settledBefore={settledBefore} />
      <FairMovesPanel period={period} subDepartmentId={subDept.id} moves={fairMoves} />
    </Fragment>
  )

  const monthHeader = (
      <div key="month-head" className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">{label(period)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={revenuePath(subDept.slug)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← All months
          </Link>
          {batchRow ? (
            <Link
              href={ordersPath}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
            >
              All bills
            </Link>
          ) : null}
          {run ? (
            <Link
              href={revenuePath(subDept.slug, period, 'pay')}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
            >
              What this pays
            </Link>
          ) : null}
          {feedMonth?.fed && (batchRow?.source === 'erp_sync' || feedMonth.closed) ? (
            <ErpFeedChip
              period={period}
              subDepartmentId={subDept.id}
              monthLabel={label(period)}
              closed={feedMonth.closed}
              held={feedMonth.held}
              firstPaidLabel={feedMonth.firstPaidMonth ? label(feedMonth.firstPaidMonth) : null}
            />
          ) : null}
          {batchRow?.source !== 'erp_sync' ? (
            <Link
              href={revenuePath(subDept.slug, period, 'import')}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
            >
              {batchRow ? 'Re-import' : 'Import sales orders'}
            </Link>
          ) : null}
        </div>
      </div>
  )
  const monthMetrics = (
          <section className="mb-6">
            <div className={workbenchStyles.metrics}>
              <Tile label="Total sales value" value={formatMoney(total)} big />
              <Tile label="Total orders" value={String(orders.length)} />
              <Tile
                label="Unmatched agents"
                value={String(new Set(unmatched.map(o => agentKeyOf(o.agentName))).size)}
                warn={unmatched.length > 0}
              />
              <Tile
                label="Lines without a cost"
                value={String(linesWithoutCost)}
                warn={linesWithoutCost > 0}
              />
            </div>
          </section>
  )

  return (
    <div className={workbenchStyles.page}>
      {workbench ? <CommissionWorkbench key={`${subDept.id}:${period}`} data={workbench}
        sub={subDept.slug} period={period} runStatus={run?.status ?? null}
        monthOverview={<>{monthHeader}{erpChangesPanel}{doubleClaimPanel}</>}
        monthStats={{ salesValue: total, commissionableValue: commissionableTotal, totalOrders: orders.length,
          unmatchedAgents: new Set(unmatched.map(o => agentKeyOf(o.agentName))).size, linesWithoutCost }}
        venues={venueRows}
        // Bills taken out by hand (Don't count this bill) — out of the
        // calculation, and listed on their seller's page to count again.
        notCounted={monthOrders.filter(o => o.cancelled && o.excludedReason === 'manual').map(o => ({
          orderId: o.orderId, orderNo: o.orderNo, orderDate: o.orderDate, staffId: o.staffId, orderTotal: o.orderTotal,
        }))}
        payroll={{
          monthLabel: label(period),
          sentAt: run?.applied_at ?? null,
          settledBefore,
          payrollClosed,
          switches: subDept.schemeId && scheme ? (
            <SchemeSwitches
              schemeId={subDept.schemeId}
              subDepartmentId={subDept.id}
              period={period}
              monthLabel={label(period)}
              openBill={openBillMonth}
              margin={scheme.enable_margin_penalty || scheme.enable_margin_incentive}
              kpi={scheme.enable_kpi}
            />
          ) : undefined,
        }}
        // A bill's menu answers to its OWN month's run (#170): this month's lock,
        // and every earlier month a ledger carries bills in from.
        lockedPeriods={monthLock.data ? [period, ...earlierLocks] : earlierLocks}
        closes={{
          subDepartmentId: subDept.id,
          closes: closes.rows,
          // A month settled before the portal pays has nothing to lock.
          unavailable: feedMonth?.closed?.reason === 'before_cutover'
            ? `${label(period)} was settled by hand${feedMonth.firstPaidMonth ? ` — the portal pays from ${label(feedMonth.firstPaidMonth)}` : ''}, so there is nothing to close.`
            : closes.error ? `${closes.error} Closing is off until the page reads it again.` : null,
        }}
        savedTotals={statements.map(row => ({ staffId: row.staff_id, total: Number(row.total_commission) }))} />
        : <>{monthHeader}{!batchRow ? (
          <div className="py-16 text-center border border-hairline rounded-card bg-surface">
            <p className="font-serif text-2xl text-ink mb-3">Nothing imported for this month.</p>
            <p className="font-serif italic text-muted text-sm max-w-lg mx-auto">Import the ERP sales-order export to begin.</p>
          </div>
        ) : <>{erpChangesPanel}{doubleClaimPanel}{monthMetrics}</>}</>}
    </div>
  )
}

function Tile({
  label: text,
  value,
  warn,
  big,
}: {
  label: string
  value: string
  warn?: boolean
  big?: boolean
}) {
  return (
    <div className={workbenchStyles.metric}>
      <div className={workbenchStyles.metricLabel}>{text}</div>
      <div
        className={[
          workbenchStyles.metricValue,
          big ? 'whitespace-nowrap' : '',
          warn ? 'text-danger' : 'text-num-ink',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}
