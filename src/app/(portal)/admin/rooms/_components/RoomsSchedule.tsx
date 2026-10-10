'use client'

import type { CSSProperties } from 'react'
import {
  DAY_END, DAY_START, TONES, blockBox, blockWho, bookingBadge, dayLabel, departmentBadge, departmentRank, guestBadge, hm, hourLabels, meetingCount,
  shiftDay, slotAt, type RoomsPeople, type RoomsRange,
} from '@/lib/rooms/model'
import s from './rooms.module.css'

/**
 * The Schedule tab (README §14, prototype lines 893–922): the day's nav, the
 * count, a legend of codes, + Book a room; then the grid — a 56px time column
 * and a column per room (170px at least), 52px an hour with half-hour lines,
 * each booking a block in its department's tone. A press on an empty column
 * books that half hour.
 */
export function RoomsSchedule({
  range,
  people,
  canBook,
  busy,
  onDay,
  onBook,
  onOpen,
  legend,
}: {
  range: RoomsRange
  people: RoomsPeople
  canBook: boolean
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

  return (
    <>
      <div className={s.toolbar}>
        <span className={s.dateNav}>
          <button type="button" className={s.navBtn} onClick={() => onDay(shiftDay(day, -1))} aria-label="The day before" disabled={busy}>
            ‹
          </button>
          <span className={s.dateLabel} aria-live="polite">
            {dayLabel(day)}
            {day === range.today ? ' · today' : ''}
          </span>
          <button type="button" className={s.navBtn} onClick={() => onDay(shiftDay(day, 1))} aria-label="The day after" disabled={busy}>
            ›
          </button>
        </span>
        <button type="button" className={s.today} onClick={() => onDay(range.today)} disabled={busy}>
          Today
        </button>
        <span className={s.summary}>{meetingCount(bookings.length)}</span>
        <span className={s.spacer} />
        {codes.map(c => (
          <span key={c.key} className={s.legend} title={c.full}>
            <span className={s.swatch} style={{ background: TONES[c.tone].light, borderLeft: `3px solid ${TONES[c.tone].deep}` }} />
            {c.label}
          </span>
        ))}
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
          <div className={s.noRooms}>No meeting rooms yet. They are added on the Rooms tab.</div>
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
                style={{ height: hours * 52 }}
                data-readonly={canBook ? undefined : 'true'}
                title={canBook ? 'Click an empty slot to book' : undefined}
                role="gridcell"
                onClick={
                  canBook
                    ? e => {
                        const box = e.currentTarget.getBoundingClientRect()
                        onBook(r.id, slotAt(e.clientY - box.top, box.height))
                      }
                    : undefined
                }
              >
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
      <div className={s.note}>
        Everyone can see the schedule. Only the person who booked a meeting can cancel it. Viewing as {me}.
      </div>
    </>
  )
}
