import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import RunControls from './_components/RunControls'

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

interface StatementRow {
  id: string
  staff_id: string
  rank_key: string | null
  qualifies_for_rank_key: string | null
  product_rate: number | string
  product_revenue: number | string
  group_revenue: number | string
  deferred_revenue: number | string
  product_commission: number | string
  kpi_commission: number | string
  open_bill_bonus: number | string
  override_commission: number | string
  margin_incentive: number | string
  margin_pct: number | string | null
  margin_penalty_withheld: number | string
  total_commission: number | string
}

/**
 * One month's commission: what was imported, what the run made of it, and the
 * gaps that would make it wrong.
 *
 * The order of the page is the order of the work — import, fix what is flagged,
 * compute, read the statements, apply. Everything the run says about itself is
 * read from the RUN, not recomputed from sales_orders: re-importing a month
 * replaces every order row, and a page that recomputed its own history would
 * quietly disagree with the money already in payroll.
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

  // ── The run ────────────────────────────────────────────────────────────
  const { data: runData } = await supabase
    .from('comm_runs')
    .select('id, status, staff_count, total_commission, warnings, computed_at, applied_at, deferred_orders, penalised_orders')
    .eq('period_month', period)
    .limit(1)
    .maybeSingle()
  const run = runData as RunRow | null

  const { data: statementData } = run
    ? await supabase
        .from('comm_statements')
        .select('id, staff_id, rank_key, qualifies_for_rank_key, product_rate, product_revenue, group_revenue, deferred_revenue, product_commission, kpi_commission, open_bill_bonus, override_commission, margin_incentive, margin_pct, margin_penalty_withheld, total_commission')
        .eq('run_id', run.id)
    : { data: null }
  const statements = ((statementData ?? []) as unknown as StatementRow[]).sort(
    (a, b) => Number(b.total_commission) - Number(a.total_commission),
  )

  const warnings = run?.warnings ?? []
  const runTotal = run ? Number(run.total_commission) : 0

  // Names for anyone the run mentions but this month's batch does not — an
  // upline who sold nothing themselves still earns an override.
  const staffIds = [...new Set(statements.map(s => s.staff_id))]
  const { data: staffRows } = staffIds.length
    ? await supabase.from('hr_staff_costs').select('id, employee_name').in('id', staffIds)
    : { data: null }
  const nameOf = new Map(
    ((staffRows ?? []) as Array<{ id: string; employee_name: string }>).map(s => [s.id, s.employee_name]),
  )

  // Before a run exists the deposit gate is shown from live orders; once it
  // does, from the run's own snapshot of what it held back.
  const belowDeposit =
    threshold === null
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
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← All months
          </Link>
          <Link
            href={`/hr-costing/commission/${period}/import`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
          >
            {batchRow ? 'Re-import' : 'Import sales orders'}
          </Link>
        </div>
      </div>

      {!batchRow ? (
        <div className="py-16 text-center border border-hairline rounded-card bg-surface">
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
                  Commission this month
                </div>
                <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
                  {formatMoney(runTotal)}
                </div>
                <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium uppercase">
                  {run
                    ? `${run.staff_count} STATEMENTS · ${(run.deferred_orders ?? []).length} ORDERS WAITING ON A DEPOSIT`
                    : 'RUN IT TO SEE WHAT THE MONTH PAYS'}
                </div>
                {run?.applied_at ? (
                  <div className="font-serif italic text-ledger text-xs mt-3">
                    Written into the {period.slice(0, 7)} payroll.
                  </div>
                ) : null}
              </div>

              <div className="lg:col-span-5 flex flex-col items-start lg:items-end justify-between gap-4">
                <RunControls
                  period={period}
                  runId={run?.id ?? null}
                  status={run?.status ?? 'none'}
                  warningCount={warnings.length}
                  hasImport={Boolean(batchRow)}
                />

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

            {statements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Salesperson</th>
                      <th>Rank</th>
                      <th className="right">Own revenue</th>
                      <th className="right">Group</th>
                      <th className="right">Product</th>
                      <th className="right">KPI</th>
                      <th className="right">Open Bill</th>
                      <th className="right">Override</th>
                      <th className="right">Incentive</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map(s => (
                      <tr key={s.id}>
                        <td>
                          <Link
                            href={`/hr-costing/commission/${period}/statement/${s.staff_id}`}
                            className="font-serif text-[15px] text-ink hover:text-accent"
                          >
                            {nameOf.get(s.staff_id) ?? s.staff_id}
                          </Link>
                          {s.qualifies_for_rank_key && s.qualifies_for_rank_key !== s.rank_key ? (
                            <div className="font-mono text-[10.5px] text-accent mt-0.5">
                              QUALIFIES FOR {s.qualifies_for_rank_key.toUpperCase()}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className="font-mono text-[11px] text-graphite">
                            {s.rank_key ?? '—'} · {(Number(s.product_rate) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="num">{formatMoney(Number(s.product_revenue))}</td>
                        <td className="num">{formatMoney(Number(s.group_revenue))}</td>
                        <td className="num">{formatMoney(Number(s.product_commission))}</td>
                        <td className="num">{formatMoney(Number(s.kpi_commission))}</td>
                        <td className="num">{formatMoney(Number(s.open_bill_bonus))}</td>
                        <td className="num">{formatMoney(Number(s.override_commission))}</td>
                        <td className="num">{formatMoney(Number(s.margin_incentive))}</td>
                        <td className="num font-semibold">{formatMoney(Number(s.total_commission))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : run ? (
              <p className="font-serif italic text-muted text-sm">
                The run produced no statements — every order was either unmatched or held by the
                deposit gate.
              </p>
            ) : null}

            <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
              Group revenue is a SALES figure: it is own plus the whole downline, and the
              below-margin penalty does not reduce it. Commission is what the penalty cuts.
            </p>
          </section>

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
                      <th>Salesperson</th>
                      <th>Brand</th>
                      <th className="right">Margin</th>
                      <th>Band</th>
                      <th className="right">Withheld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run.penalised_orders ?? []).slice(0, 60).map(p => (
                      <tr key={p.orderNo}>
                        <td className="font-mono text-xs">{p.orderNo}</td>
                        <td>{nameOf.get(p.staffId) ?? p.staffId}</td>
                        <td className="font-mono text-[11px] text-graphite">{p.brandCode ?? '—'}</td>
                        <td className="num">{pct(p.marginPct)}</td>
                        <td>
                          <em className="font-serif text-graphite text-sm">
                            {p.bandLabel} × {p.multiplier}
                          </em>
                        </td>
                        <td className="num neg">{formatMoney(p.withheld)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* ── Deposit gate ────────────────────────────────────────────── */}
          {threshold !== null && (run ? (run.deferred_orders ?? []).length > 0 : belowDeposit.length > 0) ? (
            <section className="mb-10">
              <div className="sect-head">
                <h2>Waiting on a deposit</h2>
                <span className="rule" aria-hidden />
                <span className="count">
                  {(run ? (run.deferred_orders ?? []).length : belowDeposit.length)} ORDERS
                </span>
              </div>
              <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
                Below {Math.round(threshold * 100)}% of the order total, so none of their commission
                is released yet. Nothing is lost — each one pays in the month its deposit clears.
              </p>
              <div className="overflow-x-auto">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Salesperson</th>
                      <th className="right">Order total</th>
                      <th className="right">Paid</th>
                      <th className="right">Needed</th>
                      {run ? <th className="right">Commission held</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {run
                      ? (run.deferred_orders ?? []).slice(0, 60).map(d => (
                          <tr key={d.orderNo}>
                            <td className="font-mono text-xs">{d.orderNo}</td>
                            <td>{nameOf.get(d.staffId) ?? d.staffId}</td>
                            <td className="num">{formatMoney(d.orderTotal)}</td>
                            <td className="num">{formatMoney(d.paidAmount)}</td>
                            <td className="num">{formatMoney(d.requiredAmount)}</td>
                            <td className="num">{formatMoney(d.productRevenue)}</td>
                          </tr>
                        ))
                      : belowDeposit.slice(0, 40).map(o => (
                          <tr key={o.id}>
                            <td className="font-mono text-xs">{o.order_no}</td>
                            <td>{o.hr_staff_costs?.employee_name ?? o.agent_name}</td>
                            <td className="num">{formatMoney(Number(o.order_total))}</td>
                            <td className="num">{formatMoney(Number(o.paid_amount ?? 0))}</td>
                            <td className="num">{formatMoney(Number(o.order_total) * threshold)}</td>
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
            <div className="overflow-x-auto">
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
              threshold.{' '}
              <Link href={`/hr-costing/commission/${period}/open-bill`} className="text-accent hover:underline">
                Review the Open Bill picks
              </Link>{' '}
              before computing: they are seeded from the document number, not from a real timestamp.
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
    <div className="border border-hairline rounded-card bg-surface px-4 py-3">
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
