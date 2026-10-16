'use client'

import { useRouter } from 'next/navigation'
import { useMemo, type CSSProperties } from 'react'
import base from '@/components/member/app/base.module.css'
import shell from '@/components/member/app/shell.module.css'
import RoomsPage, { RoomBookSheet, RoomViewSheet } from '@/components/member/app/profile/RoomsPage'
import { useMemberRooms, type RoomsSource } from '@/components/member/app/profile/useMemberRooms'
import type { MemberRoomsData } from '@/components/member/app/profile/rooms-model'
import { bookRoom, cancelBooking, readRoomsWeek } from '@/lib/rooms/actions'
import { useChrome, useFrame } from './FinAppFrame'
import { canStepBack, setIntent } from './nav'
import s from './fin-app.module.css'

// Profile › Admin › Meeting Rooms in the Finance phone app (2026-10-15, part
// E3). The user: "Meeting room 已经有手机版本的设计了，其实可以参考 Revenue
// Apps 的 Meeting Room 那边，Book a Room 点进去的设计是一样的" — so it IS the
// Revenue app's Book a room: its page, its two sheets and its state
// (`useMemberRooms`), drawn in the Revenue app's own frame and theme
// (`data-revenue-app`, the screen fixed to the phone), seven days from today.
// It reads and books under the portal's own gates — Meeting rooms · View
// reads, Create books (source 'portal'), whoever booked a meeting cancels it —
// as Admin › Meeting Rooms does; View as a person reads only.

/** The portal's rooms actions in the shape Book a room reads them. */
export const PORTAL_ROOMS: RoomsSource = {
  async rooms(from, to) {
    const r = await readRoomsWeek(from, to)
    return r.ok ? { ok: true, data: { range: r.range, people: r.people } } : { ok: false, error: r.reason }
  },
  async bookRoom(input) {
    const r = await bookRoom({
      id: null,
      room: input.room,
      day: input.day,
      from: input.from,
      to: input.to,
      title: input.title,
      department: input.department,
      subDepartment: input.subDepartment,
      bookedBy: null,
      internal: input.internal,
      guests: [],
      pax: input.pax,
      source: 'portal',
    })
    return r.ok ? { ok: true, data: { id: r.id, ref: r.ref } } : { ok: false, error: r.reason }
  },
  async cancelBooking(id) {
    const r = await cancelBooking(id)
    return r.ok ? { ok: true, data: true } : { ok: false, error: r.reason }
  },
}

export default function RoomsApp({ today, initial, message, canBook, readOnly }: {
  today: string
  initial: MemberRoomsData | null
  /** Said instead of the schedule when the page could not read it. */
  message: string | null
  canBook: boolean
  readOnly: boolean
}) {
  const router = useRouter()
  const { platform } = useFrame()
  useChrome({ root: false, bar: false, bulk: false })
  const rooms = useMemberRooms({ active: true, source: PORTAL_ROOMS, today, initial, readOnly, canBook })
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app/profile')
  }
  const vars = useMemo(() => ({ '--status-bg': 'var(--rv-white)', '--status-h': 'env(safe-area-inset-top, 0px)' }) as CSSProperties, [])
  return (
    <div className={`${base.root} ${shell.app}`} data-revenue-app="">
      <div className={`${shell.screen} ${shell.screenLive}`} style={vars} data-platform={platform}>
        <main className={`${shell.main} ${s.roomsMain}`}>
          {/* The server's refusal stands until a read of the phone's own answers. */}
          <RoomsPage {...rooms.page} message={rooms.page.data ? rooms.page.message : (rooms.page.message ?? message)} onBack={leave} />
        </main>
        <RoomBookSheet {...rooms.book} />
        <RoomViewSheet {...rooms.view} />
      </div>
    </div>
  )
}
