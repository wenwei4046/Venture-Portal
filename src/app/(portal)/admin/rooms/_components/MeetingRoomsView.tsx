'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Tabs, useTabParam } from '@/components/hrv/tabs'
import { flash } from '@/components/hrv/toast'
import { readRoomsDay } from '@/lib/rooms/actions'
import { dayHref, dayOfSearch, type Booking, type Room, type RoomsPeople, type RoomsRange } from '@/lib/rooms/model'
import { RoomsSchedule } from './RoomsSchedule'
import { RoomCards } from './RoomCards'
import { BookDrawer, type BookForm } from './BookDrawer'
import { BookingDrawer } from './BookingDrawer'
import { blankForm, formOf } from './book-form'

const TABS = ['schedule', 'rooms'] as const
type Tab = (typeof TABS)[number]

/**
 * Admin › Meeting Rooms (2026-10-11, the HR revamp's second package — README
 * §14): Schedule (a day's grid, a room per column, half hours 08:00–20:00) and,
 * for whoever manages the rooms, Rooms (the cards). Booking opens the 520px
 * drawer; a booking opens its 440px drawer. The day moves with ‹ › Today, read
 * when asked; every write answers in words and the toast says what happened.
 */
export default function MeetingRoomsView({
  initial,
  people,
  rooms: initialRooms,
  canBook,
  canManage,
  legend,
}: {
  initial: RoomsRange
  people: RoomsPeople
  rooms: Room[] | null
  canBook: boolean
  canManage: boolean
  /** The guest link's subsidiaries that may book, for the legend (Admin › Guest Link). */
  legend?: Array<{ code: string; name: string }>
}) {
  const [tab, setTab] = useTabParam<Tab>(TABS, 'schedule')
  const shown: Tab = canManage ? tab : 'schedule'
  const [range, setRange] = useState(initial)
  const [rooms, setRooms] = useState<Room[]>(initialRooms ?? [])
  const [loadingDay, setLoadingDay] = useState(false)
  const [form, setForm] = useState<BookForm | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  // The day wanted (moved at once by ‹ ›), and the day on screen with its today.
  const dayRef = useRef(initial.from)
  const shownRef = useRef(initial)
  // The day the toolbar names: the one asked for, at once, as the prototype's (its grid follows when the read
  // arrives; a read for a day already left is dropped) — 2026-10-11.
  const [want, setWant] = useState(initial.from)

  const show = useCallback((next: RoomsRange) => {
    shownRef.current = next
    dayRef.current = next.from
    setWant(next.from)
    setRange(next)
    setLoadingDay(false)
  }, [])

  // The address carries the day. Handed to Next with `null` — never
  // `history.state`, which Next leaves unread — so its router knows it: a Server
  // Action posts to the router's address, and a write's refresh rendered today
  // under `?day=` and threw the booked day away (2026-10-11).
  const writeDay = useCallback((day: string) => {
    const { pathname, search } = window.location
    window.history.replaceState(null, '', dayHref(pathname, search, day, shownRef.current.today))
  }, [])

  // A fresh page (a write's refresh, the sidebar link) is taken when it is for
  // the day the address asks for — not one rendered for a day already left.
  useEffect(() => {
    if (initial.from === dayOfSearch(window.location.search, initial.today)) show(initial)
  }, [initial, show])
  useEffect(() => {
    if (initialRooms) setRooms(initialRooms)
  }, [initialRooms])

  const goDay = useCallback(async (day: string) => {
    dayRef.current = day
    setWant(day)
    writeDay(day)
    setLoadingDay(true)
    const res = await readRoomsDay(day)
    if (dayRef.current !== day) return
    if (!res.ok) {
      flash(res.reason)
      writeDay(shownRef.current.from)
      show(shownRef.current)
      return
    }
    show(res.range)
  }, [show, writeDay])

  const reload = useCallback(() => goDay(dayRef.current), [goDay])

  const viewing: Booking | null = viewId ? range.bookings.find(b => b.id === viewId) ?? null : null

  return (
    <HvPage>
      <PageHead
        eyebrow="Admin · Meeting Rooms"
        title="Meeting rooms"
        subtitle="Every room’s bookings by day. Anyone can book; the person who booked can cancel."
      />
      {canManage ? (
        <Tabs
          label="Meeting rooms"
          size="compact"
          items={[{ key: 'schedule', label: 'Schedule' }, { key: 'rooms', label: 'Rooms' }]}
          active={shown}
          onSelect={k => setTab(k as Tab)}
          style={{ margin: '-4px 0 18px', flexWrap: 'wrap' }}
        />
      ) : null}
      {shown === 'schedule' ? (
        <RoomsSchedule
          range={range}
          day={want}
          people={people}
          canBook={canBook}
          canManage={canManage}
          busy={loadingDay}
          legend={legend}
          onDay={goDay}
          onBook={(roomId, from) => setForm(blankForm(range, people, roomId, from))}
          onOpen={id => setViewId(id)}
        />
      ) : (
        <RoomCards rooms={rooms} onRooms={setRooms} onChanged={reload} />
      )}
      <BookDrawer
        form={form}
        onForm={setForm}
        rooms={range.rooms}
        bookings={range.bookings}
        people={people}
        today={range.today}
        onClose={() => setForm(null)}
        onDone={async (done) => {
          setForm(null)
          flash(done.message)
          await goDay(done.day)
          if (done.reopen) setViewId(done.reopen)
        }}
      />
      <BookingDrawer
        booking={viewing}
        onClose={() => setViewId(null)}
        onEdit={b => {
          setViewId(null)
          setForm(formOf(b, people))
        }}
        onCancelled={async message => {
          setViewId(null)
          flash(message)
          await reload()
        }}
      />
    </HvPage>
  )
}
