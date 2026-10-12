'use client'

import { useRef, useState, type CSSProperties } from 'react'
import {
  DAY_END, DAY_START, HOUR_PX, TONES, blockBox, blockWho, bookingBadge, dayLabel, departmentBadge, departmentRank, freeHalfHours, guestBadge, hm, hourLabels,
  meetingCount, shiftDay, slotAt, type RoomsPeople, type RoomsRange,
} from '@/lib/rooms/model'
import { DayPicker } from './DayPicker'
import s from './rooms.module.css'

/**
 * The Schedule tab (README §14, prototype lines 893–922): the day's nav, the
 * count, a legend of codes, + Book a room; then the grid — a 56px time column
 * and a column per room (170px at least), 52px an hour with half-hour lines,
 * each booking a block in its department's tone. A press on an empty column
 * books that half hour.
 *
 * 2026-10-11, the user: the day's label opens a month to pick a day from
 * (‹ › still step one day), and the free half hour under the pointer lights
 * up with its time — from today on, for whoever may book (the database
 * refuses a day already past, so such a day neither lights nor opens Book).
 */
export function RoomsSchedule({
  range,
  day: want,
  people,
  canBook,
  canManage,
  busy,
  onDay,
  onBook,
  onOpen,
  legend,
}: {
  range: RoomsRange
  /** The day asked for: the toolbar names it and steps from it at once, while the grid still shows `range`. */
  day: string
  people: RoomsPeople
  canBook: boolean
  /** Who manages the rooms has the Rooms tab, where they are added. */
  canManage: boolean
  /** A day's read is on its way: the grid says so (aria-busy); the buttons stay as they are, as the prototype's. */
  busy: boolean
  onDay: (day: string) => void
  onBook: (roomId: string | null, from: number | null) => void
  onOpen: (id: string) => void
  /** The guest link's subsidiaries that can book (code + name), shown after HQ's departments. */
  legend?: Array<{ code: string; name: string }>
}) {
  const day = range.from
  const rooms = range.rooms
  const bookings = range.bookings.filter(b => b.day === day && !b.cancelled)
  const cols = `56px repeat(${Math.max(1, rooms.length)}, minmax(170px,1fr))`
  const codes = [
    ...[...people.departments].sort((x, y) => departmentRank(x.name) - departmentRank(y.name)).map(d => {
      const badge = departmentBadge(d.name)
      return { key: d.id, label: badge.code, full: badge.label, tone: badge.tone }
    }),
    ...(legend ?? []).map(sub => {
      const badge = guestBadge(sub.name, sub.code)
      return { key: `g-${sub.code}-${sub.name}`, label: badge.code, full: sub.name, tone: badge.tone }
    }),
  ]
  const me = people.me ? `${people.me.name}${people.me.department ? ` (${departmentBadge(people.me.department).label})` : ''}` : people.account
  const hours = (DAY_END - DAY_START) / 60
  // A day already past is only read: the database refuses a booking on it ("Pick today or a day after it.").
  const bookable = canBook && day >= range.today
  const [picking, setPicking] = useState(false)
  const labelRef = useRef<HTMLButtonElement>(null)
  const closePicker = () => {
    setPicking(false)
    labelRef.current?.focus()
  }

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.dateNav}>
          <button type="button" className={s.navBtn} onClick={() => onDay(shiftDay(want, -1))} aria-label="The day before">
            ‹
          </button>
          <button
            ref={labelRef}
            type="button"
            className={s.dateLabel}
            onClick={() => setPicking(open => !open)}
            aria-haspopup="dialog"
            aria-expanded={picking}
            title="Pick a day"
          >
            <svg className={s.dateIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M3.5 10h17" />
            </svg>
            <span aria-live="polite">
              {dayLabel(want)}
              {want === range.today ? ' · today' : ''}
            </span>
          </button>
          <button type="button" className={s.navBtn} onClick={() => onDay(shiftDay(want, 1))} aria-label="The day after">
            ›
          </button>
          {picking ? (
            <DayPicker
              day={want}
              today={range.today}
              onClose={closePicker}
              onPick={picked => {
                closePicker()
                if (picked !== want) onDay(picked)
              }}
            />
          ) : null}
        </div>
        <button type="button" className={s.today} onClick={() => onDay(range.today)}>
          Today
        </button>
        <span className={s.summary}>{meetingCount(bookings.length)}</span>
        <span className={s.codes}>
          {codes.map(c => (
            <span key={c.key} className={s.legend} title={c.full}>
              <span className={s.swatch} style={{ background: TONES[c.tone].light, borderLeft: `3px solid ${TONES[c.tone].deep}` }} />
              {c.label}
            </span>
          ))}
        </span>
        {canBook ? (
          <button type="button" className={s.bookBtn} onClick={() => onBook(null, null)} disabled={rooms.length === 0}>
            + Book a room
          </button>
        ) : null}
      </div>
      <div className={s.grid} role="grid" aria-label={`Meeting rooms on ${dayLabel(day)}`} aria-busy={busy}>
        <div className={s.gridHead} style={{ gridTemplateColumns: cols }} role="row">
          <span />
          {rooms.map(r => (
            <div key={r.id} className={s.colHead} role="columnheader">
              <div className={s.colName}>{r.name}</div>
              <div className={s.colMeta}>{[`${r.seats} seats`, r.location].filter(Boolean).join(' · ')}</div>
            </div>
          ))}
        </div>
        {rooms.length === 0 ? (
          <div className={s.noRooms}>{canManage ? 'No meeting rooms yet. They are added on the Rooms tab.' : 'No meeting rooms yet. HR adds them.'}</div>
        ) : (
          <div className={s.gridBody} style={{ gridTemplateColumns: cols }} role="row">
            <div className={s.hours}>
              {hourLabels().map(h => (
                <span key={h} className={s.hour}>
                  {h}
                </span>
              ))}
            </div>
            {rooms.map(r => (
              <div
                key={r.id}
                className={s.column}
                style={{ height: hours * HOUR_PX }}
                data-readonly={bookable ? undefined : 'true'}
                title={bookable ? 'Click an empty slot to book' : undefined}
                role="gridcell"
                onClick={
                  bookable
                    ? e => {
                        const box = e.currentTarget.getBoundingClientRect()
                        onBook(r.id, slotAt(e.clientY - box.top, box.height))
                      }
                    : undefined
                }
              >
                {/* The free half hours, drawn only to light under the pointer (the press is the column's). */}
                {bookable
                  ? freeHalfHours(bookings, r.id, day).map(m => (
                      <span
                        key={m}
                        className={s.slot}
                        style={{ top: ((m - DAY_START) / 60) * HOUR_PX, height: HOUR_PX / 2 }}
                        data-time={`+ ${hm(m)}`}
                        aria-hidden="true"
                      />
                    ))
                  : null}
                {bookings
                  .filter(b => b.room === r.id)
                  .map(b => {
                    const badge = bookingBadge(b)
                    const box = blockBox(b.from, b.to)
                    const style: CSSProperties = {
                      top: box.top,
                      height: box.height,
                      background: TONES[badge.tone].light,
                      borderLeftColor: TONES[badge.tone].deep,
                    }
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={s.block}
                        style={style}
                        onClick={e => {
                          e.stopPropagation()
                          onOpen(b.id)
                        }}
                        aria-label={`${b.title}, ${hm(b.from)} to ${hm(b.to)}`}
                      >
                        <span className={s.blockTitle}>{b.title}</span>
                        <span className={s.blockTime}>
                          {hm(b.from)}–{hm(b.to)}
                        </span>
                        <span className={s.blockWho}>{blockWho(b)}</span>
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={s.note}>Viewing as {me}.</div>
    </>
  )
}
