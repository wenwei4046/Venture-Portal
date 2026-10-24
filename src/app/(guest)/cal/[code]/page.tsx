import type { Metadata } from 'next'
import { readPicCalendar } from '@/lib/marketing/pic-server'
import PicCalendarView from './_components/PicCalendarView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'HOUZS Marketing · Calendar',
  robots: { index: false, follow: false },
}

/**
 * The PIC's calendar (2026-10-24, Marketing ⑤-2 — `PIC Calendar.dc.html`, the prototype's "Calendar link (Carres ·
 * Kelvin)"): public, no sign-in, outside the portal's layout, as the PIC's link /t/<code>. The code in the address is the
 * only key; the database answers "closed" for a wrong one, or once the subsidiary's PIC is not the one it was made for.
 * Never requirePage — there is no account here.
 */
export default async function PicCalendarPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <PicCalendarView cal={await readPicCalendar(code)} />
}
