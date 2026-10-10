import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { canDo } from '@/lib/permission-actions'
import { HvPage, PageHead, btn, hv } from '@/components/hrv/kit'
import { requireSubDepartment } from '../_lib/sub-departments'
import { headers } from 'next/headers'
import { loadErpSyncPanelData } from '../_lib/erp-sync-panel'
import { loadErpLinkView, receiverUrlFor } from '../_lib/erp-link'
import { loadClosedMonthsOrNone, loadCutoverOrNone, settledByHand } from '../_lib/erp-feed-month'
import { loadDoubleClaims } from '../_lib/double-claims'
import { loadSwitcherData } from '../_lib/switcher'
import { openClaimsByMonth } from '@/lib/commission/double-claims'
import { formatAgo } from '@/lib/erp-sync/format'
import SubDeptSwitcher from '../_components/SubDeptSwitcher'
import CommCalBody, { type CommCalCard, type CommCalMonth } from '../_components/commcal/CommCalBody'
import s from '../_components/commcal/CommCal.module.css'

interface PageProps {
  params: Promise<{ sub: string }>
}

/** A sub-department with no month yet (the handoff's IR). */
function NoSalesData({ period, importHref }: { period: string; importHref: string | null }) {
  return (
    <div className={hv.empty} style={{ padding: '48px 24px' }}>
      <p className={s.emptyEyebrow}>{label(period)}</p>
      <p className={s.emptyTitle}>No sales data yet.</p>
      <p className={s.emptyText}>
        Commission is worked out from the ERP&apos;s sales orders — one row per product line, with the salesperson on each
        order. They arrive live from the ERP once its key is pasted below and its feed is switched on; until then, import a
        month&apos;s export to begin.
      </p>
      {importHref ? (
        <Link href={importHref} className={btn('primary')} style={{ display: 'inline-block', padding: '9px 20px' }}>
          Import sales orders
        </Link>
      ) : null}
    </div>
  )
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function monthOnly(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
}

/**
 * Commission Calculation: the months that have sales data, and what this
 * sub-department has made of each one (2026-10-10, the HR revamp handoff:
 * a status strip, five cards, the months; the ERP link and its feed in the
 * Data source drawer; the first month paid behind Change).
 *
 * Batches and runs both belong to this sub-department. Membership in more
 * than one programme never makes an order pay through several programmes.
 */
export default async function CommissionCalculationPage({ params }: PageProps) {
  const user = await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const thisPeriod = getPeriodMonth()

  const [{ data: batches }, { data: runs }, sync, switcher] = await Promise.all([
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
    loadSwitcherData(user, subDept),
  ])
  // The link belongs to the programme the ERP feed belongs to (Fair), which is
  // what a non-null sync panel says. The receiver address the ERP must send to
  // is this very host.
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

  const rows = (batches ?? []) as Array<{
    id: string
    period_month: string
    file_name: string
    source: string
    last_synced_at: string | null
    order_count: number
    unmatched_agent_count: number
    created_at: string
  }>

  const months: CommCalMonth[] = rows.map(b => {
    const run = runByPeriod.get(b.period_month)
    const held = heldByMonth.get(b.period_month)
    const file = b.source === 'erp_sync' ? null : b.file_name
    // A month's source is a state — a word on a wash — with the file it came
    // from on a line of its own.
    const source: CommCalMonth['source'] = settledByHand(b.period_month, cutover)
      ? { tone: 'info', text: `Settled by hand${held ? ` · ${held} held` : ''}`, file }
      : closedMonths.has(b.period_month)
        ? { tone: 'alert', text: `ERP closed${held ? ` · ${held} held` : ''}`, file }
        : b.source === 'erp_sync'
          ? { tone: 'ledger', text: `ERP live · ${formatAgo(b.last_synced_at)}`, file: null }
          : { tone: 'info', text: 'Imported file', file }
    return {
      period: b.period_month,
      label: label(b.period_month),
      href: revenuePath(subDept.slug, b.period_month),
      orders: b.order_count,
      unmatched: b.unmatched_agent_count,
      run: run ? { status: run.status, total: Number(run.total_commission) } : null,
      claims: claimsByMonth.get(b.period_month) ?? 0,
      source,
    }
  })

  // The cards, from what the page has already read — nothing is queried for
  // them. Rows come newest first; a paper claimed twice counts once, however
  // many months it turns up in.
  const latest = rows[0] ?? null
  const previous = rows[1] ?? null
  const oldest = rows.length > 0 ? rows[rows.length - 1] : null
  const latestRun = latest ? runByPeriod.get(latest.period_month) ?? null : null
  const openDoubleClaims = doubleClaims.groups.filter(g => !g.dismissed).length
  const claimMonth = months.find(m => m.claims > 0)

  const cards: CommCalCard[] = latest && oldest
    ? [
        { label: 'Months with sales data', value: String(rows.length), note: `Since ${label(oldest.period_month)}`, icon: 'calendar', tone: 'default' },
        latestRun
          ? {
              label: `${monthOnly(latest.period_month)} commission`,
              value: formatMoney(Number(latestRun.total_commission)),
              note: `${label(latest.period_month)} · ${latestRun.status}`,
              icon: 'percent',
              tone: 'primary',
              href: revenuePath(subDept.slug, latest.period_month),
            }
          : {
              // Not the walnut card with "—" (the handoff): the month waits on a compute.
              label: `${monthOnly(latest.period_month)} commission`,
              value: 'Not computed',
              note: `Open ${monthOnly(latest.period_month)} to compute`,
              icon: 'percent',
              tone: 'alert',
              href: revenuePath(subDept.slug, latest.period_month),
              noteLink: true,
            },
        {
          label: `${monthOnly(latest.period_month)} orders`,
          value: String(latest.order_count),
          note: previous ? `${previous.order_count} in ${monthOnly(previous.period_month)}` : label(latest.period_month),
          icon: 'receipt',
          tone: 'default',
        },
        {
          label: 'Unmatched agents',
          value: String(latest.unmatched_agent_count),
          note: label(latest.period_month),
          icon: 'people',
          tone: latest.unmatched_agent_count > 0 ? 'danger' : 'default',
        },
        {
          label: 'Possible double claims',
          value: doubleClaims.unavailable ? '—' : String(openDoubleClaims),
          note: doubleClaims.unavailable ? 'Could not be checked' : 'Across every month',
          icon: 'fileAlert',
          tone: !doubleClaims.unavailable && openDoubleClaims > 0 ? 'danger' : 'default',
          href: claimMonth ? `${claimMonth.href}?view=claims` : undefined,
        },
      ]
    : []

  const settled = months.filter(m => settledByHand(m.period, cutover)).map(m => m.period).sort()
  const settledRange = settled.length === 0
    ? null
    : settled.length === 1
      ? monthOnly(settled[0])
      : `${monthOnly(settled[0])}–${monthOnly(settled[settled.length - 1])}`

  const importHref = revenuePath(subDept.slug, thisPeriod, 'import')
  const canImport = canDo(user, 'revenue', 'create')

  return (
    <HvPage>
      <PageHead
        eyebrow={`Revenue · ${subDept.name}`}
        title="Commission Calculation"
        right={
          <>
            <SubDeptSwitcher data={switcher} view="cc" />
            {rows.length > 0 && canImport ? (
              <Link href={importHref} className={btn('primary')} style={{ padding: '9px 16px', fontSize: 13.5 }}>
                Import sales orders
              </Link>
            ) : null}
          </>
        }
      />

      {!subDept.schemeId ? (
        <div className="sheet-notice">
          {subDept.name} has no active scheme, so nothing can be computed for it yet. Set one up under{' '}
          <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
            Rules
          </Link>
          .
        </div>
      ) : null}

      {/* A sub-department the ERP feeds keeps its strip with nothing in it
          yet — Data source is where its key is pasted. */}
      {rows.length > 0 || sync ? (
        <CommCalBody
          data={{
            sub: { id: subDept.id, name: subDept.name, slug: subDept.slug, schemeId: subDept.schemeId },
            months,
            cards,
            cutover,
            settledRange,
            link,
            sync,
            canManage: canDo(user, 'revenue', 'manage'),
            canEdit: canDo(user, 'revenue', 'edit'),
          }}
          empty={rows.length === 0 ? <NoSalesData period={thisPeriod} importHref={canImport ? importHref : null} /> : null}
        />
      ) : (
        <NoSalesData period={thisPeriod} importHref={canImport ? importHref : null} />
      )}
    </HvPage>
  )
}
