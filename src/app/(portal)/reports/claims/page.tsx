import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { formatMoney } from '@/lib/utils'
import Link from 'next/link'

export default async function ClaimsSummaryPage() {
  await requirePage('/reports/claims')
  await requirePermission('reports', 'claims_approve')
  const supabase = await createClient()

  const claims = await fetchAllRows((lo, hi) => supabase.from('claims').select('claim_type, status, amount').order('id', { ascending: true }).range(lo, hi))

  const stats = {
    benefit: { approved: 0, pending: 0, rejected: 0, approvedAmt: 0, pendingAmt: 0 },
    project: { approved: 0, pending: 0, rejected: 0, approvedAmt: 0, pendingAmt: 0 },
  }

  for (const c of claims ?? []) {
    const type = c.claim_type as 'benefit' | 'project'
    const amt = Number(c.amount)
    if (c.status === 'approved' || c.status === 'paid') {
      stats[type].approved++
      stats[type].approvedAmt += amt
    } else if (c.status === 'pending') {
      stats[type].pending++
      stats[type].pendingAmt += amt
    } else if (c.status === 'rejected') {
      stats[type].rejected++
    }
  }

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CLAIMS SUMMARY
          </div>
          <h1 className="page-title">Claims Summary</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/reports/claims/export?format=xlsx"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href="/reports/claims/export?format=pdf"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-3xl">
        {/* Benefit Claims */}
        <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
          <h3 className="font-serif italic text-ink text-md mb-2">Benefit Claims</h3>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-ledger">Approved</span>
            <span className="num">
              {stats.benefit.approved} claims, {formatMoney(stats.benefit.approvedAmt)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-alert">Pending</span>
            <span className="num">
              {stats.benefit.pending} claims, {formatMoney(stats.benefit.pendingAmt)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-danger">Rejected</span>
            <span className="num text-muted">
              {stats.benefit.rejected} claims
            </span>
          </div>
        </div>

        {/* Pool Claims */}
        <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
          <h3 className="font-serif italic text-ink text-md mb-2">Pool Claims</h3>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-ledger">Approved</span>
            <span className="num">
              {stats.project.approved} claims, {formatMoney(stats.project.approvedAmt)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-alert">Pending</span>
            <span className="num">
              {stats.project.pending} claims, {formatMoney(stats.project.pendingAmt)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-sm text-danger">Rejected</span>
            <span className="num text-muted">
              {stats.project.rejected} claims
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
