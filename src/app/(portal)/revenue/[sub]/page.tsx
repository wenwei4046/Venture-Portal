import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Commission Calculation: the months that have sales data, and what this
 * sub-department has made of each one.
 *
 * The sales import is department-wide — one ERP export per month covers every
 * sub-department — but a RUN is not: `uq_comm_run_per_sub_dept_period` gives
 * each sub-department its own run for the month, computed against its own
 * scheme. So the months come from the batches and the money comes from this
 * sub-department's runs alone.
 */
export default async function CommissionCalculationPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const thisPeriod = getPeriodMonth()

  const [{ data: batches }, { data: runs }] = await Promise.all([
    supabase
      .from('sales_import_batches')
      .select('id, period_month, file_name, order_count, out_of_period_count, cancelled_count, unmatched_agent_count, created_at')
      .eq('status', 'committed')
      .order('period_month', { ascending: false }),
    supabase
      .from('comm_runs')
      .select('period_month, status, total_commission, staff_count')
      .eq('sub_department_id', subDept.id),
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

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Commission Calculation</h1>
        </div>
        <Link
          href={revenuePath(subDept.slug, thisPeriod, 'import')}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Import sales orders
        </Link>
      </div>

      {!subDept.schemeId ? (
        <div className="bg-surface-2 border border-hairline text-graphite rounded-md p-4 mb-8 text-sm font-sans">
          {subDept.name} has no active scheme, so nothing can be computed for it yet. Set one up
          under{' '}
          <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
            Rules
          </Link>
          .
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
                          href={revenuePath(subDept.slug, b.period_month)}
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
            href={revenuePath(subDept.slug, thisPeriod, 'import')}
            className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
          >
            Import sales orders
          </Link>
        </div>
      )}
    </div>
  )
}
