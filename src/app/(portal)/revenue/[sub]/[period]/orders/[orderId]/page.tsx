import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatDate } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { venueKey } from '@/lib/venues'
import { classifyLine, normaliseCode, type LineClass } from '@/lib/commission/engine'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../../../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string; period: string; orderId: string }>
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

const CLASS_LABEL: Record<LineClass, string> = {
  commissionable: 'Commissionable',
  kpi: 'KPI item',
  excluded_group: 'Not commissionable',
  unknown_group: 'Group not classified',
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
export default async function OrderDetailPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub, period, orderId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: orderData } = await supabase
    .from('sales_orders')
    .select(
      'id, order_no, order_date, event_date, period_month, customer_name, debtor_code, venue, location, brand_code, order_total, paid_amount, balance, manual_margin_pct, cancelled, erp_status, erp_on_hold, erp_salesperson_id, sequence_in_day, agent_name, staff_id, synced_at, raw, hr_staff_costs (employee_name, employee_code)',
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

  const [{ data: lineData }, { data: groupData }, { data: kpiData }, { data: tagData }, { data: venueData }, { data: schemeData }] =
    await Promise.all([
      supabase
        .from('sales_order_lines')
        .select('id, line_no, item_group, product_code, product_name, description2, uom, qty, unit_price, line_amount, brand_code, cost_amount')
        .eq('order_id', orderId)
        .order('line_no'),
      subDept.schemeId
        ? supabase.from('comm_item_groups').select('item_group, commissionable').eq('scheme_id', subDept.schemeId)
        : Promise.resolve({ data: null }),
      subDept.schemeId
        ? supabase.from('comm_kpi_items').select('product_code, kpi_amount').eq('scheme_id', subDept.schemeId)
        : Promise.resolve({ data: null }),
      supabase.from('sales_order_open_bill_tags').select('bill_rank, auto_suggested').eq('order_id', orderId).maybeSingle(),
      // The organiser is a fact about THIS MONTH's fair at this venue, not
      // about the hall: the same place has a different organiser from month to
      // month (comm_venue_events, 2026-09-17). One SQL function owns the
      // lookup, so this page and revenue_month_orders cannot drift apart.
      supabase.rpc('venue_event_organiser', { p_venue: order.venue, p_period: period }),
      subDept.schemeId
        ? supabase
            .from('comm_schemes')
            .select('deposit_threshold_pct, revenue_cost_divisor')
            .eq('id', subDept.schemeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const lines = (lineData ?? []) as unknown as LineRow[]
  const groupIndex = new Map(
    ((groupData ?? []) as Array<{ item_group: string; commissionable: boolean }>).map(g => [
      normaliseCode(g.item_group),
      g.commissionable,
    ]),
  )
  const kpiIndex = new Map(
    ((kpiData ?? []) as Array<{ product_code: string; kpi_amount: number | string }>).map(k => [
      normaliseCode(k.product_code),
      Number(k.kpi_amount),
    ]),
  )
  const tag = tagData as { bill_rank: number; auto_suggested: boolean } | null
  const organiser = (venueData as string | null) || null
  const scheme = schemeData as {
    deposit_threshold_pct: number | string | null
    revenue_cost_divisor: number | string | null
  } | null
  const threshold = scheme?.deposit_threshold_pct
  const depositPct = threshold === null || threshold === undefined ? null : Number(threshold)
  // The Revenue Team's cost basis — `marginBase()` divides every line's cost by
  // it, so this page has to as well or it would explain the engine with a
  // number the engine never used.
  const rawDivisor = scheme?.revenue_cost_divisor
  const costDivisor =
    rawDivisor === null || rawDivisor === undefined || Number(rawDivisor) <= 0 ? 1 : Number(rawDivisor)

  const classed = lines.map(l => ({
    line: l,
    cls: classifyLine(
      {
        id: l.id,
        itemGroup: l.item_group,
        productCode: l.product_code,
        productName: l.product_name ?? undefined,
        qty: Number(l.qty),
        lineAmount: Number(l.line_amount),
        brandCode: l.brand_code ?? undefined,
        costAmount: l.cost_amount === null ? undefined : Number(l.cost_amount),
      },
      kpiIndex,
      groupIndex,
    ),
  }))

  const commissionable = classed
    .filter(c => c.cls === 'commissionable')
    .reduce((a, c) => a + Number(c.line.line_amount), 0)
  const kpiRevenue = classed.filter(c => c.cls === 'kpi').reduce((a, c) => a + Number(c.line.line_amount), 0)
  const excluded = classed
    .filter(c => c.cls === 'excluded_group' || c.cls === 'unknown_group')
    .reduce((a, c) => a + Number(c.line.line_amount), 0)
  const unknownGroups = [...new Set(classed.filter(c => c.cls === 'unknown_group').map(c => c.line.item_group))]

  // The MARGIN BASE, as marginBase() builds it: every line in a commissionable
  // group, KPI giveaways included because their cost is real and that is how
  // giving one away is meant to hurt. The margin is unknowable the moment one
  // of them has no cost — a part-costed bill is not a high-margin bill.
  const marginBase = classed.filter(
    c => c.cls === 'commissionable' || (c.cls === 'kpi' && groupIndex.get(normaliseCode(c.line.item_group)) === true),
  )
  const baseRevenue = marginBase.reduce((a, c) => a + Number(c.line.line_amount), 0)
  const baseMissing = marginBase.filter(c => c.line.cost_amount === null).length
  const cost = marginBase.reduce((a, c) => a + Number(c.line.cost_amount ?? 0) / costDivisor, 0)
  const manualMargin = order.manual_margin_pct === null ? null : Number(order.manual_margin_pct)
  const margin =
    manualMargin !== null
      ? manualMargin
      : baseMissing > 0 || baseRevenue <= 0
        ? null
        : (baseRevenue - cost) / baseRevenue

  const total = Number(order.order_total)
  const paid = Number(order.paid_amount ?? 0)
  const required = depositPct === null ? null : Math.round(total * depositPct * 100) / 100
  const depositMet = required === null ? true : paid + 0.005 >= required

  const payments = Array.isArray(order.raw?.payments) ? order.raw.payments : []

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">{order.order_no}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {order.customer_name ?? 'no customer name'} ·{' '}
            {order.hr_staff_costs?.employee_name ?? `${order.agent_name} (unmatched)`} ·{' '}
            {formatDate(order.order_date)}
            {order.sequence_in_day ? ` · bill #${order.sequence_in_day} of the day` : ''}
          </p>
        </div>
        <Link
          href={revenuePath(subDept.slug, period, 'orders')}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
        >
          ← All bills
        </Link>
      </div>

      {order.cancelled ? (
        <div className="bg-surface-2 border border-hairline text-graphite rounded-md p-4 mb-8 text-sm font-sans">
          This bill earns nothing:{' '}
          <strong>
            {order.erp_on_hold ? 'it is on hold in the ERP' : `its ERP status is ${order.erp_status}`}
          </strong>
          . It stays here and comes back the moment the ERP releases it.
        </div>
      ) : null}

      <section className="mb-10">
        <div className="grid gap-4 sm:grid-cols-4">
          <Fig label="Bill total" value={formatMoney(total)} big />
          <Fig label="Commissionable" value={formatMoney(commissionable)} note="Product lines only" />
          <Fig
            label="Paid"
            value={formatMoney(paid)}
            note={
              required === null
                ? 'No deposit gate on this scheme'
                : depositMet
                  ? `Clears the ${formatMoney(required)} gate`
                  : `${formatMoney(required)} needed before it pays`
            }
            warn={!depositMet}
          />
          <Fig
            label="Margin"
            value={margin === null ? 'no cost' : pct(margin)}
            note={
              manualMargin !== null
                ? 'Keyed by hand — it wins over the line costs'
                : baseMissing > 0
                  ? `${baseMissing} of ${marginBase.length} commissionable lines have no cost, so the bill cannot be judged`
                  : 'Every commissionable line carries a cost'
            }
            warn={margin === null}
          />
        </div>
      </section>

      <section className="mb-10">
        <div className="sect-head">
          <h2>The bill</h2>
          <span className="rule" aria-hidden />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Venue">
            {order.venue ? (
              <Link
                href={`${revenuePath(subDept.slug, period, 'orders')}?venue=${encodeURIComponent(venueKey(order.venue) ?? '')}`}
                className="text-ink hover:text-accent"
              >
                {order.venue}
              </Link>
            ) : (
              <span className="text-muted">the ERP sent none</span>
            )}
          </Fact>
          <Fact label="Organiser">
            {organiser ?? <span className="text-muted">not recorded</span>}
          </Fact>
          <Fact label="Warehouse">{order.location ?? '—'}</Fact>
          <Fact label="Brand">{order.brand_code ?? <span className="text-danger">none resolved</span>}</Fact>
          <Fact label="Customer">
            {order.customer_name ?? '—'}
            {order.debtor_code ? (
              <span className="font-mono text-xs text-muted"> · {order.debtor_code}</span>
            ) : null}
          </Fact>
          <Fact label="Event day">{formatDate(order.event_date)}</Fact>
          <Fact label="Open Bill">
            {tag ? (
              <>
                bill {tag.bill_rank} of the day
                <span className="font-mono text-xs text-muted">
                  {tag.auto_suggested ? ' · suggested' : ' · set by hand'}
                </span>
              </>
            ) : (
              <span className="text-muted">not tagged</span>
            )}
          </Fact>
          <Fact label="ERP status">
            {order.erp_status ?? '—'}
            {order.synced_at ? (
              <div className="font-mono text-[11px] text-muted">synced {formatDate(order.synced_at)}</div>
            ) : null}
          </Fact>
        </div>
      </section>

      <section className="mb-10">
        <div className="sect-head">
          <h2>Lines</h2>
          <span className="rule" aria-hidden />
          <span className="count">{lines.length} LINES</span>
        </div>
        {unknownGroups.length > 0 ? (
          <p className="font-serif text-sm text-danger mb-4 max-w-3xl">
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
                    <td className="font-mono text-xs text-muted">{l.line_no}</td>
                    <td className="m-hide" data-label="Item">
                      <div className="font-serif text-[14px] text-ink">{l.product_name ?? l.product_code}</div>
                      <div className="font-mono text-[10.5px] text-muted mt-0.5">
                        {l.product_code}
                        {l.brand_code ? ` · ${l.brand_code}` : ''}
                      </div>
                    </td>
                    <td className="font-mono text-[11px] text-graphite m-hide" data-label="Group">{l.item_group}</td>
                    <td className="m-hide" data-label="Counts as">
                      <em
                        className={[
                          'font-serif text-sm',
                          cls === 'commissionable' ? 'text-ink' : '',
                          cls === 'kpi' ? 'text-accent' : '',
                          cls === 'excluded_group' ? 'text-muted' : '',
                          cls === 'unknown_group' ? 'text-danger' : '',
                        ].join(' ')}
                      >
                        {CLASS_LABEL[cls]}
                      </em>
                    </td>
                    <td className="num m-hide" data-label="Qty">{Number(l.qty).toLocaleString()}</td>
                    <td className="num m-hide" data-label="Unit">{formatMoney(Number(l.unit_price))}</td>
                    <td className="num">{formatMoney(amount)}</td>
                    <td className="num m-hide" data-label="Cost">
                      {lineCost === null ? <span className="neg">none</span> : formatMoney(lineCost)}
                    </td>
                    <td className="num m-hide" data-label="Margin">{pct(lineMargin)}</td>
                  </LedgerRow>
                )
              })}
              <tr>
                <td colSpan={6}>
                  <strong className="font-serif text-ink text-[15px]">Bill</strong>
                </td>
                <td className="num font-semibold">{formatMoney(Number(order.order_total))}</td>
                <td className="num m-hide">{baseMissing > 0 ? '—' : formatMoney(cost)}</td>
                <td className="num m-hide">{pct(margin)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
          Commissionable {formatMoney(commissionable)} · KPI {formatMoney(kpiRevenue)} · not commissionable{' '}
          {formatMoney(excluded)}. A KPI line pays its flat allowance instead of a rate, which is the point
          when it is given away; transport and disposal earn nothing either way.
        </p>
      </section>

      {payments.length > 0 ? (
        <section>
          <div className="sect-head">
            <h2>Payments</h2>
            <span className="rule" aria-hidden />
            <span className="count">{formatMoney(paid)} PAID</span>
          </div>
          <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
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
                    <td className="font-mono text-xs text-graphite">
                      {typeof p.paid_at === 'string' ? formatDate(p.paid_at) : '—'}
                    </td>
                    <td className="m-hide" data-label="Method">
                      {typeof p.method === 'string' ? p.method : '—'}
                      {typeof p.merchant_provider === 'string' && p.merchant_provider ? (
                        <span className="font-mono text-[11px] text-muted"> · {p.merchant_provider}</span>
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

function Fig({
  label: text,
  value,
  note,
  warn,
  big,
}: {
  label: string
  value: string
  note?: string
  warn?: boolean
  big?: boolean
}) {
  return (
    <div className="border border-hairline rounded-card bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{text}</div>
      <div className={['statement-amount', big ? '' : 'compact', warn ? 'text-danger' : 'text-num-ink'].join(' ')}>
        {value}
      </div>
      {note ? <div className="font-serif italic text-muted text-xs mt-1.5">{note}</div> : null}
    </div>
  )
}

function Fact({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-hairline rounded-card bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{text}</div>
      <div className="font-serif text-sm text-ink">{children}</div>
    </div>
  )
}
