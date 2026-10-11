import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadHiringBoard } from '@/lib/hiring/board'
import { officeToday } from '@/lib/office-time'
import HiringInsightsView from '../_components/HiringInsightsView'

export const dynamic = 'force-dynamic'

/**
 * Hiring › Insights (2026-10-11, HR revamp round 2 — README §12): how long
 * each request takes, what it cost and where the hires came from. Hiring ·
 * View reads it; nothing on it writes.
 */
export default async function HiringInsightsPage() {
  await requirePage('/hiring/insights')
  await requirePermission('hiring')
  const read = await loadHiringBoard()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Hiring · Insights" title="Hiring insights" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <HiringInsightsView board={read.board} today={officeToday()} />
}
