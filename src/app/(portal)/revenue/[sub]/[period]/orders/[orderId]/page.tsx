import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatDate } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { venueKey } from '@/lib/venues'
import {
  classifyLine,
  costBasisOf,
  EMPTY_KPI_INDEX,
  indexKpiItems,
  marginBase as marginBaseOf,
  normaliseCode,
  orderRevenueSplit,
  type KpiHit,
  type LineClass,
  type SalesLine,
} from '@/lib/commission/engine'
import { EMPTY_FABRIC_SERIES, indexFabricSeries, kpiItemLabel, lineKpiFactsOf } from '@/lib/commission/kpi'
import { toKpiItems, type CostRatioRow, type KpiItemRow } from '@/lib/commission/run-payload'
import { chargeText, costProvenance } from '@/lib/catalogue/provenance'
import LedgerRow from '@/components/LedgerRow'
import ReturnLink from '@/components/layout/ReturnLink'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { describeExclusion } from '@/lib/commission/bill-exclusion'
import { parseWorkbenchReturn } from '@/lib/commission/workbench-nav'
import { holdersLine, holdersOf } from '@/lib/commission/bill-share'
import { paperRef } from '@/lib/commission/paper-ref'
import { requireSubDepartment } from '../../../../_lib/sub-departments'
import { loadOrderExclusions, loadOrderShares } from '../../../../_lib/month-orders'
import { loadBillMoves } from '../../../../_lib/row-origins'
import { namesFabricSeries, readFabricSeries } from '../../../../_lib/fabric-series'
import { movedPhrase } from '@/lib/commission/bill-move'
import { loadAdjustmentAnswers, loadBillChanges } from '../../../../_lib/erp-changes'
import {
  adjustmentLabel,
  commissionNote,
  describeChange,
  earnsDelta,
  kindLabel,
  kindTone,
  TRAIL_SINCE,
  type AdjustmentAnswer,
  type AdjustmentReason,
  type ErpChange,
} from '@/lib/commission/erp-changes'
import { officeTime } from '@/lib/office-time'

interface PageProps {
  params: Promise<{ sub: string; period: string; orderId: string }>
  /** `from`: the month page the bill was opened from — a salesperson's ledger, say. */
  searchParams: Promise<{ from?: string | string[] }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BUTTON = 'bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors'

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

const CLASS_LABEL: Record<LineClass, string> = {
  commissionable: 'Commissionable',
  excluded_group: 'Not commissionable',
  unknown_group: 'Group not classified',
}

/** A line's class as a word on a wash — groups that earn nothing grey, an
 *  unclassified group red (the run refuses to pay the month until somebody
 *  classifies it). A KPI item the line carries is a second chip, in the
 *  sheet's orange. */
const CLASS_CHIP: Record<LineClass, string> = {
  commissionable: '',
  excluded_group: 'info',
  unknown_group: 'danger',
}

function periodEnd(period: string): string {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

interface LineRow {
  id: string
  line_no: number
  item_group: string
  product_code: string
  product_name: string | null
  description2: string | null
  uom: string | null
  qty: number | string
  unit_price: number | string
  line_amount: number | string
  brand_code: string | null
  cost_amount: number | string | null
  /** What the customer paid for a bed frame's divan, leg, gap and total height (20261005010000; absent before it). */
  option_charge_amount?: number | string | null
  /** Which rule priced it (catalogue / catalogue_combo / manual / the pre-2026-09-24 chain). */
  cost_source?: string | null
  /** How it was priced, or why nothing could — 20260924030000; absent before it. */
  cost_detail?: unknown
  /** The ERP's own line — `variants` is where a bed frame's specials are. */
  raw?: { variants?: unknown } | null
}

interface PaymentRow {
  amount_sen?: unknown
  method?: unknown
  paid_at?: unknown
  is_deposit?: unknown
  merchant_provider?: unknown
}

/** A drop or an upsell the ERP found on this bill after it was settled (`comm_upsales`). */
interface ChangeRow {
  id: string
  kind: 'upsale' | 'drop'
  status: 'pending' | 'confirmed' | 'dismissed'
  amount: number | string
  sold_on: string
  settled_amount: number | string | null
  erp_amount: number | string | null
  /** The month it is paid in once confirmed. */
  period_month: string
  original_ref: string
  /** Why the ERP's figure moved (2026-10-13): cancelled, deleted, on_hold, … — null before then. */
  erp_reason: AdjustmentReason | null
  hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
}

/**
 * One bill, as the ERP sent it and as the engine will read it.
 *
 * The line table carries the two facts the month's totals hide: what each line
 * is CLASSED as — commissionable, a KPI giveaway, transport, or an item group
 * nobody has classified, which is a warning and not a shrug — and what it
 * COST, because a bill with no cost has no margin, and the margin band is what
 * decides whether the commission on it is cut.
 *
 * Read straight from `sales_orders`, never from a run: this is the evidence a
 * run is checked against.
 */
export default async function OrderDetailPage({ params, searchParams }: PageProps) {
  await requirePage('/revenue/[sub]/[period]/orders/[orderId]')
  await requirePermission('revenue')
  const { sub, period, orderId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub, 'comm_cal')
  // Where the reader came from (2026-09-27): a bill opened on ANTHONY's ledger
  // goes back to ANTHONY's ledger, on the table it was opened from. Only a
  // month page of this sub-department is honoured (lib/commission/workbench-nav.ts).
  const { from } = await searchParams
  const back = parseWorkbenchReturn(typeof from === 'string' ? from : null, subDept.slug)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: orderData } = await supabase
    .from('sales_orders')
    .select(
      // The FK is named: since sales_order_shares (20260924010000) joins
      // sales_orders to hr_staff_costs as well, a bare `hr_staff_costs (…)`
      // is ambiguous to PostgREST (PGRST201) and the page read no order.
      // `ref_no` / `paper_no` are computed fields (20261003170000): the ERP's
      // Ref No. and the paper number the double-claim check reads from it.
      'id, order_no, order_date, event_date, period_month, customer_name, debtor_code, venue, location, brand_code, order_total, paid_amount, balance, manual_margin_pct, cancelled, excluded_reason, erp_status, erp_on_hold, erp_salesperson_id, sequence_in_day, agent_name, staff_id, synced_at, raw, source, ref_no, paper_no, hr_staff_costs!sales_orders_staff_id_fkey (employee_name, employee_code)',
    )
    .eq('id', orderId)
    .maybeSingle()

  const order = orderData as unknown as {
    id: string
    order_no: string
    order_date: string
    event_date: string
    period_month: string
    customer_name: string | null
    debtor_code: string | null
    venue: string | null
    location: string | null
    brand_code: string | null
    order_total: number | string
    paid_amount: number | string | null
    balance: number | string | null
    manual_margin_pct: number | string | null
    cancelled: boolean
    excluded_reason: string | null
    erp_status: string | null
    erp_on_hold: boolean
    sequence_in_day: number | null
    agent_name: string
    staff_id: string | null
    synced_at: string | null
    raw: { payments?: PaymentRow[] } | null
    source: string
    ref_no: string | null
    paper_no: string | null
    hr_staff_costs: { employee_name: string; employee_code: string | null } | null
  } | null

  if (!order || order.period_month !== period) notFound()

  const asAt = periodEnd(period)
  // The ledger's owner, when it is not the bill's own salesperson (an upline
  // reading a downline's bill on Overriding).
  const backPerson = back?.personId && back.personId !== order.staff_id && UUID.test(back.personId) ? back.personId : null
  const [{ data: lineData }, { data: groupData }, { data: kpiData }, { data: tagData }, { data: venueData }, { data: schemeData }, exclusions, { data: ratioData }, { data: backPersonData }, shares, { data: changeData }, moves, trail] =
    await Promise.all([
      // Every column rather than a list: `cost_detail` exists only once
      // 20260924030000 is applied, and naming it would break this page before.
      supabase
        .from('sales_order_lines')
        .select('*')
        .eq('order_id', orderId)
        .order('line_no'),
      subDept.schemeId
        ? supabase.from('comm_item_groups').select('item_group, commissionable').eq('scheme_id', subDept.schemeId)
        : Promise.resolve({ data: null }),
      // The KPI items the run reads: in force at the month's end.
      subDept.schemeId
        ? supabase
            .from('comm_kpi_items')
            .select('source, product_code, product_name, option_pool, option_value, kpi_amount')
            .eq('scheme_id', subDept.schemeId)
            .lte('effective_from', asAt)
            .or(`effective_to.is.null,effective_to.gte.${asAt}`)
        : Promise.resolve({ data: null }),
      supabase.from('sales_order_open_bill_tags').select('bill_rank, auto_suggested').eq('order_id', orderId).maybeSingle(),
      // The organiser is a fact about the FAIR this bill was written at, not
      // about the hall and not about the month: one hall holds two or three
      // fairs a month and each has its own organiser (REX at MVEC SOUTHKEY
      // mid-August, BIGHOME at the same hall month end — 2026-09-20). One SQL
      // function owns the lookup, and it falls back to the month's answer
      // where the fair calendar has no fair covering the day.
      supabase.rpc('venue_event_organiser_for_order', {
        p_venue: order.venue,
        p_order_date: order.order_date,
      }),
      subDept.schemeId
        ? supabase
            .from('comm_schemes')
            .select('deposit_threshold_pct, revenue_cost_divisor, enable_kpi')
            .eq('id', subDept.schemeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Who took it out of the month by hand, when and why (2026-09-27).
      order.excluded_reason === 'manual' ? loadOrderExclusions(supabase, [orderId]) : Promise.resolve(null),
      // SKUs judged at their own cost ratio (Product List › Costing Setting).
      subDept.schemeId
        ? supabase.from('comm_cost_ratios').select('product_code, ratio').eq('scheme_id', subDept.schemeId)
        : Promise.resolve({ data: null }),
      backPerson
        ? supabase.from('hr_staff_costs').select('employee_name').eq('id', backPerson).maybeSingle()
        : Promise.resolve({ data: null }),
      // Who else holds a part of it (2026-09-30): a shared bill names them all.
      order.staff_id ? loadOrderShares(supabase, [orderId]) : Promise.resolve([]),
      // What the ERP changed on it after it was settled (2026-10-12): an upsell
      // or a drop opened from a ledger lands here, on the bill it changed.
      supabase
        .from('comm_upsales')
        .select('id, kind, status, amount, sold_on, settled_amount, erp_amount, period_month, original_ref, erp_reason, hr_staff_costs (employee_name)')
        .eq('sub_department_id', subDept.id)
        .eq('erp_doc_no', order.order_no)
        .order('sold_on')
        .order('created_at'),
      // Moved here from another salesperson (2026-10-12): from whom, by whom, why.
      loadBillMoves(supabase, [orderId]),
      // Every save the ERP made of it that changed something (2026-10-13), and
      // where each drop or upsell it opened stands. Read softly: a trail that
      // cannot be read leaves the section out, not the bill without a page.
      order.source === 'erp_sync'
        ? loadBillChanges(supabase, subDept.id, order.order_no)
            .then(async changes => ({
              changes,
              answers: await loadAdjustmentAnswers(supabase, changes.flatMap(c => c.adjustmentId ? [c.adjustmentId] : [])),
            }))
            .catch(() => null)
        : Promise.resolve(null),
    ])
  const byHand = exclusions?.get(orderId) ?? null
  const moved = moves[orderId] ?? null
  const changes = ((changeData ?? []) as unknown as ChangeRow[]).map(change => ({
    ...change,
    amount: Number(change.amount),
    settled: change.settled_amount === null ? null : Number(change.settled_amount),
    erp: change.erp_amount === null ? null : Number(change.erp_amount),
    seller: (Array.isArray(change.hr_staff_costs) ? change.hr_staff_costs[0] : change.hr_staff_costs)?.employee_name ?? null,
  }))
  const holders = order.staff_id && shares.length > 0
    ? holdersOf({ staffId: order.staff_id, name: order.hr_staff_costs?.employee_name ?? '—' },
        shares.map(sh => ({ staffId: sh.staffId, name: sh.name, pct: sh.pct })))
    : null

  const lines = (lineData ?? []) as unknown as LineRow[]
  const groupIndex = new Map(
    ((groupData ?? []) as Array<{ item_group: string; commissionable: boolean }>).map(g => [
      normaliseCode(g.item_group),
      g.commissionable,
    ]),
  )
  const tag = tagData as { bill_rank: number; auto_suggested: boolean } | null
  const organiser = (venueData as string | null) || null
  const scheme = schemeData as {
    deposit_threshold_pct: number | string | null
    revenue_cost_divisor: number | string | null
    enable_kpi: boolean
  } | null
  const threshold = scheme?.deposit_threshold_pct
  const depositPct = threshold === null || threshold === undefined ? null : Number(threshold)
  // The KPI items the run pays — none while the scheme has KPI switched off.
  const kpiRows = (kpiData ?? []) as KpiItemRow[]
  const kpiIndex = scheme?.enable_kpi ? indexKpiItems(toKpiItems(kpiRows)) : EMPTY_KPI_INDEX
  // A fabric series item finds a line's fabric on the ERP's fabric list, as the run does (2026-10-29).
  const fabrics = kpiIndex.size > 0 && namesFabricSeries(kpiRows)
    ? indexFabricSeries(await readFabricSeries(supabase))
    : EMPTY_FABRIC_SERIES
  // The Revenue Team's cost basis — `marginBase()` divides every line's cost
  // by its own SKU's ratio, else the scheme's, so this page has to as well or
  // it would explain the engine with a number the engine never used.
  const costBasis = costBasisOf(
    scheme?.revenue_cost_divisor === null || scheme?.revenue_cost_divisor === undefined ? 1 : Number(scheme.revenue_cost_divisor),
    ((ratioData ?? []) as CostRatioRow[]).map(r => ({ productCode: r.product_code, ratio: Number(r.ratio) })),
  )

  // The lines as the engine reads them.
  const salesLines: SalesLine[] = lines.map(l => ({
    id: l.id,
    itemGroup: l.item_group,
    productCode: l.product_code,
    productName: l.product_name ?? undefined,
    qty: Number(l.qty),
    lineAmount: Number(l.line_amount),
    brandCode: l.brand_code ?? undefined,
    costAmount: l.cost_amount === null ? undefined : Number(l.cost_amount),
    optionCharge: Number(l.option_charge_amount ?? 0) || undefined,
    ...lineKpiFactsOf(l.item_group, l.description2, l.raw?.variants, fabrics),
  }))
  const classed = lines.map((l, i) => ({ line: l, cls: classifyLine(salesLines[i], groupIndex) }))
  // What its bed frames' divan, leg, gap and total height were charged (2026-10-05): in the
  // commissionable sales, out of the margin on both sides — as marginBase() reads it.
  const charged = classed
    .filter(c => c.cls === 'commissionable')
    .reduce((a, c) => a + Number(c.line.option_charge_amount ?? 0), 0)

  // The bill, split the way the run splits it: its commissionable lines, less
  // what its KPI items take off (paid flat as KPI instead).
  const split = orderRevenueSplit({ lines: salesLines }, kpiIndex, groupIndex)
  const commissionable = split.main
  // Every item the bill carries is shown; one its sales cannot cover is not paid.
  const hitsByLine = new Map<string, KpiHit[]>()
  for (const hit of split.foundHits) hitsByLine.set(hit.lineId, [...(hitsByLine.get(hit.lineId) ?? []), hit])
  const excluded = classed
    .filter(c => c.cls === 'excluded_group' || c.cls === 'unknown_group')
    .reduce((a, c) => a + Number(c.line.line_amount), 0)
  const unknownGroups = [...new Set(classed.filter(c => c.cls === 'unknown_group').map(c => c.line.item_group))]

  // The MARGIN BASE, as marginBase() builds it: every line in a commissionable
  // group, free giveaways included because their cost is real and that is how
  // giving one away is meant to hurt; the revenue is the bill's main sales.
  // The margin is unknowable the moment one of them has no cost — a
  // part-costed bill is not a high-margin bill.
  const goodsLines = classed.filter(c => c.cls === 'commissionable')
  const base = marginBaseOf(salesLines, kpiIndex, groupIndex, costBasis, order.brand_code ?? null)
  const baseMissing = goodsLines.filter(c => c.line.cost_amount === null).length
  const cost = base.cost
  const manualMargin = order.manual_margin_pct === null ? null : Number(order.manual_margin_pct)
  const margin =
    manualMargin !== null
      ? manualMargin
      : baseMissing > 0 || base.revenue <= 0
        ? null
        : (base.revenue - cost) / base.revenue

  const total = Number(order.order_total)
  const paid = Number(order.paid_amount ?? 0)
  const required = depositPct === null ? null : Math.round(total * depositPct * 100) / 100
  const depositMet = required === null ? true : paid + 0.005 >= required

  const payments = Array.isArray(order.raw?.payments) ? order.raw.payments : []

  // The paper beside the document (2026-10-03): the ERP's Ref No., beside its
  // own number the way the ERP prints it. A bill worked out by hand is its paper.
  const paper = order.source === 'erp_sync' ? paperRef(order.ref_no, order.paper_no) : null

  const backLabel = !back
    ? null
    : back.personId
      ? (back.personId === order.staff_id
          ? order.hr_staff_costs?.employee_name
          : (backPersonData as { employee_name: string } | null)?.employee_name) ?? 'Salesperson'
      : back.tab === 'deposit'
        ? 'Below deposit'
        : back.tab === 'claims'
          ? 'Double claims'
          : back.tab === 'changes'
            ? 'Drops & upsells'
            : label(back.period)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">{order.order_no}</h1>
          <p className="text-sm mt-3">
            {paper ? (
              <>
                {paper.kind === 'missing' ? (
                  <span className="text-alert">No Ref No. in the ERP — double claims cannot be checked</span>
                ) : (
                  <>
                    Ref <span className="font-mono">{paper.text}</span>
                    {paper.kind === 'unreadable' ? (
                      <span className="text-alert"> (not a paper number — double claims cannot be checked)</span>
                    ) : null}
                  </>
                )}
                {' · '}
              </>
            ) : null}
            {order.customer_name ?? 'no customer name'} ·{' '}
            {holders ? `shared ${holdersLine(holders)}` : order.hr_staff_costs?.employee_name ?? `${order.agent_name} (unmatched)`} ·{' '}
            {moved ? (
              <>
                <span title={[moved.movedByName ? `by ${moved.movedByName}` : null, moved.note].filter(Boolean).join(' — ') || undefined}>
                  {movedPhrase(moved)} on {formatDate(moved.movedAt)}
                </span>
                {' · '}
              </>
            ) : null}
            {formatDate(order.order_date)}
            {order.sequence_in_day ? ` · bill #${order.sequence_in_day} of the day` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {back ? (
            <ReturnLink href={back.href} className={BUTTON}>
              ← {backLabel}
            </ReturnLink>
          ) : null}
          <Link href={revenuePath(subDept.slug, period, 'orders')} className={BUTTON}>
            {back ? 'All bills' : '← All bills'}
          </Link>
        </div>
      </div>

      {/* Why the bill does not count — the state alone (2026-10-12); how to
          bring it back is the bill's own right-click menu. */}
      {order.cancelled ? (
        <div className="sheet-warning">
          {order.excluded_reason === 'manual' ? (
            <>
              This bill does not count:{' '}
              <strong>{byHand ? describeExclusion(byHand).replace(/^Taken/, 'taken') : 'taken out of the month by hand'}</strong>
              .
            </>
          ) : order.excluded_reason === 'ignored_agent' ? (
            <>
              This bill earns nothing: <strong>its salesperson ({order.agent_name}) is not ours to pay</strong>.
            </>
          ) : (
            <>
              This bill earns nothing:{' '}
              <strong>
                {order.erp_on_hold ? 'it is on hold in the ERP' : `its ERP status is ${order.erp_status}`}
              </strong>
              .
            </>
          )}
        </div>
      ) : null}

      {/* The bill in four figures. Its total is what the page is opened for —
          the sheet's one walnut card; Paid and Margin turn red only while the
          deposit gate holds the bill or a missing cost blinds its margin. */}
      <StatCards label={`Bill ${order.order_no} in figures`}>
        <StatCard label="Bill total" value={formatMoney(total)} icon="receipt" tone="primary" />
        <StatCard
          label="Commissionable"
          value={formatMoney(commissionable)}
          icon="coin"
          note={[
            split.kpiAmount !== 0 ? `Product lines less ${formatMoney(split.kpiAmount)} of KPI items` : 'Product lines only',
            charged !== 0 ? `${formatMoney(charged)} of it charged for bed frame options` : null,
          ].filter(Boolean).join(' · ')}
        />
        <StatCard
          label="Paid"
          value={formatMoney(paid)}
          icon="wallet"
          note={
            required === null
              ? 'No deposit gate on this scheme'
              : depositMet
                ? `Clears the ${formatMoney(required)} gate`
                : `${formatMoney(required)} needed before it pays`
          }
          tone={depositMet ? undefined : 'danger'}
        />
        <StatCard
          label="Margin"
          value={margin === null ? 'no cost' : pct(margin)}
          icon="percent"
          note={
            manualMargin !== null
              ? 'Keyed by hand — it wins over the line costs'
              : baseMissing > 0
                ? `${baseMissing} of ${goodsLines.length} commissionable lines have no cost, so the bill cannot be judged`
                : charged !== 0
                  ? `On the sales less ${formatMoney(charged)} charged for bed frame options`
                  : 'Every commissionable line carries a cost'
          }
          tone={margin === null ? 'danger' : undefined}
        />
      </StatCards>

      {/* What the ERP changed on this bill after its month was settled
          (2026-10-12): an upsell or a drop opened from a salesperson's ledger
          lands here, on the bill it changed. */}
      {changes.length > 0 ? (
        <section className="mb-10" aria-label="Changed after it was settled">
          <div className="sect-head">
            <h2>Changed after it was settled</h2>
            <span className="rule" aria-hidden />
            <span className="count">{changes.length} {changes.length === 1 ? 'CHANGE' : 'CHANGES'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Found</th>
                  <th>Change</th>
                  <th className="m-hide">Salesperson</th>
                  <th className="right m-hide">Settled</th>
                  <th className="right m-hide">ERP now</th>
                  <th className="right">Difference</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(change => (
                  <tr key={change.id}>
                    <td className="font-mono text-xs">{formatDate(change.sold_on)}</td>
                    <td>
                      <span className={`chip ${change.kind === 'drop' ? 'danger' : 'ledger'}`}>
                        <span className="dot" />
                        {adjustmentLabel(change.kind, change.erp_reason)}
                      </span>
                    </td>
                    <td className="m-hide">{change.seller ?? '—'}</td>
                    <td className="num m-hide">{change.settled === null ? '—' : formatMoney(change.settled)}</td>
                    <td className="num m-hide">{change.erp === null ? '—' : formatMoney(change.erp)}</td>
                    <td className="num">
                      {change.amount < 0 ? <span className="neg">{formatMoney(change.amount)}</span> : formatMoney(change.amount)}
                    </td>
                    <td>
                      {change.status === 'confirmed' ? (
                        <Link href={`${revenuePath(subDept.slug, change.period_month)}?view=changes`} className="text-accent hover:underline">
                          In {label(change.period_month)}
                        </Link>
                      ) : change.status === 'pending' ? (
                        <span className="chip alert"><span className="dot" />Waiting for an answer</span>
                      ) : (
                        <span className="chip info"><span className="dot" />Not a change</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* The ERP audit trail (2026-10-13; the user: "任何改动只要一按 save 他的
          sales order，我这边都要能 track 到，记录在我们自己的 audit trail 里"):
          every save of this bill that changed something, newest first. */}
      {trail ? <ErpTrailSection changes={trail.changes} answers={trail.answers} /> : null}

      <section className="mb-10">
        <div className="sect-head">
          <h2>The bill</h2>
          <span className="rule" aria-hidden />
        </div>
        <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Venue">
            {order.venue ? (
              <Link
                href={`${revenuePath(subDept.slug, period, 'orders')}?venue=${encodeURIComponent(venueKey(order.venue) ?? '')}`}
                className="text-accent hover:text-accent-hover"
              >
                {order.venue}
              </Link>
            ) : (
              <span>the ERP sent none</span>
            )}
          </Fact>
          <Fact label="Organiser">
            {organiser ?? <span>not recorded</span>}
          </Fact>
          <Fact label="Warehouse">{order.location ?? '—'}</Fact>
          <Fact label="Brand">
            {order.brand_code ?? (
              <span className="chip danger">
                <span className="dot" />
                none resolved
              </span>
            )}
          </Fact>
          <Fact label="Customer">
            {order.customer_name ?? '—'}
            {order.debtor_code ? (
              <span className="font-mono text-xs"> · {order.debtor_code}</span>
            ) : null}
          </Fact>
          <Fact label="Event day">{formatDate(order.event_date)}</Fact>
          <Fact label="Open Bill">
            {tag ? (
              <>
                bill {tag.bill_rank} of the day
                <span className="font-mono text-xs">
                  {tag.auto_suggested ? ' · suggested' : ' · set by hand'}
                </span>
              </>
            ) : (
              <span>not tagged</span>
            )}
          </Fact>
          <Fact label="ERP status">
            {order.erp_status ?? '—'}
            {order.synced_at ? (
              <div className="font-mono text-[11px] mt-0.5">synced {formatDate(order.synced_at)}</div>
            ) : null}
          </Fact>
        </dl>
      </section>

      <section className="mb-10">
        <div className="sect-head">
          <h2>Lines</h2>
          <span className="rule" aria-hidden />
          <span className="count">{lines.length} LINES</span>
        </div>
        {unknownGroups.length > 0 ? (
          <p className="sheet-warning max-w-3xl">
            Item group{unknownGroups.length === 1 ? '' : 's'} {unknownGroups.join(', ')}{' '}
            {unknownGroups.length === 1 ? 'is' : 'are'} not classified in{' '}
            <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
              Rules
            </Link>
            , so the run will refuse to pay this month until somebody says whether they earn.
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="m-hide">Item</th>
                <th className="m-hide">Group</th>
                <th className="m-hide">Counts as</th>
                <th className="right m-hide">Qty</th>
                <th className="right m-hide">Unit</th>
                <th className="right">Amount</th>
                <th className="right m-hide">Cost</th>
                <th className="right m-hide">Margin</th>
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {classed.map(({ line: l, cls }) => {
                const amount = Number(l.line_amount)
                const lineCost = l.cost_amount === null ? null : Number(l.cost_amount)
                const lineCharge = Number(l.option_charge_amount ?? 0)
                // A charge is the customer's price for an option: the line's margin is on the rest.
                const lineMargin = lineCost === null || amount - lineCharge === 0 ? null : (amount - lineCharge - lineCost) / (amount - lineCharge)
                return (
                  <LedgerRow key={l.id}>
                    <td className="font-mono text-xs">{l.line_no}</td>
                    <td className="m-hide" data-label="Item">
                      <div className="font-medium">{l.product_name ?? l.product_code}</div>
                      <div className="font-mono text-[11px] mt-0.5">
                        {l.product_code}
                        {l.brand_code ? ` · ${l.brand_code}` : ''}
                      </div>
                    </td>
                    <td className="font-mono text-[11px] m-hide" data-label="Group">{l.item_group}</td>
                    <td className="m-hide" data-label="Counts as">
                      <span className={`chip ${CLASS_CHIP[cls]}`}>
                        <span className="dot" />
                        {CLASS_LABEL[cls]}
                      </span>
                      {(hitsByLine.get(l.id) ?? []).map(hit => (
                        <span
                          key={hit.itemKey}
                          className={`chip ${split.uncovered ? 'info' : 'accent'} ml-1`}
                          title={split.uncovered
                            ? "Not paid: the bill's sales do not cover its KPI items"
                            : "Paid flat as KPI, off the bill's commissionable sales"}
                        >
                          <span className="dot" />
                          KPI · {kpiItemLabel(hit.item)} {formatMoney(hit.amount)}{split.uncovered ? ' · not paid' : ''}
                        </span>
                      ))}
                    </td>
                    <td className="num m-hide" data-label="Qty">{Number(l.qty).toLocaleString()}</td>
                    <td className="num m-hide" data-label="Unit">{formatMoney(Number(l.unit_price))}</td>
                    <td className="num">
                      {formatMoney(amount)}
                      {lineCharge !== 0 ? (
                        <div className="font-sans text-[11px] mt-0.5 whitespace-normal" title="Charged to the customer on top: out of the margin, in the commission">
                          incl. {formatMoney(lineCharge)} {chargeText(l.cost_detail)}
                        </div>
                      ) : null}
                    </td>
                    <td className="num m-hide" data-label="Cost">
                      {lineCost === null ? <span className="neg">none</span> : formatMoney(lineCost)}
                      {(() => {
                        // Where the cost came from — the Product List, a combo,
                        // or why nothing could price it.
                        const p = costProvenance(l.cost_source, l.cost_detail, lineCost !== null)
                        return (
                          <div
                            className={`font-sans text-[11px] mt-0.5 whitespace-normal ${p.missing ? 'text-danger' : ''}`}
                          >
                            {p.label}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="num m-hide" data-label="Margin">{pct(lineMargin)}</td>
                  </LedgerRow>
                )
              })}
            </tbody>
            {/* The bill's own figures under its lines — the peach total band.
                The label sits in the # column and the columns a phone folds
                away share one m-hide cell, so the band lines up at both widths. */}
            <tfoot>
              <tr>
                <td>Bill</td>
                <td className="m-hide" colSpan={5} />
                <td className="num">{formatMoney(Number(order.order_total))}</td>
                <td className="num m-hide">{baseMissing > 0 ? '—' : formatMoney(cost)}</td>
                <td className="num m-hide">{pct(margin)}</td>
                <td className="lt-toggle" aria-hidden />
              </tr>
            </tfoot>
          </table>
        </div>
        {/* The split in figures (2026-10-12 — the sentences on how each part is paid went;
            the line chips and the cards above carry the rest). */}
        <p className="text-xs mt-3 max-w-3xl">
          Commissionable {formatMoney(commissionable)} · KPI items {formatMoney(split.kpiAmount)} · not commissionable{' '}
          {formatMoney(excluded)}
        </p>
      </section>

      {payments.length > 0 ? (
        <section>
          <div className="sect-head">
            <h2>Payments</h2>
            <span className="rule" aria-hidden />
            <span className="count">{formatMoney(paid)} PAID</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="m-hide">Method</th>
                  <th className="m-hide">Deposit</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">
                      {typeof p.paid_at === 'string' ? formatDate(p.paid_at) : '—'}
                    </td>
                    <td className="m-hide" data-label="Method">
                      {typeof p.method === 'string' ? p.method : '—'}
                      {typeof p.merchant_provider === 'string' && p.merchant_provider ? (
                        <span className="font-mono text-[11px]"> · {p.merchant_provider}</span>
                      ) : null}
                    </td>
                    <td className="m-hide" data-label="Deposit">{p.is_deposit === true ? 'yes' : '—'}</td>
                    <td className="num">
                      {formatMoney(Number(p.amount_sen ?? 0) / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** One fact about the bill: a compact definition cell in the sheet's tone,
 *  quieter than the summary cards above it. */
/**
 * Every save of the bill the ERP sent that changed something (2026-10-13,
 * `sales_order_erp_changes`): when, what kind of change on what earns, what
 * changed in words, and what it meant for commission — counted with its
 * month while nothing had been given, a drop or an upsell to answer once it
 * had. The ERP keeps no audit trail of an order changed before its
 * processing date; this is the portal's own.
 */
function ErpTrailSection({ changes, answers }: { changes: ErpChange[]; answers: Map<string, AdjustmentAnswer> }) {
  const oldest = changes.at(-1)
  const note = !oldest
    ? `No save has changed this bill since the record began on ${formatDate(TRAIL_SINCE)}.`
    : oldest.kind === 'opened'
      ? 'Every save since the ERP sent it first.'
      : `Kept from ${formatDate(oldest.receivedAt)}; saves before it were written over the bill without a record.`
  return (
    <section className="mb-10" aria-label="ERP audit trail">
      <div className="sect-head">
        <h2>ERP audit trail</h2>
        <span className="rule" aria-hidden />
        <span className="count">{changes.length} {changes.length === 1 ? 'SAVE' : 'SAVES'}</span>
      </div>
      {/* How far back the trail reaches — its state, not a description of it (2026-10-12). */}
      <p className="text-sm mb-4 max-w-3xl">{note}</p>
      {changes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Saved</th>
                <th>Change</th>
                <th className="right m-hide">Earned before</th>
                <th className="right">Earns now</th>
                <th className="right">Difference</th>
                <th>What changed</th>
                <th className="m-hide">Commission</th>
              </tr>
            </thead>
            <tbody>
              {changes.map(c => {
                const delta = earnsDelta(c)
                return (
                  <tr key={c.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{officeTime(c.savedAt ?? c.receivedAt).format('D MMM YYYY HH:mm')}</td>
                    <td>
                      <span className={`chip ${kindTone(c.kind)}`}><span className="dot" />{kindLabel(c.kind, c.statusAfter)}</span>
                    </td>
                    <td className="num m-hide whitespace-nowrap">{c.commissionableBefore === null ? '—' : formatMoney(c.commissionableBefore)}</td>
                    <td className="num whitespace-nowrap">{c.commissionableAfter === null ? '—' : formatMoney(c.commissionableAfter)}</td>
                    <td className="num whitespace-nowrap">
                      {delta === 0 ? '—' : delta < 0 ? <span className="neg">{formatMoney(delta)}</span> : formatMoney(delta)}
                    </td>
                    <td className="text-xs">
                      {describeChange(c.before, c.after).map(line => <div key={line}>{line}</div>)}
                    </td>
                    <td className="text-xs m-hide">{commissionNote(c, c.adjustmentId ? answers.get(c.adjustmentId) : null)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function Fact({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border border-hairline rounded-md bg-surface-2 px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] mb-1">{text}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  )
}
