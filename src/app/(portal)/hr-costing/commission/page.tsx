import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import LedgerRow from '@/components/LedgerRow'

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Commission landing: the months that have sales data, and what state each one
 * is in. Sales orders arrive here from the ERP; the commission run that turns
 * them into payroll hangs off each month.
 */
export default async function CommissionLandingPage() {
  await requireRole(['principal', 'hr'])
  const supabase = (await createClient()) as unknown as SupabaseClient

  const thisPeriod = getPeriodMonth()

  const [{ data: batches }, { data: runs }, { data: subDepts }] = await Promise.all([
    supabase
      .from('sales_import_batches')
      .select('id, period_month, file_name, order_count, out_of_period_count, cancelled_count, unmatched_agent_count, created_at')
      .eq('status', 'committed')
      .order('period_month', { ascending: false }),
    supabase.from('comm_runs').select('period_month, status, total_commission, staff_count'),
    supabase.from('comm_sub_departments').select('id, name').order('name'),
  ])

  const runByPeriod = new Map(
    ((runs ?? []) as Array<{ period_month: string; status: string; total_commission: number | string; staff_count: number }>)
      .map(r => [r.period_month, r]),
  )

  const rows = ((batches ?? []) as Array<{
    id: string
    period_month: string
    file_name: string
    order_count: number
    unmatched_agent_count: number
    created_at: string
  }>)

  const configured = ((subDepts ?? []) as Array<{ id: string }>).length > 0

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · COMMISSION
          </div>
          <h1 className="page-title">Commission</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/hr-costing/commission/org-chart"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Org chart
          </Link>
          <Link
            href={`/hr-costing/commission/${thisPeriod}/import`}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Import sales orders
          </Link>
        </div>
      </div>

      {!configured ? (
        <div className="bg-surface-2 border border-hairline text-graphite rounded-md p-4 mb-8 text-sm font-sans">
          No commission sub-department is configured yet. Set the rules up in{' '}
          <Link href="/settings?tab=commission" className="text-accent hover:underline">
            Settings → Commission
          </Link>{' '}
          before importing.
        </div>
      ) : null}

      {rows.length > 0 ? (
        <section className="mb-12">
          <div className="sect-head">
            <h2>Months with sales data</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {rows.length} PERIOD{rows.length === 1 ? '' : 'S'}
            </span>
          </div>
          <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="right m-hide">Orders</th>
                  <th className="right m-hide">Unmatched agents</th>
                  <th className="m-hide">Run</th>
                  <th className="right">Commission</th>
                  <th className="m-hide">Source file</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {rows.map(b => {
                  const run = runByPeriod.get(b.period_month)
                  return (
                    <LedgerRow key={b.id}>
                      <td>
                        <Link
                          href={`/hr-costing/commission/${b.period_month}`}
                          className="text-ink hover:text-accent"
                        >
                          {label(b.period_month)}
                        </Link>
                      </td>
                      <td className="num m-hide" data-label="Orders">{b.order_count}</td>
                      <td className="num m-hide" data-label="Unmatched agents">
                        {b.unmatched_agent_count > 0 ? (
                          <span className="neg">{b.unmatched_agent_count}</span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="font-serif italic text-sm text-graphite m-hide" data-label="Run">
                        {run ? run.status : 'not computed'}
                      </td>
                      <td className="num">
                        {run ? formatMoney(Number(run.total_commission)) : '—'}
                      </td>
                      <td className="font-mono text-xs text-muted m-hide" data-label="Source file">{b.file_name}</td>
                    </LedgerRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-accent text-sm mb-2">{label(thisPeriod)}</p>
          <p className="font-serif text-2xl text-ink mb-3">No sales data imported yet.</p>
          <p className="font-serif italic text-muted text-sm mb-8 max-w-lg mx-auto">
            Commission is worked out from the ERP sales-order export — one row per product line,
            with the salesperson on each order. Import a month to begin.
          </p>
          <Link
            href={`/hr-costing/commission/${thisPeriod}/import`}
            className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
          >
            Import sales orders
          </Link>
        </div>
      )}
    </div>
  )
}
