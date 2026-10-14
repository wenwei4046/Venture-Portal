import { officeTime } from '@/lib/office-time'
import { requireApprovalQueue, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import PendingApprovals from './_components/PendingApprovals'
import RecentDecisions from './_components/RecentDecisions'
import { readApprovalQueue } from './_lib/queue-read'

// The Principal's queue on the sheet (DESIGN.md › Sheet theme; the user
// approved the Approvals sample 2026-10-07): four summary cards, the pending
// queue as a table with one bar for what is ticked, the recent decisions as a
// table. The approve / reject flows, combined approvals and the ticks that
// survive a drill-down are as they were.

/** "today", "1 day", "5 days". */
function waitLabel(days: number): string {
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

export default async function ApprovalsPage() {
  await requirePage('/approvals')
  // The queue opens for whoever may see it or decide anything in it; what each
  // may decide is asked row by row below (2026-10-09, approvals by domain).
  const user = await requireApprovalQueue()
  const supabase = await createClient()

  // The queue, its live amounts, its panel and who may decide what (`_lib/queue-read` — the Finance phone app's read too).
  const { queue, decisions, summary, undecidable, approved30, rejected30 } = await readApprovalQueue(supabase, user)

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
              ? `${summary.oldest.row.voucherNo ?? summary.oldest.row.typeLabel} · since ${officeTime(summary.oldest.row.submittedAt).format('D MMM')}`
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
      <PendingApprovals rows={queue} canSetDefault={canSetDefault} undecidable={undecidable} />

      {/* ───────── Recent history ───────── */}
      <RecentDecisions rows={decisions} canSetDefault={canSetDefault} />
    </div>
  )
}
