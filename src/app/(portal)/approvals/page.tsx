import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { poolLabel } from '@/lib/pools'
import { resolveLiveApprovalAmounts } from '@/lib/approval-amounts'
import {
  buildQueueRows,
  executiveSubmitterIds,
  queueSummary,
  recentDecisionRows,
  type ApprovalRequestRow,
} from '@/lib/approval-queue'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import PendingApprovals, { type PendingRow } from './_components/PendingApprovals'
import RecentDecisions from './_components/RecentDecisions'

// The Principal's queue on the sheet (DESIGN.md › Sheet theme; the user
// approved the Approvals sample 2026-10-07): four summary cards, the pending
// queue as a table with one bar for what is ticked, the recent decisions as a
// table. The approve / reject flows, combined approvals and the ticks that
// survive a drill-down are as they were.

const uniq = (xs: string[]) => [...new Set(xs)]

/** "today", "1 day", "5 days". */
function waitLabel(days: number): string {
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

export default async function ApprovalsPage() {
  const user = await requirePermission('approvals')
  const supabase = await createClient()
  const since = dayjs().subtract(30, 'day').toISOString()

  const [{ data: pendingRows }, { data: recentRows }, { data: submitters }, { count: approved30 }, { count: rejected30 }] =
    await Promise.all([
      supabase.from('approval_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('approval_requests').select('*').neq('status', 'pending').order('approved_at', { ascending: false }).limit(10),
      supabase.from('users').select('id, name'),
      supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('approved_at', since),
      supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'rejected').gte('approved_at', since),
    ])

  const pending = (pendingRows ?? []) as ApprovalRequestRow[]
  const recent = (recentRows ?? []) as ApprovalRequestRow[]
  const submitterMap = new Map((submitters ?? []).map((u) => [u.id, u.name as string]))
  const nameOf = (id: string) => submitterMap.get(id) ?? 'Unknown'

  // approval_requests.amount is a submit-time snapshot that no edit path
  // refreshes, so an edited-after-submit voucher showed the OLD figure here
  // while the detail page (and the posting) used the new one. Read the amount
  // through to the target row instead — see lib/approval-amounts.ts.
  const liveAmounts = await resolveLiveApprovalAmounts(supabase, [...pending, ...recent])
  const amountOf = (row: ApprovalRequestRow): number | null =>
    liveAmounts.has(row.id) ? liveAmounts.get(row.id)! : row.amount === null ? null : Number(row.amount)

  const rows = buildQueueRows(pending, { amountOf, nameOf })
  const decisions = recentDecisionRows(recent, { amountOf, nameOf })

  // Two lookups that hang off the queue: which submitters are "the executive"
  // (their staff title's level, HR's own banding), and the pool / category
  // behind each waiting voucher for the phone's panel.
  const submitterIds = uniq(pending.map((r) => r.submitted_by))
  const voucherIds = uniq(rows.flatMap((r) => r.voucherIds))
  const [{ data: staff }, { data: sources }] = await Promise.all([
    submitterIds.length > 0
      ? supabase.from('hr_staff_costs').select('user_id, title_id').in('user_id', submitterIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string | null; title_id: string | null }> }),
    voucherIds.length > 0
      ? supabase
          .from('payment_voucher_sources')
          .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
          .in('voucher_id', voucherIds)
          .order('amount', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ])
  const titleIds = uniq((staff ?? []).map((s) => s.title_id).filter((id): id is string => !!id))
  const [{ data: titles }, { data: levels }] =
    titleIds.length > 0
      ? await Promise.all([
          supabase.from('titles').select('id, level_id').in('id', titleIds),
          supabase.from('title_levels').select('id, name, rank'),
        ])
      : [{ data: [] as Array<{ id: string; level_id: string | null }> }, { data: [] as Array<{ id: string; name: string; rank: number }> }]
  const executives = executiveSubmitterIds(staff ?? [], titles ?? [], levels ?? [])
  const summary = queueSummary(rows, new Date(), executives)

  const poolsByVoucher = new Map<string, string[]>()
  const categoriesByVoucher = new Map<string, string[]>()
  for (const s of (sources ?? []) as Array<{
    voucher_id: string
    pool: string
    account_code: string | null
    chart_of_accounts: { name: string } | null
  }>) {
    const pools = poolsByVoucher.get(s.voucher_id) ?? []
    if (!pools.includes(poolLabel(s.pool))) pools.push(poolLabel(s.pool))
    poolsByVoucher.set(s.voucher_id, pools)
    const label = s.chart_of_accounts?.name ?? (s.account_code ? s.account_code.replace(/_/g, ' ') : null)
    if (label) {
      const cats = categoriesByVoucher.get(s.voucher_id) ?? []
      if (!cats.includes(label)) cats.push(label)
      categoriesByVoucher.set(s.voucher_id, cats)
    }
  }
  const queue: PendingRow[] = rows.map((r) => ({
    ...r,
    pool: uniq(r.voucherIds.flatMap((id) => poolsByVoucher.get(id) ?? [])).join(' + '),
    category: uniq(r.voucherIds.flatMap((id) => categoriesByVoucher.get(id) ?? [])).join(' + '),
  }))

  const canSetDefault = user.role === 'finance' || user.role === 'principal'
  const decided = (approved30 ?? 0) + (rejected30 ?? 0)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> APPROVALS · PRINCIPAL QUEUE
          </div>
          <h1 className="page-title">Approvals</h1>
        </div>
      </div>

      {/* ───────── Summary cards: what waits is the one primary; the oldest wait
          turns to a warning after a couple of days. ───────── */}
      <StatCards label="Approvals">
        <StatCard
          tone="primary"
          label="Pending · to approve"
          value={formatMoney(summary.total)}
          icon="check"
          note={`${summary.items} ${summary.items === 1 ? 'item' : 'items'}${summary.combined > 0 ? ` · ${summary.combined} combined` : ''}`}
        />
        <StatCard
          tone={summary.oldest && summary.oldest.days >= 3 ? 'alert' : 'default'}
          label="Oldest waiting"
          value={summary.oldest ? waitLabel(summary.oldest.days) : '—'}
          icon="clock"
          note={
            summary.oldest
              ? `${summary.oldest.row.voucherNo ?? summary.oldest.row.typeLabel} · since ${dayjs(summary.oldest.row.submittedAt).format('D MMM')}`
              : 'Nothing waiting'
          }
        />
        <StatCard
          label="Submitted by the executive"
          value={formatMoney(summary.bySubmitters.amount)}
          icon="user"
          note={`${summary.bySubmitters.count} of the ${summary.items}${
            summary.bySubmitters.names.length > 0 ? ` · ${summary.bySubmitters.names.join(', ')}` : ''
          }`}
        />
        <StatCard
          label="Decided · 30 days"
          value={String(decided)}
          icon="receipt"
          note={`${approved30 ?? 0} approved · ${rejected30 ?? 0} rejected`}
        />
      </StatCards>

      {/* ───────── Pending queue (multi-select + the decision bar) ───────── */}
      <PendingApprovals rows={queue} canSetDefault={canSetDefault} />

      {/* ───────── Recent history ───────── */}
      <RecentDecisions rows={decisions} canSetDefault={canSetDefault} />
    </div>
  )
}
