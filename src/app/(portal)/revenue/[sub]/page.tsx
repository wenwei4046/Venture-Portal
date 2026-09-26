import Link from 'next/link'
import WarmLink from '@/components/layout/WarmLink'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
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
 * A run's state is a word on a wash (the sheet never says a thing in coloured
 * lettering alone): amber still waits on a compute, orange is computed and
 * ready to apply, green has reached payroll.
 */
function RunChip({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="chip">
        <span className="dot" />
        not computed
      </span>
    )
  }
  const tone =
    status === 'applied' || status === 'locked'
      ? 'ledger'
      : status === 'computed'
        ? 'accent'
        : status === 'draft'
          ? 'alert'
          : null
  return (
    <span className={tone ? `chip ${tone}` : 'chip'}>
      <span className="dot" />
      {status}
    </span>
  )
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

  // The summary cards, from what the page has already read — nothing is
  // queried for them. Rows come newest first, so the first is the latest
  // month and the last the oldest; a paper claimed twice counts once, however
  // many months it turns up in.
  const latest = rows[0] ?? null
  const oldest = rows.length > 0 ? rows[rows.length - 1] : null
  const latestRun = latest ? runByPeriod.get(latest.period_month) ?? null : null
  const openDoubleClaims = doubleClaims.groups.filter(g => !g.dismissed).length

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
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
        >
          Import sales orders
        </Link>
      </div>

      {!subDept.schemeId ? (
        <div className="sheet-notice">
          {subDept.name} has no active scheme, so nothing can be computed for it yet. Set one up
          under{' '}
          <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
            Rules
          </Link>
          .
        </div>
      ) : null}

      {latest && oldest ? (
        <StatCards label={`Commission Calculation for ${subDept.name}`}>
          <StatCard
            label="Months with sales data"
            value={String(rows.length)}
            icon="calendar"
            note={`Since ${label(oldest.period_month)}`}
          />
          <StatCard
            label="Latest month's commission"
            value={latestRun ? formatMoney(Number(latestRun.total_commission)) : '—'}
            icon="percent"
            tone="primary"
            note={`${label(latest.period_month)} · ${latestRun ? latestRun.status : 'not computed'}`}
          />
          <StatCard
            label="Latest month's orders"
            value={String(latest.order_count)}
            icon="receipt"
            note={label(latest.period_month)}
          />
          <StatCard
            label="Unmatched agents"
            value={String(latest.unmatched_agent_count)}
            icon="people"
            tone={latest.unmatched_agent_count > 0 ? 'danger' : undefined}
            note={label(latest.period_month)}
          />
          <StatCard
            label="Possible double claims"
            value={doubleClaims.unavailable ? '—' : String(openDoubleClaims)}
            icon="file-alert"
            tone={!doubleClaims.unavailable && openDoubleClaims > 0 ? 'danger' : undefined}
            note={doubleClaims.unavailable ? 'Could not be checked' : 'Across every month'}
          />
        </StatCards>
      ) : null}

      {subDept.schemeId ? <PaysFromControl subDepartmentId={subDept.id} cutover={cutover} /> : null}

      {rows.length > 0 ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Months with sales data</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {rows.length} PERIOD{rows.length === 1 ? '' : 'S'}
            </span>
          </div>
          <div className="overflow-x-auto">
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
                        {/* Rendered while the pointer rests on it: a month is
                            the heaviest page in the department (2026-09-26). */}
                        <WarmLink
                          href={revenuePath(subDept.slug, b.period_month)}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {label(b.period_month)}
                        </WarmLink>
                        {claimsByMonth.get(b.period_month) ? (
                          <div className="text-[11px] font-medium text-danger mt-0.5">
                            {claimsByMonth.get(b.period_month)} possible double claim{claimsByMonth.get(b.period_month) === 1 ? '' : 's'}
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
                      <td className="m-hide" data-label="Run">
                        <RunChip status={run ? run.status : null} />
                      </td>
                      <td className="num">
                        {run ? formatMoney(Number(run.total_commission)) : '—'}
                      </td>
                      <td className="m-hide" data-label="Source">
                        {/* The month's source is a state too — a word on a
                            wash. A file's name is not a state, so it stays
                            plain beside the chip. */}
                        {settledByHand(b.period_month, cutover) ? (
                          <>
                            <span className="chip info">
                              <span className="dot" />
                              Settled by hand{heldByMonth.get(b.period_month) ? ` · ${heldByMonth.get(b.period_month)} held` : ''}
                            </span>
                            {b.source === 'erp_sync' ? null : (
                              <span className="ml-2 font-mono text-[11px]">{b.file_name}</span>
                            )}
                          </>
                        ) : closedMonths.has(b.period_month) ? (
                          <>
                            <span className="chip alert">
                              <span className="dot" />
                              ERP closed{heldByMonth.get(b.period_month) ? ` · ${heldByMonth.get(b.period_month)} held` : ''}
                            </span>
                            {b.source === 'erp_sync' ? null : (
                              <span className="ml-2 font-mono text-[11px]">{b.file_name}</span>
                            )}
                          </>
                        ) : b.source === 'erp_sync' ? (
                          <span className="chip ledger">
                            <span className="dot" />
                            ERP live · {formatAgo(b.last_synced_at)}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px]">{b.file_name}</span>
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
        <div className="border border-hairline rounded-card bg-surface-2 px-6 py-12 text-center mb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-2">{label(thisPeriod)}</p>
          <p className="text-lg font-semibold mb-3">No sales data yet.</p>
          <p className="text-sm mb-6 max-w-lg mx-auto">
            Commission is worked out from the ERP&apos;s sales orders — one row per product line,
            with the salesperson on each order. They arrive live from the ERP once its key is
            pasted below and its feed is switched on; until then, import a month&apos;s export to begin.
          </p>
          <Link
            href={revenuePath(subDept.slug, thisPeriod, 'import')}
            className="inline-block bg-accent hover:bg-accent-hover text-sm px-5 py-2 rounded-control transition-colors"
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
