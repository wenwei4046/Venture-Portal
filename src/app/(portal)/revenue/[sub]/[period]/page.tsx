import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { PRODUCT_LIST_PATH, revenuePath } from '@/lib/revenue'
import { salesByFair } from '@/lib/venues'
import { agentKeyOf } from '@/lib/erp-sync/contract'
import { summariseOpenBill } from '@/lib/commission/open-bill-summary'
import RunControls from './_components/RunControls'
import SchemeSwitches from './_components/SchemeSwitches'
import OpenBillSection from './_components/OpenBillSection'
import MonthBreakdownTabs from './_components/MonthBreakdownTabs'
import UpsaleSection from './_components/UpsaleSection'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../../_lib/sub-departments'
import { loadMonthOrders, loadShareTeam } from '../../_lib/month-orders'
import { loadFairChoices, loadMonthUpsales, loadPendingAdjustments } from '../../_lib/upsales'
import { loadOpenBillPaid } from '../../_lib/open-bill'
import { readRevenuePayrollAdjustments, type RevenuePayrollAdjustmentRead } from '../../_lib/payroll-adjustments'
import PayrollAdjustmentPanel from '../../_components/PayrollAdjustmentPanel'
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

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

interface RunRow {
  id: string
  status: 'draft' | 'computed' | 'applied' | 'locked'
  staff_count: number
  total_commission: number | string
  warnings: string[] | null
  computed_at: string | null
  applied_at: string | null
  deferred_orders: Array<{
    orderNo: string
    staffId: string
    orderTotal: number
    paidAmount: number
    requiredAmount: number
    productRevenue: number
  }> | null
  penalised_orders: Array<{
    orderNo: string
    staffId: string
    brandCode: string | null
    marginPct: number
    bandLabel: string
    multiplier: number
    withheld: number
  }> | null
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
 * what each came to. The statements themselves were a table here until
 * 2026-09-26 — the live table above it carries every column now, Group sales
 * included — and each one is still a page of its own (`statement/[staffId]`).
 */
interface StatementRow {
  id: string
  staff_id: string
  total_commission: number | string
}

/**
 * One month's commission: what was imported, what the run made of it, and the
 * gaps that would make it wrong.
 *
 * The order of the page is the order of the work — import, fix what is flagged,
 * compute and sync, then read the statements. Everything the run says about itself is
 * read from the RUN, not recomputed from sales_orders: re-importing a month
 * replaces every order row, and a page that recomputed its own history would
 * quietly disagree with the money already in payroll.
 *
 * ONE RAIL AT THE TOP (2026-09-26): the workbench's tabs — Total Sales
 * Orders, KPI Items, Open Bill, Below deposit and Sales by venue — are every
 * cut of the month's bills, in one table design. The saved run's table, the
 * deposit list and Sales by person that used to follow further down are gone:
 * the first two moved up into that rail, the last was the top table already.
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
  // earlier answer waits for it: the statements on the run, the names on the
  // statements, the workbench on the month's orders and the run.
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

  // The switches this run pays under are a scheme setting, so THIS sub-department's.
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
      .select('id, status, staff_count, total_commission, warnings, computed_at, applied_at, deferred_orders, penalised_orders')
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

  // Names for anyone the run mentions but this month's batch does not — an
  // upline who sold nothing themselves still earns an override.
  const namesAndAdjustmentsRead = statementsRead.then(async statements => {
    const staffIds = [...new Set(statements.map(s => s.staff_id))]
    if (staffIds.length === 0) {
      return { staffRows: [], payrollAdjustments: { rows: [], unavailable: false } as RevenuePayrollAdjustmentRead }
    }
    const [{ data }, payrollAdjustments] = await Promise.all([
      once(supabase.from('hr_staff_costs').select('id, employee_name').in('id', staffIds)),
      readRevenuePayrollAdjustments(supabase, subDept.id, period),
    ])
    return { staffRows: (data ?? []) as Array<{ id: string; employee_name: string }>, payrollAdjustments }
  })

  // Whether THIS month pays Open Bill: its own setting over Rules (2026-09-26 —
  // on for August, which the claim form paid; September follows Rules).
  const openBillMonthRead = Promise.all([
    schemeRead,
    subDept.schemeId ? loadOpenBillMonthSetting(supabase, subDept.id, period) : Promise.resolve(null),
  ]).then(([scheme, month]) => resolveOpenBill(Boolean(scheme?.enable_open_bill), month))

  // The picks come from the month's orders; what they PAID comes from the
  // run's own lines, because a run also pays Open Bill on the bills it carried
  // in from earlier months.
  const openBillRead = Promise.all([openBillMonthRead, runRead]).then(([openBillMonth, run]) => {
    const on = openBillMonth.on
    return Promise.all([
      on && subDept.schemeId
        ? once(
            supabase
              .from('comm_open_bill_rules')
              .select('bill_rank, pct')
              .eq('scheme_id', subDept.schemeId)
              .is('effective_to', null),
          )
        : Promise.resolve({ data: null }),
      on && run ? loadOpenBillPaid(supabase, run.id) : Promise.resolve(new Map<string, number>()),
    ])
  })

  // The month's workbench starts the moment its own inputs are in, not after
  // everything else on the page.
  const workbenchRead = Promise.all([batchRowRead, monthOrdersRead, runRead]).then(([batchRow, rows, run]) =>
    batchRow && subDept.schemeId ? loadCommissionWorkbench(supabase, subDept.id, period, rows, run?.id) : null,
  )

  // Which EARLIER months' bills can no longer be taken out (2026-09-27): a
  // salesperson's ledger carries bills in from them, and their menu answers
  // to the bill's own month — `revenue_exclude_order` refuses a paid one
  // (23RUN). This month's own answer is the upsale lock below. A month that
  // cannot be read is left open: the database still refuses it.
  const earlierLocksRead = workbenchRead.then(async workbench => {
    const earlier = [...new Set((workbench?.input.orders ?? [])
      .filter(o => !o.upsale && o.periodMonth !== period).map(o => o.periodMonth))]
    const answers = await Promise.all(earlier.map(month => once(
      supabase.rpc('commission_order_period_locked', { p_sub_department_id: subDept.id, p_period: month }),
    )))
    return earlier.filter((_, i) => answers[i].data === true)
  })

  const [
    batchRow,
    monthOrders,
    scheme,
    run,
    statements,
    { staffRows, payrollAdjustments },
    [openBillRuleRes, openBillPaid],
    [upsales, upsaleFairs, team, upsaleLock],
    workbench,
    [feedMonth, doubleClaims, { data: paidRunRows }, pendingAdjustments, fairMoves],
    openBillMonth,
    earlierLocks,
  ] = await Promise.all([
    batchRowRead,
    monthOrdersRead,
    schemeRead,
    runRead,
    statementsRead,
    namesAndAdjustmentsRead,
    openBillRead,
    // What HR recorded beside the bills: amounts customers added to earlier
    // orders, paid in this month's run (`lib/commission/upsales.ts`).
    Promise.all([
      loadMonthUpsales(supabase, subDept.id, period),
      loadFairChoices(supabase, period),
      loadShareTeam(supabase, subDept.schemeId),
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
    earlierLocksRead,
  ])
  if (upsaleLock.error) throw new Error(`Could not check the commission run: ${upsaleLock.error.message}`)

  // A live month carries its excluded orders (cancelled, held, draft) so the
  // feed can bring them back; the money below is the live ones'.
  const orders = monthOrders.filter(o => !o.cancelled)

  const linesWithoutCost = orders.reduce((a, o) => a + o.linesWithoutCost, 0)
  const linesWithoutBrand = orders.reduce((a, o) => a + o.linesWithoutBrand, 0)

  const warnings = run?.warnings ?? []
  const runTotal = run ? Number(run.total_commission) : 0

  const nameOf = new Map(staffRows.map(s => [s.id, s.employee_name]))

  const unmatched = orders.filter(o => !o.staffId)
  const total = orders.reduce((a, o) => a + o.orderTotal, 0)
  // The part of the same bills that earns: every line in a group the scheme
  // pays on (the RPC's margin base is exactly that sum). Transport, disposal
  // and other service lines are the difference (user 2026-09-26).
  const commissionableTotal = Math.round(orders.reduce((a, o) => a + o.marginRevenue, 0) * 100) / 100

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

  // ── Open Bill ──────────────────────────────────────────────────────────
  const openBillOn = openBillMonth.on
  const openBill = openBillOn
    ? summariseOpenBill(orders, {
        paidByOrder: openBillPaid,
        rates: new Map(
          ((openBillRuleRes.data ?? []) as Array<{ bill_rank: number; pct: number | string }>).map(
            r => [r.bill_rank, Number(r.pct)],
          ),
        ),
      })
    : null

  const ordersPath = revenuePath(subDept.slug, period, 'orders')

  const paidMonths = new Set(((paidRunRows ?? []) as Array<{ period_month: string }>).map(r => r.period_month))
  const carriedUnpaid = workbench ? carriedFromUnpaidMonths(workbench.input.orders, period, paidMonths) : []
  const doubleClaimPanel = doubleClaims ? (
    <DoubleClaimPanel
      period={period}
      subDepartmentId={subDept.id}
      basePath={revenuePath(subDept.slug)}
      groups={claimsInMonth(doubleClaims.groups, period)}
      carried={carriedUnpaid}
      unavailable={doubleClaims.unavailable}
    />
  ) : null
  const erpChangesPanel = (
    <>
      <ErpChangesPanel period={period} pending={pendingAdjustments} locked={Boolean(upsaleLock.data)} />
      <FairMovesPanel period={period} subDepartmentId={subDept.id} moves={fairMoves} />
    </>
  )

  const monthHeader = (
      <div className="page-head">
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
  const monthTools = (
          <details className={workbenchStyles.legacy}>
            <summary>Payroll & source tools · saved run, costs and upsales</summary>
            <p className={workbenchStyles.notice}>Payroll uses saved Revenue Rules and source orders. Temporary exclusions and preview settings above are for review only. Save Open Bill picks before computing the payroll run.</p>

          {(unmatched.length > 0 || linesWithoutCost > 0 || linesWithoutBrand > 0) && (
            <section className="mb-10">
              <div className="sect-head">
                <h2>Before this month can pay</h2>
                <span className="rule" aria-hidden />
              </div>
              <ul className="space-y-2 font-serif text-sm text-graphite">
                {unmatched.length > 0 ? (
                  <li>
                    <strong className="text-danger">{unmatched.length} orders</strong> carry an agent
                    who is not a salesperson in the portal, so they pay nobody. Re-import and match
                    them, or add the people under HR → Staff first.
                  </li>
                ) : null}
                {linesWithoutCost > 0 ? (
                  <li>
                    <strong className="text-danger">{linesWithoutCost} lines</strong> have no cost,
                    so their bills have no margin — the below-margin penalty and the monthly
                    incentive are both skipped for them. Fill{' '}
                    <Link href={PRODUCT_LIST_PATH} className="text-accent hover:underline">
                      the Product List
                    </Link>{' '}
                    and re-import, or key a margin onto those orders.
                  </li>
                ) : null}
                {linesWithoutBrand > 0 ? (
                  <li>
                    <strong className="text-danger">{linesWithoutBrand} lines</strong> resolve to no
                    brand, which blocks the margin incentive for whoever sold them. Set the Item Code
                    prefixes on each brand in{' '}
                    <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
                      Rules
                    </Link>
                    .
                  </li>
                ) : null}
              </ul>
            </section>
          )}

          {/* ── The run ─────────────────────────────────────────────────── */}
          <section className="mb-10">
            <div className="sect-head">
              <h2>The run</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {run ? run.status.toUpperCase() : 'NOT COMPUTED'}
              </span>
            </div>

            {/* The page's one dark object — .hero-walnut in globals.css. The
                controls stay on the light ground beside it: an accent button
                inside the walnut block would be tan-on-tan. */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
              <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
                <div className="font-serif italic text-accent text-base mb-1">
                  Source commission · {subDept.name}
                </div>
                <div className="statement-amount text-num-ink">
                  {formatMoney(runTotal)}
                </div>
                <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium uppercase">
                  {run
                    ? `${run.staff_count} STATEMENTS · ${(run.deferred_orders ?? []).length} ORDERS WAITING ON A DEPOSIT`
                    : 'RUN IT TO SEE WHAT THE MONTH PAYS'}
                </div>
                {run?.applied_at ? (
                  <div className="font-serif italic text-ledger text-xs mt-3">
                    Synced to the {period.slice(0, 7)} payroll · basic pay and commission balance are split there.
                  </div>
                ) : null}
              </div>

              <div className="lg:col-span-5 flex flex-col items-start lg:items-end justify-between gap-4">
                <RunControls
                  period={period}
                  subDepartmentId={subDept.id}
                  runId={run?.id ?? null}
                  status={run?.status ?? 'none'}
                  warningCount={warnings.length}
                  hasImport={Boolean(batchRow)}
                  settledBefore={
                    feedMonth?.closed?.reason === 'before_cutover' && feedMonth.firstPaidMonth
                      ? label(feedMonth.firstPaidMonth)
                      : null
                  }
                />

                {subDept.schemeId && scheme ? (
                  <SchemeSwitches
                    schemeId={subDept.schemeId}
                    subDepartmentId={subDept.id}
                    period={period}
                    monthLabel={label(period)}
                    openBill={openBillMonth}
                    margin={Boolean(
                      (scheme as { enable_margin_penalty: boolean }).enable_margin_penalty ||
                        (scheme as { enable_margin_incentive: boolean }).enable_margin_incentive,
                    )}
                    kpi={Boolean((scheme as { enable_kpi: boolean }).enable_kpi)}
                  />
                ) : null}

                {warnings.length > 0 ? (
                  <div className="w-full border border-hairline rounded-card bg-surface p-4">
                    <div className="font-mono text-[10.5px] uppercase tracking-wide text-danger mb-2">
                      {warnings.length} thing(s) to settle before this can pay
                    </div>
                    <ul className="space-y-1.5 font-serif text-sm text-graphite list-disc pl-5">
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            {/* The saved run's per-person table lived here until 2026-09-26.
                The live table at the top of the page carries all of it now —
                Group sales included — and each statement is still its own
                page (`statement/[staffId]`, linked from HR payroll). */}
            {run && statements.length === 0 ? (
              <p className="font-serif italic text-muted text-sm">
                The run produced no statements — every order was either unmatched or held by the
                deposit gate.
              </p>
            ) : null}
          </section>

          <PayrollAdjustmentPanel read={payrollAdjustments} periodLabel={label(period)} staffNames={nameOf}
            runSynced={run?.status === 'applied' || run?.status === 'locked'} />

          {/* ── Penalised bills ─────────────────────────────────────────── */}
          {run && (run.penalised_orders ?? []).length > 0 ? (
            <section className="mb-10">
              <div className="sect-head">
                <h2>Cut for margin</h2>
                <span className="rule" aria-hidden />
                <span className="count">{(run.penalised_orders ?? []).length} BILLS</span>
              </div>
              <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
                Judged per bill, most severe band wins. What the penalty removes is taken off the
                upline&apos;s override in the same proportion.
              </p>
              <div className="overflow-x-auto">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th className="m-hide">Salesperson</th>
                      <th className="m-hide">Brand</th>
                      <th className="right m-hide">Margin</th>
                      <th className="m-hide">Band</th>
                      <th className="right">Withheld</th>
                      <th className="lt-toggle" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {(run.penalised_orders ?? []).slice(0, 60).map(p => (
                      <LedgerRow key={p.orderNo}>
                        <td className="font-mono text-xs">{p.orderNo}</td>
                        <td className="m-hide" data-label="Salesperson">{nameOf.get(p.staffId) ?? p.staffId}</td>
                        <td className="font-mono text-[11px] text-graphite m-hide" data-label="Brand">{p.brandCode ?? '—'}</td>
                        <td className="num m-hide" data-label="Margin">{pct(p.marginPct)}</td>
                        <td className="m-hide" data-label="Band">
                          <em className="font-serif text-graphite text-sm">
                            {p.bandLabel} × {p.multiplier}
                          </em>
                        </td>
                        <td className="num neg">{formatMoney(p.withheld)}</td>
                      </LedgerRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Waiting on a deposit, Sales by venue and Sales by person were here
              until 2026-09-26: the first two are tabs of the table at the top
              of the page now (Below deposit · Sales by venue), and the third
              was that table already. What is left is what HR records beside
              the bills, and what the Open Bill picks cost. */}
          <MonthBreakdownTabs
            counts={{
              openBill: openBill?.totals.bills ?? 0,
              upsales: upsales.length + pendingAdjustments.length,
            }}
            upsales={
              <UpsaleSection
                subDepartmentId={subDept.id}
                period={period}
                upsales={upsales}
                team={team}
                fairs={upsaleFairs}
                locked={Boolean(upsaleLock.data)}
              />
            }
            openBill={
              openBill ? (
                <OpenBillSection
                  summary={openBill}
                  ordersPath={ordersPath}
                  queuePath={revenuePath(subDept.slug, period, 'open-bill')}
                  runStatus={run?.status ?? null}
                  fromFeed={batchRow?.source === 'erp_sync'}
                />
              ) : null
            }
          />
          </details>
  )

  return (
    <div className={workbenchStyles.page}>
      {workbench ? <CommissionWorkbench key={`${subDept.id}:${period}`} data={workbench}
        sub={subDept.slug} period={period} runStatus={run?.status ?? null}
        monthOverview={<>{monthHeader}{erpChangesPanel}{doubleClaimPanel}</>}
        monthStats={{ salesValue: total, commissionableValue: commissionableTotal, totalOrders: orders.length,
          unmatchedAgents: new Set(unmatched.map(o => agentKeyOf(o.agentName))).size, linesWithoutCost }}
        venues={venueRows}
        monthTools={monthTools}
        lockedPeriods={upsaleLock.data ? [period, ...earlierLocks] : earlierLocks}
        savedTotals={statements.map(row => ({ staffId: row.staff_id, total: Number(row.total_commission) }))} />
        : <>{monthHeader}{!batchRow ? (
          <div className="py-16 text-center border border-hairline rounded-card bg-surface">
            <p className="font-serif text-2xl text-ink mb-3">Nothing imported for this month.</p>
            <p className="font-serif italic text-muted text-sm max-w-lg mx-auto">Import the ERP sales-order export to begin.</p>
          </div>
        ) : <>{erpChangesPanel}{doubleClaimPanel}{monthMetrics}{monthTools}</>}</>}
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
