import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
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
import { kpiItemLabel, lineSpecialsOf } from '@/lib/commission/kpi'
import { toKpiItems, type CostRatioRow, type KpiItemRow } from '@/lib/commission/run-payload'
import { costProvenance } from '@/lib/catalogue/provenance'
import LedgerRow from '@/components/LedgerRow'
import ReturnLink from '@/components/layout/ReturnLink'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { describeExclusion } from '@/lib/commission/bill-exclusion'
import { parseWorkbenchReturn } from '@/lib/commission/workbench-nav'
import { holdersLine, holdersOf } from '@/lib/commission/bill-share'
import { requireSubDepartment } from '../../../../_lib/sub-departments'
import { loadOrderExclusions, loadOrderShares } from '../../../../_lib/month-orders'

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
  await requirePermission('revenue')
  const { sub, period, orderId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
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
      'id, order_no, order_date, event_date, period_month, customer_name, debtor_code, venue, location, brand_code, order_total, paid_amount, balance, manual_margin_pct, cancelled, excluded_reason, erp_status, erp_on_hold, erp_salesperson_id, sequence_in_day, agent_name, staff_id, synced_at, raw, hr_staff_costs!sales_orders_staff_id_fkey (employee_name, employee_code)',
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
    hr_staff_costs: { employee_name: string; employee_code: string | null } | null
  } | null

  if (!order || order.period_month !== period) notFound()

  const asAt = periodEnd(period)
  // The ledger's owner, when it is not the bill's own salesperson (an upline
  // reading a downline's bill on Overriding).
  const backPerson = back?.personId && back.personId !== order.staff_id && UUID.test(back.personId) ? back.personId : null
  const [{ data: lineData }, { data: groupData }, { data: kpiData }, { data: tagData }, { data: venueData }, { data: schemeData }, exclusions, { data: ratioData }, { data: backPersonData }, shares] =
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
    ])
  const byHand = exclusions?.get(orderId) ?? null
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
  const kpiIndex = scheme?.enable_kpi
    ? indexKpiItems(toKpiItems((kpiData ?? []) as KpiItemRow[]))
    : EMPTY_KPI_INDEX
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
    specials: lineSpecialsOf(l.item_group, l.description2, l.raw?.variants),
  }))
  const classed = lines.map((l, i) => ({ line: l, cls: classifyLine(salesLines[i], groupIndex) }))

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
            {order.customer_name ?? 'no customer name'} ·{' '}
            {holders ? `shared ${holdersLine(holders)}` : order.hr_staff_costs?.employee_name ?? `${order.agent_name} (unmatched)`} ·{' '}
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

      {order.cancelled ? (
        <div className="sheet-warning">
          {order.excluded_reason === 'manual' ? (
            <>
              This bill does not count:{' '}
              <strong>{byHand ? describeExclusion(byHand).replace(/^Taken/, 'taken') : 'taken out of the month by hand'}</strong>
              . It stays out whatever the ERP sends next — right-click it on{' '}
              <Link href={`${revenuePath(subDept.slug, period, 'orders')}?show=all`} className="text-accent hover:underline">
                All bills
              </Link>{' '}
              and choose <em>Count this bill again</em> to bring it back.
            </>
          ) : order.excluded_reason === 'ignored_agent' ? (
            <>
              This bill earns nothing: <strong>its salesperson ({order.agent_name}) is not ours to pay</strong>. It
              comes back if the name is put back under <em>Not our salespeople</em> on Comm Cal.
            </>
          ) : (
            <>
              This bill earns nothing:{' '}
              <strong>
                {order.erp_on_hold ? 'it is on hold in the ERP' : `its ERP status is ${order.erp_status}`}
              </strong>
              . It stays here and comes back the moment the ERP releases it.
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
          note={split.kpiAmount !== 0 ? `Product lines less ${formatMoney(split.kpiAmount)} of KPI items` : 'Product lines only'}
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
                : 'Every commissionable line carries a cost'
          }
          tone={margin === null ? 'danger' : undefined}
        />
      </StatCards>

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
                const lineMargin = lineCost === null || amount === 0 ? null : (amount - lineCost) / amount
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
                    <td className="num">{formatMoney(amount)}</td>
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
        <p className="text-xs mt-3 max-w-3xl">
          Commissionable {formatMoney(commissionable)} · KPI items {formatMoney(split.kpiAmount)} · not commissionable{' '}
          {formatMoney(excluded)}. A KPI item&apos;s amount comes off the bill&apos;s sales and is paid flat as KPI
          instead of a rate; transport and disposal earn nothing either way.
          {split.uncovered
            ? ' Its sales do not cover the KPI items it carries, so none is paid on it — it is paid as sales.'
            : ''}
        </p>
      </section>

      {payments.length > 0 ? (
        <section>
          <div className="sect-head">
            <h2>Payments</h2>
            <span className="rule" aria-hidden />
            <span className="count">{formatMoney(paid)} PAID</span>
          </div>
          <p className="text-sm mb-4 max-w-3xl">
            As the ERP recorded them. What the deposit gate measures is the total against{' '}
            {required === null ? 'no threshold' : formatMoney(required)}.
          </p>
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
function Fact({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border border-hairline rounded-md bg-surface-2 px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] mb-1">{text}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  )
}
