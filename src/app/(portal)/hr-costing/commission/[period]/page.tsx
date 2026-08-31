import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'

interface PageProps {
  params: Promise<{ period: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * One month's imported sales, and how ready it is to be turned into commission.
 *
 * The run itself (compute → statements → apply into payroll) is the next piece
 * of work; until then this page's job is to make the gaps that would make a run
 * wrong impossible to miss — unmatched agents, lines with no cost, orders below
 * the deposit gate.
 */
export default async function CommissionPeriodPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: batch } = await supabase
    .from('sales_import_batches')
    .select('id, file_name, order_count, out_of_period_count, cancelled_count, unmatched_agent_count, created_at')
    .eq('period_month', period)
    .eq('status', 'committed')
    .maybeSingle()

  const batchRow = batch as {
    id: string
    file_name: string
    order_count: number
    out_of_period_count: number
    cancelled_count: number
    unmatched_agent_count: number
  } | null

  const { data: orderRows } = batchRow
    ? await supabase
        .from('sales_orders')
        .select('id, order_no, agent_name, agent_key, staff_id, brand_code, order_total, paid_amount, manual_margin_pct, sequence_in_day, hr_staff_costs (employee_name)')
        .eq('batch_id', batchRow.id)
    : { data: null }

  const orders = ((orderRows ?? []) as unknown as Array<{
    id: string
    order_no: string
    agent_name: string
    agent_key: string
    staff_id: string | null
    brand_code: string | null
    order_total: number | string
    paid_amount: number | string | null
    manual_margin_pct: number | string | null
    hr_staff_costs: { employee_name: string } | null
  }>)

  const { data: costRows } = batchRow
    ? await supabase
        .from('sales_order_lines')
        .select('cost_amount, brand_code, sales_orders!inner (batch_id)')
        .eq('sales_orders.batch_id', batchRow.id)
    : { data: null }

  const lines = ((costRows ?? []) as unknown as Array<{ cost_amount: number | null; brand_code: string | null }>)
  const linesWithoutCost = lines.filter(l => l.cost_amount === null).length
  const linesWithoutBrand = lines.filter(l => !l.brand_code).length

  const { data: scheme } = await supabase
    .from('comm_schemes')
    .select('deposit_threshold_pct')
    .eq('is_active', true)
    .is('effective_to', null)
    .limit(1)
    .maybeSingle()
  const depositPct = scheme ? (scheme as { deposit_threshold_pct: number | string | null }).deposit_threshold_pct : null
  const threshold = depositPct === null || depositPct === undefined ? null : Number(depositPct)

  const belowDeposit = threshold === null
    ? []
    : orders.filter(o => Number(o.paid_amount ?? 0) + 0.005 < Number(o.order_total) * threshold)

  const unmatched = orders.filter(o => !o.staff_id)
  const total = orders.reduce((a, o) => a + Number(o.order_total), 0)

  const bySalesperson = new Map<string, { name: string; orders: number; total: number }>()
  for (const o of orders) {
    const name = o.hr_staff_costs?.employee_name ?? `${o.agent_name} (unmatched)`
    const e = bySalesperson.get(name) ?? { name, orders: 0, total: 0 }
    e.orders++
    e.total += Number(o.order_total)
    bySalesperson.set(name, e)
  }
  const people = [...bySalesperson.values()].sort((a, b) => b.total - a.total)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · COMMISSION · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">{label(period)}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/hr-costing/commission"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            ← All months
          </Link>
          <Link
            href={`/hr-costing/commission/${period}/import`}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            {batchRow ? 'Re-import' : 'Import sales orders'}
          </Link>
        </div>
      </div>

      {!batchRow ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">Nothing imported for this month.</p>
          <p className="font-serif italic text-muted text-sm max-w-lg mx-auto">
            Import the ERP sales-order export to begin.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10">
            <div className="grid gap-4 sm:grid-cols-4">
              <Tile label="Sales value" value={formatMoney(total)} big />
              <Tile label="Orders" value={String(orders.length)} />
              <Tile
                label="Unmatched agents"
                value={String(new Set(unmatched.map(o => o.agent_key)).size)}
                warn={unmatched.length > 0}
              />
              <Tile
                label="Lines without a cost"
                value={String(linesWithoutCost)}
                warn={linesWithoutCost > 0}
              />
            </div>
          </section>

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
                    <Link href="/settings?tab=products" className="text-accent hover:underline">
                      Settings → Product List
                    </Link>{' '}
                    and re-import, or key a margin onto those orders.
                  </li>
                ) : null}
                {linesWithoutBrand > 0 ? (
                  <li>
                    <strong className="text-danger">{linesWithoutBrand} lines</strong> resolve to no
                    brand, which blocks the margin incentive for whoever sold them. Set the Item Code
                    prefixes on each brand in{' '}
                    <Link href="/settings?tab=commission" className="text-accent hover:underline">
                      Settings → Commission
                    </Link>
                    .
                  </li>
                ) : null}
              </ul>
            </section>
          )}

          {threshold !== null && belowDeposit.length > 0 ? (
            <section className="mb-10">
              <div className="sect-head">
                <h2>Waiting on a deposit</h2>
                <span className="rule" aria-hidden />
                <span className="count">{belowDeposit.length} ORDERS</span>
              </div>
              <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
                Below {Math.round(threshold * 100)}% of the order total, so none of their commission
                is released yet. Nothing is lost — each one pays in the month its deposit clears.
              </p>
              <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Salesperson</th>
                      <th className="right">Order total</th>
                      <th className="right">Paid</th>
                      <th className="right">Needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {belowDeposit.slice(0, 40).map(o => (
                      <tr key={o.id}>
                        <td className="font-mono text-xs">{o.order_no}</td>
                        <td>{o.hr_staff_costs?.employee_name ?? o.agent_name}</td>
                        <td className="num">{formatMoney(Number(o.order_total))}</td>
                        <td className="num">{formatMoney(Number(o.paid_amount ?? 0))}</td>
                        <td className="num">
                          {formatMoney(Number(o.order_total) * threshold)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section>
            <div className="sect-head">
              <h2>Sales by person</h2>
              <span className="rule" aria-hidden />
              <span className="count">{people.length} PEOPLE</span>
            </div>
            <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Salesperson</th>
                    <th className="right">Orders</th>
                    <th className="right">Sales value</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(p => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.orders}</td>
                      <td className="num">{formatMoney(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
              This is raw sales value, not the commission base — transport and disposal come out,
              KPI items move to their own allowance, and the deposit gate holds anything under the
              threshold. The run that works all of that out is the next piece of the module.
            </p>
          </section>
        </>
      )}
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
    <div className="border border-hairline rounded-md bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{text}</div>
      <div
        className={[
          'num tabular tracking-[-0.01em]',
          big ? 'text-2xl' : 'text-xl',
          warn ? 'text-danger' : 'text-num-ink',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}
