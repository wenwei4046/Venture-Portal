'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { cancelBooking } from '@/lib/rooms/actions'
import { bookerName, bookingBadge, dayLabel, departmentBadge, eventDate, hm, whoMayCancel, type Booking } from '@/lib/rooms/model'
import s from './rooms.module.css'

/**
 * A booking (README §14, prototype lines 1315–1332): a 440px drawer — where
 * and when, the facts, who is attending, its audit trail; Cancel meeting (it
 * asks once more) and Edit for whoever may change it, else "Only X can cancel
 * this meeting." Also opened from Admin › Guest Link's list.
 */
export function BookingDrawer({
  booking,
  onClose,
  onEdit,
  onCancelled,
}: {
  booking: Booking | null
  onClose: () => void
  onEdit: (b: Booking) => void
  onCancelled: (message: string) => void | Promise<void>
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const b = booking

  useEffect(() => {
    setArmed(false)
    setErr('')
  }, [b?.id])

  const guest = b?.source === 'guest'
  const from = b ? (guest ? `Guest · ${b.guestCompany ?? ''}` : bookingBadge(b).label) : ''
  const kicker = b ? (from === '—' ? b.roomName : `${b.roomName} · ${from}`) : ''
  const facts: Array<{ l: string; v: string }> = !b
    ? []
    : guest
      ? [
          { l: 'Booked by', v: b.bookedBy },
          { l: 'Company', v: b.guestCompany ?? '—' },
          { l: 'Department', v: b.guestDepartment ?? '—' },
          { l: 'Room', v: b.roomName },
          { l: 'Reference', v: `${b.ref} · guest link` },
        ]
      : [
          { l: 'Booked by', v: bookerName(b) },
          { l: 'From department', v: b.subDepartment ? `${departmentBadge(b.department).label} · ${b.subDepartment}` : departmentBadge(b.department).label },
          { l: 'Room', v: b.roomName },
          { l: 'Reference', v: b.ref },
        ]
  const people: Array<{ name: string; meta: string; external: boolean }> = !b
    ? []
    : guest
      ? [{ name: `${b.pax} attending`, meta: 'Headcount from the guest link', external: false }]
      : [
          ...b.internal.map(a => ({
            name: `${a.name}${b.bookedByStaff && a.id === b.bookedByStaff ? ' · booker' : ''}`,
            meta: a.department ? departmentBadge(a.department).label : '',
            external: false,
          })),
          ...b.guests.map(g => ({ name: g.name, meta: `External · ${g.company || 'Guest'}`, external: true })),
        ]

  const cancel = async () => {
    if (!b || busy) return
    if (!armed) {
      setArmed(true)
      return
    }
    setBusy(true)
    const res = await cancelBooking(b.id)
    setBusy(false)
    if (!res.ok) {
      setErr(res.reason)
      setArmed(false)
      return
    }
    await onCancelled(`“${b.title}” cancelled · ${b.roomName} is free again`)
  }

  return (
    <Drawer
      open={!!b}
      onClose={onClose}
      width={440}
      headStyle={{ padding: '18px 22px' }}
      bodyStyle={{ padding: '18px 22px' }}
      head={
        b ? (
          <div>
            <div className={s.kicker}>{kicker}</div>
            <div className={s.title}>{b.title}</div>
            <div className={s.when}>
              {dayLabel(b.day)} · {hm(b.from)}–{hm(b.to)}
            </div>
          </div>
        ) : null
      }
      footer={
        b ? (
          <div className={s.foot}>
            {b.canChange ? (
              <>
                <button type="button" className={s.cancel} data-armed={armed ? 'true' : undefined} onClick={cancel} disabled={busy}>
                  {armed ? 'Confirm cancel' : 'Cancel meeting'}
                </button>
                <span className={s.err} role="alert">
                  {err}
                </span>
                <button type="button" className={s.btn} onClick={() => onEdit(b)}>
                  Edit
                </button>
              </>
            ) : (
              <span className={s.only}>Only {whoMayCancel(b)} can cancel this meeting.</span>
            )}
            <button type="button" className={s.btn} onClick={onClose}>
              Close
            </button>
          </div>
        ) : null
      }
    >
      {b ? (
        <>
          <div className={s.facts}>
            {facts.map(f => (
              <span key={f.l} style={{ display: 'contents' }}>
                <span className={s.factLabel}>{f.l}</span>
                <span>{f.v}</span>
              </span>
            ))}
          </div>
          <div className={s.sec} style={{ margin: '20px 0 8px' }}>
            Attending · {b.pax}
          </div>
          <div>
            {people.map((p, i) => (
              <div key={i} className={s.attending}>
                <span>{p.name}</span>
                <span className={s.attendingMeta} style={{ color: p.external ? 'rgb(160 90 30)' : 'rgb(117 100 86)' }}>
                  {p.meta}
                </span>
              </div>
            ))}
          </div>
          <div className={s.sec} style={{ margin: '20px 0 10px' }}>
            Audit trail
          </div>
          {b.events.map((e, i) => (
            <div key={i} className={s.event}>
              <div className={s.rail} aria-hidden="true">
                <span className={s.dot} />
                <span className={s.line} />
              </div>
              <div className={s.eventBody}>
                <div className={s.eventTop}>
                  <span className={s.eventWhat}>{e.what}</span>
                  <span className={s.eventWhen}>{eventDate(e.at)}</span>
                </div>
                <div className={s.eventWho}>{e.who}</div>
                {e.note ? <div className={s.eventNote}>{e.note}</div> : null}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </Drawer>
  )
}
