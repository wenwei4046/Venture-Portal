import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { officeToday } from '@/lib/office-time'
import { isDay } from '@/lib/rooms/model'
import { readRooms, readRoomsPeople, readRoomsRange } from '@/lib/rooms/read'
import { HvPage, PageHead } from '@/components/hrv/kit'
import MeetingRoomsView from './_components/MeetingRoomsView'

export const dynamic = 'force-dynamic'

/**
 * Admin › Meeting Rooms (2026-10-11, the HR revamp's second package — README
 * §14). In every view (the user: "can add on at every view"): whoever holds
 * Meeting rooms · View reads the schedule, Create books, Edit manages the rooms.
 * `?day=` opens another day; `?tab=rooms` the Rooms tab.
 */
export default async function MeetingRoomsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requirePage('/admin/rooms')
  const user = await requirePermission('meeting_rooms', 'meeting_rooms_manage')
  const { day: asked } = await searchParams
  const day = isDay(asked) ? asked : officeToday()
  const canManage = canDo(user, 'rooms', 'edit')
  const [range, people, rooms] = await Promise.all([
    readRoomsRange(day, day),
    readRoomsPeople(),
    canManage ? readRooms() : Promise.resolve(null),
  ])
  if (!range.ok || !people.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Admin · Meeting Rooms" title="Meeting rooms" />
        <div className="sheet-danger">{!range.ok ? range.reason : !people.ok ? people.reason : ''}</div>
      </HvPage>
    )
  }
  return (
    <MeetingRoomsView
      initial={range.data}
      people={people.data}
      rooms={rooms && rooms.ok ? rooms.data : null}
      canBook={canDo(user, 'rooms', 'create')}
      canManage={canManage}
    />
  )
}
