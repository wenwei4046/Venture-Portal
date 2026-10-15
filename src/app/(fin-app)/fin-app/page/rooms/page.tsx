import type { Viewport } from 'next'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { officeToday } from '@/lib/office-time'
import { shiftDay } from '@/lib/rooms/model'
import { readRoomsPeople, readRoomsRange } from '@/lib/rooms/read'
import { interTight } from '@/components/member/app/fonts'
import RoomsApp from '@/components/fin-app/RoomsApp'

export const dynamic = 'force-dynamic'
// The Revenue app's page is white to the top: the phone's status bar takes it, as the Revenue app's (its layout).
export const viewport: Viewport = { themeColor: '#ffffff' }

/**
 * `/fin-app/page/rooms` — Profile › Admin › Meeting Rooms in the Finance phone
 * app (2026-10-15, part E3): the Revenue app's Book a room (the user's call),
 * under Admin › Meeting Rooms' own gates — its tabs, Meeting rooms · View —
 * with the seven days from the office's today read with the page. Create books
 * (narrowed by the page's tabs, `requirePage`); View as a person reads only.
 * Inter Tight, the Revenue app's display face, on a wrapper that draws no box.
 */
export default async function FinAppRooms() {
  await requirePage('/admin/rooms')
  const user = await requirePermission('meeting_rooms', 'meeting_rooms_manage')
  const today = officeToday()
  const [range, people] = await Promise.all([readRoomsRange(today, shiftDay(today, 6)), readRoomsPeople()])
  return (
    <div className={interTight.variable} style={{ display: 'contents' }}>
      <RoomsApp
        today={today}
        initial={range.ok && people.ok ? { range: range.data, people: people.data } : null}
        message={!range.ok ? range.reason : !people.ok ? people.reason : null}
        canBook={canDo(user, 'rooms', 'create')}
        readOnly={!!user.viewingAs}
      />
    </div>
  )
}
