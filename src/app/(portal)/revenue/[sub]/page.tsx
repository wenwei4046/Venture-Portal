import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../_lib/sub-departments'
import { headers } from 'next/headers'
import { loadErpSyncPanelData } from '../_lib/erp-sync-panel'
import { loadErpLinkView, receiverUrlFor } from '../_lib/erp-link'
import { loadClosedMonthsOrNone, loadCutoverOrNone, settledByHand } from '../_lib/erp-feed-month'
import PaysFromControl from '../_components/PaysFromControl'
import { loadDoubleClaims } from '../_lib/double-claims'
import { openClaimsByMonth } from '@/lib/commission/double-claims'
import ErpSyncPanel from '../_components/ErpSyncPanel'
import ErpLinkPanel from '../_components/ErpLinkPanel'
import { formatAgo } from '@/lib/erp-sync/format'

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
 * Batches and runs both belong to this sub-department. Membership in more
 * than one programme never makes an order pay through several programmes.
 */
export default async function CommissionCalculationPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const thisPeriod = getPeriodMonth()

  const [{ data: batches }, { data: runs }, sync] = await Promise.all([
    supabase
      .from('sales_import_batches')
      .select('id, period_month, file_name, source, last_synced_at, order_count, out_of_period_count, cancelled_count, unmatched_agent_count, created_at')
      .eq('sub_department_id', subDept.id)
      .eq('status', 'committed')
      .order('period_month', { ascending: false }),
    supabase
      .from('comm_runs')
      .select('period_month, status, total_commission, staff_count')
      .eq('sub_department_id', subDept.id),
    loadErpSyncPanelData(supabase, subDept.id),
  ])
  // The link card belongs to the programme the ERP feed belongs to (Fair),
  // which is what a non-null sync panel says. The receiver address the ERP
  // must send to is this very host.
  let link = null
  if (sync) {
    const h = await headers()
    link = await loadErpLinkView(supabase, subDept.id, receiverUrlFor(h.get('x-forwarded-host') ?? h.get('host')))
  }

  // Months closed to the feed, what it has held for each, and the bills that
  // may be claimed twice (2026-09-26) — each month says so in its own row.
  const [closedMonths, doubleClaims, cutover] = await Promise.all([
    sync ? loadClosedMonthsOrNone(supabase, subDept.id) : Promise.resolve(new Map<string, never>()),
    loadDoubleClaims(supabase, subDept.id),
    loadCutoverOrNone(supabase, subDept.id),
  ])
  const heldByMonth = new Map((sync?.held ?? []).map(h => [h.period, h.count]))
  const claimsByMonth = openClaimsByMonth(doubleClaims.groups)

  const runByPeriod = new Map(
    ((runs ?? []) as Array<{ period_month: string; status: string; total_commission: number | string; staff_count: number }>)
      .map(r => [r.period_month, r]),
  )

  const rows = ((batches ?? []) as Array<{
    id: string
    period_month: string
    file_name: string
    source: string
    last_synced_at: string | null
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

      {subDept.schemeId ? <PaysFromControl subDepartmentId={subDept.id} cutover={cutover} /> : null}

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
                  <th className="m-hide">Source</th>
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
                        {claimsByMonth.get(b.period_month) ? (
                          <div className="font-mono text-[10.5px] text-danger mt-0.5">
                            {claimsByMonth.get(b.period_month)} POSSIBLE DOUBLE CLAIM{claimsByMonth.get(b.period_month) === 1 ? '' : 'S'}
                          </div>
                        ) : null}
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
                      <td className="font-mono text-xs text-muted m-hide" data-label="Source">
                        {settledByHand(b.period_month, cutover) ? (
                          <span className="text-graphite">
                            Settled by hand{heldByMonth.get(b.period_month) ? ` · ${heldByMonth.get(b.period_month)} held` : ''}
                            {b.source === 'erp_sync' ? '' : ` · ${b.file_name}`}
                          </span>
                        ) : closedMonths.has(b.period_month) ? (
                          <span className="text-alert">
                            ERP closed{heldByMonth.get(b.period_month) ? ` · ${heldByMonth.get(b.period_month)} held` : ''}
                            {b.source === 'erp_sync' ? '' : ` · ${b.file_name}`}
                          </span>
                        ) : b.source === 'erp_sync' ? (
                          <span className="text-ledger">ERP live · {formatAgo(b.last_synced_at)}</span>
                        ) : (
                          b.file_name
                        )}
                      </td>
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
          <p className="font-serif text-2xl text-ink mb-3">No sales data yet.</p>
          <p className="font-serif italic text-muted text-sm mb-8 max-w-lg mx-auto">
            Commission is worked out from the ERP&apos;s sales orders — one row per product line,
            with the salesperson on each order. They arrive live from the ERP once its key is
            pasted below and its feed is switched on; until then, import a month&apos;s export to begin.
          </p>
          <Link
            href={revenuePath(subDept.slug, thisPeriod, 'import')}
            className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
          >
            Import sales orders
          </Link>
        </div>
      )}

      {link ? <ErpLinkPanel view={link} lastEventAt={sync?.lastEventAt ?? null} /> : null}
      {sync ? <ErpSyncPanel data={sync} /> : null}
    </div>
  )
}
