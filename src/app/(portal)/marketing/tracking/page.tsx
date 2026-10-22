import { requireActionOn, requirePage } from '@/lib/auth'
import { trackTasks } from '@/lib/marketing/tracking'
import { readBoard } from '@/lib/marketing/server'
import TrackingDashboard from '@/components/mkt/tracking/TrackingDashboard'

export const dynamic = 'force-dynamic'

/** The Tracking Dashboard — the manager's view of everybody's work (2026-10-23, `Tracking Dashboard.dc.html`). */
export default async function MarketingTrackingPage() {
  await requirePage('/marketing/tracking')
  // The manager's: Marketing · Manage.
  await requireActionOn('/marketing/tracking', 'marketing', 'manage')
  const board = await readBoard()
  return <TrackingDashboard board={board} tasks={trackTasks(board, new Date())} />
}
