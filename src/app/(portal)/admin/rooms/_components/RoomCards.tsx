'use client'

import { useEffect, useRef, useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { deleteRoom, saveRoom } from '@/lib/rooms/actions'
import { upcomingLine, type Room } from '@/lib/rooms/model'
import s from './rooms.module.css'

/**
 * The Rooms tab (README §14, prototype lines 924–937): a card per room — its
 * name edited where it stands, seats, location, facilities, how many bookings
 * lie ahead and the Bookable switch — and "+ Add meeting room". A field saves
 * when it is left; × removes a room with nothing booked ahead (else the toast
 * says to turn Bookable off instead).
 */
export function RoomCards({ rooms, onRooms, onChanged }: { rooms: Room[]; onRooms: (rooms: Room[]) => void; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (adding) return
    const name = `Meeting Room ${rooms.length + 1}`
    setAdding(true)
    const res = await saveRoom({ name, seats: 6, location: '', facilities: '', bookable: true })
    setAdding(false)
    if (!res.ok) return flash(res.reason)
    onRooms([...rooms, { ...res.room, upcoming: 0 }])
    onChanged()
    flash(`${res.room.name} added`)
  }

  return (
    <div className={s.cards}>
      {rooms.map(r => (
        <RoomCard
          key={r.id}
          room={r}
          onSaved={next => {
            onRooms(rooms.map(x => (x.id === next.id ? { ...next, upcoming: x.upcoming } : x)))
            onChanged()
          }}
          onRemoved={() => {
            onRooms(rooms.filter(x => x.id !== r.id))
            onChanged()
          }}
        />
      ))}
      <button type="button" className={s.addCard} onClick={add} disabled={adding}>
        + Add meeting room
      </button>
    </div>
  )
}

function RoomCard({ room, onSaved, onRemoved }: { room: Room; onSaved: (room: Room) => void; onRemoved: () => void }) {
  const [draft, setDraft] = useState({ name: room.name, seats: String(room.seats), location: room.location, facilities: room.facilities })
  // The switch moves at once; a refusal puts it back.
  const [bookable, setBookable] = useState(room.bookable)
  const saved = useRef(room)
  // A fresh room from the server (another tab saved it) replaces the draft unless it is being typed in.
  const typing = useRef(false)
  useEffect(() => {
    saved.current = room
    setBookable(room.bookable)
    if (!typing.current) setDraft({ name: room.name, seats: String(room.seats), location: room.location, facilities: room.facilities })
  }, [room])

  const save = async (patch: Partial<Room>) => {
    const next = { ...saved.current, ...patch }
    const same =
      next.name === saved.current.name && next.seats === saved.current.seats && next.location === saved.current.location &&
      next.facilities === saved.current.facilities && next.bookable === saved.current.bookable
    if (same) return
    const res = await saveRoom({ id: room.id, name: next.name, seats: next.seats, location: next.location, facilities: next.facilities, bookable: next.bookable })
    if (!res.ok) {
      flash(res.reason)
      setBookable(saved.current.bookable)
      setDraft({ name: saved.current.name, seats: String(saved.current.seats), location: saved.current.location, facilities: saved.current.facilities })
      return
    }
    saved.current = res.room
    onSaved(res.room)
  }

  const leave = () => {
    typing.current = false
    void save({
      name: draft.name.trim() || saved.current.name,
      seats: Math.min(999, Math.max(0, Number(draft.seats) || 0)),
      location: draft.location.trim(),
      facilities: draft.facilities.trim(),
    })
  }
  const field = (key: keyof typeof draft) => ({
    value: draft[key],
    onFocus: () => {
      typing.current = true
    },
    onBlur: leave,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
    },
  })

  const remove = async () => {
    if ((room.upcoming ?? 0) > 0) {
      flash(`${room.name} has upcoming bookings. Turn off Bookable instead, or cancel them first`)
      return
    }
    const res = await deleteRoom(room.id)
    if (!res.ok) return flash(res.reason)
    onRemoved()
    flash(`${room.name} deleted`)
  }

  return (
    <section className={s.card} style={{ opacity: bookable ? 1 : 0.6 }} aria-label={room.name}>
      <div className={s.cardTop}>
        <input className={s.nameInput} aria-label="Room name" maxLength={80} {...field('name')} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <button type="button" className={s.remove} title="Delete room" aria-label={`Delete ${room.name}`} onClick={remove}>
          ×
        </button>
      </div>
      <label className={s.field}>
        <span className={s.fieldLabel}>Seats</span>
        <input
          className={`${s.fieldInput} ${s.seats}`}
          inputMode="numeric"
          {...field('seats')}
          onChange={e => setDraft({ ...draft, seats: e.target.value.replace(/\D/g, '').slice(0, 3) })}
        />
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>Location</span>
        <input className={s.fieldInput} maxLength={80} {...field('location')} onChange={e => setDraft({ ...draft, location: e.target.value })} />
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>Facilities</span>
        <input className={s.fieldInput} maxLength={120} {...field('facilities')} onChange={e => setDraft({ ...draft, facilities: e.target.value })} />
      </label>
      <div className={s.cardFoot}>
        <span className={s.usage}>{upcomingLine(room.upcoming ?? 0)}</span>
        <button
          type="button"
          className={s.bookable}
          role="switch"
          aria-checked={bookable}
          onClick={() => {
            setBookable(!bookable)
            void save({ bookable: !bookable })
          }}
        >
          Bookable
          <span className={s.switch} data-on={bookable ? 'true' : 'false'} aria-hidden="true">
            <span className={s.knob} />
          </span>
        </button>
      </div>
    </section>
  )
}
