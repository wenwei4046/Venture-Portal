import { notFound } from 'next/navigation'
import { requirePage } from '@/lib/auth'
import { officeToday } from '@/lib/office-time'
import { readWindow } from '@/lib/marketing/calendar'
import { readBoard, readSubFeed } from '@/lib/marketing/server'
import SubsidiaryPage from '@/components/mkt/subsidiary/SubsidiaryPage'

export const dynamic = 'force-dynamic'

/** A subsidiary — or one of Marketing's own clients — by its code (2026-10-23, the handoff's `Subsidiary Page.dc.html`):
 * where its work stands, its dates, its projects and their newest trail lines. */
export default async function MarketingSubsidiaryPage({ params }: { params: Promise<{ code: string }> }) {
  await requirePage('/marketing/subsidiaries/[code]')
  const { code } = await params
  // The Calendar's window: four months back, eight ahead, so Month / Week / Timeline step without a read.
  const board = await readBoard(readWindow(officeToday()))
  const sub = board.subs.find(x => x.code === decodeURIComponent(code).toUpperCase())
  if (!sub) notFound()
  const feed = await readSubFeed(sub.id)
  return <SubsidiaryPage key={sub.id} board={board} sub={sub} feed={feed} />
}
