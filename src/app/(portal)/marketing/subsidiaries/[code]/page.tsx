import { notFound } from 'next/navigation'
import { requireAuth, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { officeToday } from '@/lib/office-time'
import { readWindow } from '@/lib/marketing/calendar'
import { readBoard, readClientBill, readSubFeed, readSubKeyDates } from '@/lib/marketing/server'
import SubsidiaryPage from '@/components/mkt/subsidiary/SubsidiaryPage'

export const dynamic = 'force-dynamic'

/** A subsidiary — or one of Marketing's own clients — by its code (2026-10-23, the handoff's `Subsidiary Page.dc.html`):
 * where its work stands, its dates, its projects and their newest trail lines; the manager edits its PICs, and a
 * client's name (2026-10-24, ②b-2d-2a) and its billing details (②b-2b — `?edit=1` opens Edit, from Billing); its own
 * key dates, kept by everybody with Marketing · Edit (2026-10-25). */
export default async function MarketingSubsidiaryPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requirePage('/marketing/subsidiaries/[code]')
  const user = await requireAuth()
  const [{ code }, sp] = await Promise.all([params, searchParams])
  // The Calendar's window: four months back, eight ahead, so Month / Week / Timeline step without a read.
  const board = await readBoard(readWindow(officeToday()))
  const sub = board.subs.find(x => x.code === decodeURIComponent(code).toUpperCase())
  if (!sub) notFound()
  const manage = canDo(user, 'marketing', 'manage')
  const [feed, keyDates, bill] = await Promise.all([
    readSubFeed(sub.id), readSubKeyDates(sub.id), manage && sub.client ? readClientBill(sub.id) : Promise.resolve(null),
  ])
  return (
    <SubsidiaryPage key={sub.id} board={board} sub={sub} feed={feed} keyDates={keyDates} edit={canDo(user, 'marketing', 'edit')} manage={manage}
      bill={bill} openEdit={manage && sp.edit === '1'} />
  )
}
