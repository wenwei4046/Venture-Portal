import { notFound } from 'next/navigation'
import { requireAuth, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { officeToday } from '@/lib/office-time'
import { readWindow } from '@/lib/marketing/calendar'
import { readBoard, readSubFeed } from '@/lib/marketing/server'
import SubsidiaryPage from '@/components/mkt/subsidiary/SubsidiaryPage'

export const dynamic = 'force-dynamic'

/** A subsidiary — or one of Marketing's own clients — by its code (2026-10-23, the handoff's `Subsidiary Page.dc.html`):
 * where its work stands, its dates, its projects and their newest trail lines; the manager edits its PICs, and a
 * client's name (2026-10-24, ②b-2d-2a). */
export default async function MarketingSubsidiaryPage({ params }: { params: Promise<{ code: string }> }) {
  await requirePage('/marketing/subsidiaries/[code]')
  const user = await requireAuth()
  const { code } = await params
  // The Calendar's window: four months back, eight ahead, so Month / Week / Timeline step without a read.
  const board = await readBoard(readWindow(officeToday()))
  const sub = board.subs.find(x => x.code === decodeURIComponent(code).toUpperCase())
  if (!sub) notFound()
  const feed = await readSubFeed(sub.id)
  return <SubsidiaryPage key={sub.id} board={board} sub={sub} feed={feed} manage={canDo(user, 'marketing', 'manage')} />
}
