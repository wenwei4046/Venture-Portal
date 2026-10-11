'use client'

import { useState } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { bookRoom } from '@/lib/rooms/actions'
import {
  clashLine, clashOf, departmentBadge, halfHours, namedCount, paxSummary, withFrom, type Booking, type Room, type RoomsPeople,
} from '@/lib/rooms/model'
import { formProblem, withBookedBy, type BookForm } from './book-form'
import s from './rooms.module.css'

export type { BookForm }

/**
 * Book a room / Edit booking (README §14, prototype lines 1284–1313): a 520px
 * drawer — title; Room, Date, From, To, Booked by, From department; colleagues
 * as chips with a search; outside guests as rows; Total pax (never under the
 * named, may go higher; red past the room's seats); Close · Book. A slot
 * already taken is said before asking, and the database decides a race.
 */
export function BookDrawer({
  form,
  onForm,
  rooms,
  bookings,
  people,
  today,
  onClose,
  onDone,
}: {
  form: BookForm | null
  onForm: (form: BookForm | null) => void
  rooms: Room[]
  bookings: Booking[]
  people: RoomsPeople
  today: string
  onClose: () => void
  onDone: (done: { message: string; day: string; reopen: string | null }) => void | Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const f = form
  const set = (patch: Partial<BookForm>) => f && onForm({ ...f, err: '', ...patch })
  const times = halfHours()
  const room = f ? rooms.find(r => r.id === f.room) ?? null : null
  const named = f ? namedCount(f.internal, f.guests) : 0
  const pax = paxSummary(named, f?.paxSet ?? null, room)
  const byId = new Map(people.people.map(p => [p.id, p]))
  const q = f?.q.trim().toLowerCase() ?? ''
  const suggestions = f && q ? people.people.filter(p => !f.internal.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 6) : []

  const save = async () => {
    if (!f || saving) return
    const problem = formProblem(f)
    if (problem) return set({ err: problem })
    const clash = clashOf(bookings, { id: f.id, room: f.room, day: f.day, from: f.from, to: f.to })
    if (clash) return set({ err: clashLine(room?.name ?? 'The room', clash) })
    setSaving(true)
    const res = await bookRoom({
      id: f.id,
      room: f.room,
      day: f.day,
      from: f.from,
      to: f.to,
      title: f.title,
      department: f.department || null,
      bookedBy: f.bookedBy || null,
      internal: f.internal,
      guests: f.guests,
      pax: pax.total,
    })
    setSaving(false)
    if (!res.ok) return set({ err: res.reason })
    await onDone(
      f.id
        ? { message: 'Booking updated', day: f.day, reopen: f.id }
        : { message: `${res.room} booked ${res.time} · ${res.pax} attending`, day: f.day, reopen: null },
    )
  }

  return (
    <Drawer
      open={!!f}
      onClose={onClose}
      width={520}
      eyebrow="Meeting room"
      eyebrowStyle={{ color: 'rgb(78 101 116)' }}
      title={f?.id ? 'Edit booking' : 'Book a room'}
      headStyle={{ padding: '18px 22px' }}
      bodyStyle={{ padding: '18px 22px' }}
      footer={
        <div className={s.foot}>
          <span className={s.err} role="alert">
            {f?.err}
          </span>
          <button type="button" className={s.btn} onClick={onClose}>
            Close
          </button>
          <button type="button" className={s.primary} onClick={save} disabled={saving}>
            {f?.id ? 'Save' : 'Book'}
          </button>
        </div>
      }
    >
      {f ? (
        <div className={s.form}>
          <label className={s.label}>
            <span className={s.labelText}>Meeting title</span>
            <input className={s.input} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Supplier review" maxLength={120} />
          </label>
          <div className={s.pair}>
            <label className={s.label}>
              <span className={s.labelText}>Room</span>
              <Select value={f.room} onChange={e => set({ room: e.target.value })}>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.seats} seats
                  </option>
                ))}
              </Select>
            </label>
            <label className={s.label}>
              <span className={s.labelText}>Date</span>
              <input type="date" className={`${s.input} ${s.dateInput}`} value={f.day} min={today} onChange={e => e.target.value && set({ day: e.target.value })} />
            </label>
            <label className={s.label}>
              <span className={s.labelText}>From</span>
              <Select value={String(f.from)} onChange={e => set(withFrom(Number(e.target.value), f.to))}>
                {times.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className={s.label}>
              <span className={s.labelText}>To</span>
              <Select value={String(f.to)} onChange={e => set({ to: Number(e.target.value) })}>
                {times.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
            {f.guest ? null : (
              <>
                <label className={s.label}>
                  <span className={s.labelText}>Booked by</span>
                  <Select value={f.bookedBy} onChange={e => onForm(withBookedBy(f, e.target.value, people))}>
                    {people.me ? null : <option value="">{people.account}</option>}
                    {people.people.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.department ? ` · ${departmentBadge(p.department).label}` : ''}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className={s.label}>
                  <span className={s.labelText}>From department</span>
                  <Select value={f.department} onChange={e => set({ department: e.target.value })}>
                    {f.department ? null : <option value="">Choose…</option>}
                    {people.departments.map(d => (
                      <option key={d.id} value={d.id}>
                        {departmentBadge(d.name).label}
                      </option>
                    ))}
                  </Select>
                </label>
              </>
            )}
          </div>
          {f.guest ? null : (
            <>
              <div className={s.stack}>
                <span className={s.labelText}>Attending · internal</span>
                {/* Drawn when empty too, as the prototype's: the colleague box keeps its place under the label. */}
                <div className={s.chips}>
                  {f.internal.map(id => (
                    <span key={id} className={s.person}>
                      {byId.get(id)?.name ?? 'Someone'}
                      <button type="button" className={s.personX} aria-label={`Remove ${byId.get(id)?.name ?? 'them'}`} onClick={() => set({ internal: f.internal.filter(x => x !== id) })}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input className={s.input} value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Add a colleague — type a name" />
                {q ? (
                  <div className={s.chips}>
                    {suggestions.map(p => (
                      <button key={p.id} type="button" className={s.sugg} onClick={() => set({ internal: [...f.internal, p.id], q: '' })}>
                        + {p.name}
                        <span className={s.suggDept}>{p.department ? departmentBadge(p.department).label : ''}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={s.stack}>
                <span className={s.labelText}>Attending · external guests</span>
                {f.guests.map((g, i) => (
                  <div key={i} className={s.guestRow}>
                    <input
                      className={`${s.input} ${s.guestInput}`}
                      value={g.name}
                      placeholder="Name"
                      onChange={e => set({ guests: f.guests.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    />
                    <input
                      className={`${s.input} ${s.guestInput}`}
                      value={g.company}
                      placeholder="Company / role, e.g. Client"
                      onChange={e => set({ guests: f.guests.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)) })}
                    />
                    <button type="button" className={s.guestX} aria-label="Remove this guest" onClick={() => set({ guests: f.guests.filter((_, j) => j !== i) })}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className={s.addGuest} onClick={() => set({ guests: [...f.guests, { name: '', company: '' }] })}>
                  + Add an external guest
                </button>
              </div>
            </>
          )}
          <div className={s.pax} data-over={pax.over ? 'true' : undefined}>
            <div className={s.paxText}>
              <div className={s.paxTitle}>Total pax</div>
              <div className={s.paxLine}>{f.guest ? `${room ? `${room.name} seats ${room.seats}` : ''}${pax.over ? ' · too many' : ''}` : pax.line}</div>
            </div>
            <span className={s.stepper}>
              <button
                type="button"
                className={`${s.step} ${s.stepDown}`}
                aria-label="One fewer"
                disabled={pax.total <= Math.max(named, 1)}
                onClick={() => set({ paxSet: pax.total - 1 })}
              >
                −
              </button>
              <span className={s.count} aria-live="polite">
                {Math.max(pax.total, f.guest ? 1 : 0)}
              </span>
              <button type="button" className={s.step} aria-label="One more" onClick={() => set({ paxSet: pax.total + 1 })}>
                +
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </Drawer>
  )
}
