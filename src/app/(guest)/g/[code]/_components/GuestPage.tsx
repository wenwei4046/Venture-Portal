'use client'

import { useCallback, useEffect, useState } from 'react'
import { Select } from '@/components/hrv/select'
import { hm } from '@/lib/rooms/model'
import { guestBook, guestCancel, guestDay } from '@/lib/guest/actions'
import {
  availabilityBars,
  bookedFacts,
  bookingPreview,
  busyAt,
  calBlocks,
  dayChip,
  freeLine,
  guestDays,
  guestSlots,
  missingLine,
  paxNote,
  pickSlot,
  selectionLine,
  shortDay,
  shortRoomName,
  takenFacts,
  type GuestBooked,
  type GuestData,
  type GuestTaken,
  type SlotPick,
} from '@/lib/guest/model'
import s from './guest.module.css'

/**
 * The guest link's public page, /g/<code> (2026-10-11, the HR revamp's second
 * package — README §16, `Guest Booking.dc.html`): no sign-in, a phone first.
 * Home (what do you need?) → Book a meeting room (who is booking, a room and
 * its half hours, the meeting) → done, with the reference and Cancel booking;
 * or the schedule — every room's meetings, HQ's in blue and the subsidiaries'
 * in orange. A meeting booked through the link may be changed or cancelled by
 * any guest, who gives their name for the trail; HQ's are never theirs (the
 * user, 2026-10-11). From 900px wide the Book step gets the Preview column.
 */

type Tab = 'home' | 'book' | 'sched'
type Done = GuestBooked & { edited?: boolean; cancelled?: boolean }

const CLOSED = 'This link is closed.'
const NO_PICK: SlotPick = { room: null, start: null, end: null }

const ICONS: Record<'book' | 'sched', string[]> = {
  book: ['M3.5 6.5h17v10h-17z', 'M8 20h8M12 16.5V20'],
  sched: ['M3.5 5h17v15h-17z', 'M8 3v4M16 3v4M3.5 10h17', 'M8 14h3M8 17h6'],
}

function Icon({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export default function GuestPage({
  code,
  initial,
  initialTaken,
  readDay = guestDay,
}: {
  code: string
  initial: GuestData
  initialTaken: GuestTaken[]
  /** Where a day's meetings are read from (the guest link's own call; a preview hands its own). */
  readDay?: typeof guestDay
}) {
  const [closedNow, setClosedNow] = useState(false)
  const open = !closedNow && initial.on ? initial : null
  const today = open?.today ?? ''

  const [tab, setTab] = useState<Tab>('home')
  const [co, setCo] = useState('')
  const [dept, setDept] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState(today)
  const [pick, setPick] = useState<SlotPick>(NO_PICK)
  const [title, setTitle] = useState('')
  const [pax, setPax] = useState(2)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const [doneErr, setDoneErr] = useState('')
  const [arm, setArm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [actor, setActor] = useState('')
  const [actorErr, setActorErr] = useState('')
  const [ask, setAsk] = useState<{ id: string; title: string } | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [taken, setTaken] = useState<Record<string, GuestTaken[]>>(() => (open?.booking ? { [today]: initialTaken } : {}))
  const [loadingDay, setLoadingDay] = useState<string | null>(null)

  // A closed answer means HR turned the link off (or made a new one) meanwhile.
  const closedBy = useCallback((reason: string) => {
    if (reason !== CLOSED) return false
    setClosedNow(true)
    return true
  }, [])

  const loadDay = useCallback(
    async (day: string) => {
      setLoadingDay(day)
      const res = await readDay(code, day)
      setLoadingDay(l => (l === day ? null : l))
      if (!res.ok) {
        if (!closedBy(res.reason)) setErr(res.reason)
        return
      }
      setTaken(m => ({ ...m, [day]: res.taken }))
    },
    [code, closedBy, readDay],
  )

  const nameModal = !!ask || (!!editId && confirmEdit)
  useEffect(() => {
    if (!viewId && !nameModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setViewId(null)
      setAsk(null)
      setConfirmEdit(false)
      setActorErr('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewId, nameModal])

  const page = open && (tab === 'home' || open.booking) ? tab : 'home'
  const dayTaken = taken[date] ?? []
  const sub = open?.subs.find(x => x.id === co) ?? null
  const room = open?.rooms.find(r => r.id === pick.room) ?? null
  const showPreview = !!open && page === 'book' && !done

  const goTab = (t: Tab) => {
    setTab(t)
    if (t !== 'home' && date) void loadDay(date)
  }
  const goDay = (day: string) => {
    setDate(day)
    setPick(p => ({ ...p, start: null, end: null }))
    setErr('')
    void loadDay(day)
  }
  const stopEdit = () => {
    setEditId(null)
    setConfirmEdit(false)
    setPick(NO_PICK)
    setTitle('')
    setPax(2)
  }
  const editTaken = (b: GuestTaken) => {
    setViewId(null)
    setTab('book')
    setDone(null)
    setEditId(b.id)
    setDate(b.day)
    setPick({ room: b.room, start: b.from, end: b.to })
    setTitle(b.title)
    setPax(b.pax || 1)
    setCo(b.subsidiary && open?.subs.some(x => x.id === b.subsidiary) ? b.subsidiary : '')
    setDept(b.department ?? '')
    setName(b.by)
    setConfirmEdit(false)
    setActor('')
    setErr('')
  }

  const submit = async () => {
    if (!open || busy) return
    const miss = missingLine({ company: co, department: dept, departmentNeeded: !sub || sub.departments.length > 0, name, slot: !!room && pick.start != null, title })
    if (miss) return setErr(miss)
    if (!room || pick.start == null || pick.end == null) return
    if (room.seats > 0 && pax > room.seats) return setErr(`${room.name} seats ${room.seats}. Pick a bigger room or fewer people.`)
    for (let x = pick.start; x < pick.end; x += 30) {
      if (busyAt(dayTaken, room.id, x, editId)) return setErr('Someone just took that slot. Pick another time.')
    }
    if (editId) {
      if (!confirmEdit) {
        setConfirmEdit(true)
        setActorErr('')
        return
      }
      if (!actor.trim()) return setActorErr('Type your name first.')
    }
    setBusy(true)
    const res = await guestBook({
      code,
      id: editId,
      room: room.id,
      day: date,
      from: pick.start,
      to: pick.end,
      title,
      subsidiary: co,
      department: dept,
      name,
      pax,
      actor: editId ? actor : null,
    })
    setBusy(false)
    if (!res.ok) {
      if (closedBy(res.reason)) return
      if (editId && /your name/i.test(res.reason)) return setActorErr(res.reason)
      setConfirmEdit(false)
      setErr(res.reason)
      return
    }
    setDone({ ...res.booked, edited: !!editId })
    setArm(false)
    setDoneErr('')
    setErr('')
    setEditId(null)
    setConfirmEdit(false)
    setActor('')
    void loadDay(res.booked.day)
  }

  const cancelDone = async () => {
    if (!done || busy) return
    if (!arm) return setArm(true)
    setBusy(true)
    const res = await guestCancel(code, done.id, done.name)
    setBusy(false)
    setArm(false)
    if (!res.ok) {
      if (!closedBy(res.reason)) setDoneErr(res.reason)
      return
    }
    setDone({ ...done, cancelled: true })
    void loadDay(done.day)
  }

  const nameGo = async () => {
    if (!ask) return void submit()
    if (busy) return
    if (!actor.trim()) return setActorErr('Type your name first.')
    setBusy(true)
    const res = await guestCancel(code, ask.id, actor.trim())
    setBusy(false)
    if (!res.ok) {
      if (!closedBy(res.reason)) setActorErr(res.reason)
      return
    }
    setAsk(null)
    setActor('')
    setActorErr('')
    void loadDay(date)
  }

  const days = open ? guestDays(today, open.days) : []
  const chipRow = (
    <div className={s.chips}>
      {days.map(x => {
        const c = dayChip(x, today)
        return (
          <button key={x} type="button" className={s.chip} aria-pressed={x === date} onClick={() => goDay(x)}>
            <span className={s.chipWd}>{c.wd}</span>
            <span className={s.chipN}>{c.n}</span>
          </button>
        )
      })}
    </div>
  )

  const viewing = viewId ? dayTaken.find(b => b.id === viewId) ?? null : null
  const preview = bookingPreview({ company: sub?.name ?? '', department: dept, name, room, day: date, pick, title, pax })
  const note = paxNote(room, pax)

  return (
    <div className={s.root}>
      <div className={s.wrap}>
        <div className={s.head}>
          <span className={s.tile}>H</span>
          <div className={s.brandBox}>
            <div className={s.brand}>HOUZS Venture</div>
            <div className={s.brandSub}>Guest services · for subsidiary staff</div>
          </div>
        </div>

        {!open ? (
          <div className={s.closed}>
            <div className={s.closedTitle}>This link is closed</div>
            <div className={s.closedText}>Ask the HOUZS admin team for a current link.</div>
          </div>
        ) : null}

        {open && page === 'home' ? (
          <>
            <div className={s.hello}>
              <div className={s.helloTitle}>What do you need?</div>
              <div className={s.helloSub}>No account needed.</div>
            </div>
            <div className={s.homeGrid}>
              {open.booking ? (
                <>
                  <button type="button" className={s.homeCard} onClick={() => goTab('book')}>
                    <span className={s.homeTile} style={{ background: 'rgb(230 237 241)', color: 'rgb(78 101 116)' }}>
                      <Icon paths={ICONS.book} />
                    </span>
                    <div className={s.homeText}>
                      <div className={s.homeTitle}>Book a meeting room</div>
                      <div className={s.homeDesc}>See which rooms are free and book a time slot.</div>
                    </div>
                    <span className={s.start}>
                      Start <span className={s.arrow}>→</span>
                    </span>
                  </button>
                  <button type="button" className={s.homeCard} onClick={() => goTab('sched')}>
                    <span className={s.homeTile} style={{ background: 'rgb(238 240 226)', color: 'rgb(88 98 68)' }}>
                      <Icon paths={ICONS.sched} />
                    </span>
                    <div className={s.homeText}>
                      <div className={s.homeTitle}>Meeting room schedule</div>
                      <div className={s.homeDesc}>See every room’s bookings by day, for HQ and the subsidiaries.</div>
                    </div>
                    <span className={s.start}>
                      Start <span className={s.arrow}>→</span>
                    </span>
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        {open && page !== 'home' && (open.booking || open.hiring) ? (
          <button type="button" className={s.back} onClick={() => setTab('home')}>
            ‹ Back
          </button>
        ) : null}

        <div className={s.cols} data-preview={showPreview ? 'true' : 'false'}>
          <div className={s.main}>
            {open && page === 'sched' ? (
              <>
                <div className={s.h1}>Meeting room schedule</div>
                <div className={s.lead}>Every room, HQ and subsidiaries. Tap a meeting to edit or cancel it.</div>
                {chipRow}
                <div className={s.cal} aria-busy={loadingDay === date}>
                  <div className={s.calHead} style={{ gridTemplateColumns: `40px repeat(${Math.max(1, open.allRooms.length)}, minmax(0,1fr))` }}>
                    <span />
                    {open.allRooms.map(r => (
                      <span key={r.id} className={s.calRoom}>
                        {shortRoomName(r.name)}
                      </span>
                    ))}
                  </div>
                  <div className={s.calBody} style={{ gridTemplateColumns: `40px repeat(${Math.max(1, open.allRooms.length)}, minmax(0,1fr))` }}>
                    <div className={s.calHours}>
                      {Array.from({ length: 12 }, (_, i) => (
                        <span key={i} className={s.calHour}>
                          {hm((8 + i) * 60)}
                        </span>
                      ))}
                    </div>
                    {open.allRooms.map(r => (
                      <div key={r.id} className={s.calCol}>
                        {calBlocks(dayTaken, r.id).map(b => (
                          <button
                            key={b.id}
                            type="button"
                            className={s.calBlock}
                            data-guest={b.guest ? 'true' : 'false'}
                            data-centred={b.centred ? 'true' : 'false'}
                            style={{ top: b.top, height: b.height }}
                            onClick={() => setViewId(b.id)}
                          >
                            <div className={s.calTitle} style={{ WebkitLineClamp: b.clamp }}>
                              {b.title}
                            </div>
                            <div className={s.calTime}>{b.time}</div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className={s.legend}>
                  <span className={s.legendItem}>
                    <span className={s.swatch} style={{ background: 'rgb(230 237 241)', borderLeftColor: 'rgb(78 101 116)' }} />
                    HQ
                  </span>
                  <span className={s.legendItem}>
                    <span className={s.swatch} style={{ background: 'rgb(255 244 231)', borderLeftColor: 'rgb(233 154 83)' }} />
                    Subsidiaries
                  </span>
                </div>
              </>
            ) : null}

            {open && page === 'book' ? (
              <>
                <div className={s.bookHead}>
                  <div className={s.bookTitle}>{editId ? 'Change a booking' : 'Book a meeting room'}</div>
                </div>
                {done ? (
                  <div className={s.done}>
                    <div className={s.doneHead}>
                      <span className={s.doneIcon} data-cancelled={done.cancelled ? 'true' : 'false'}>
                        {done.cancelled ? '×' : '✓'}
                      </span>
                      <div>
                        <div className={s.doneTitle}>{done.cancelled ? 'Booking cancelled' : done.edited ? 'Booking updated' : 'Room booked'}</div>
                        <div className={s.doneRef}>{done.ref}</div>
                      </div>
                    </div>
                    <div className={s.facts}>
                      {bookedFacts(done).map(f => (
                        <FactPair key={f.l} l={f.l} v={f.v} />
                      ))}
                    </div>
                    <div className={s.doneNote}>
                      {done.cancelled ? 'The room is free again.' : 'Keep the reference. You can cancel here any time before the meeting.'}
                    </div>
                    <div className={s.doneBtns}>
                      {!done.cancelled ? (
                        <button type="button" className={s.cancelBtn} data-armed={arm ? 'true' : 'false'} onClick={cancelDone} disabled={busy}>
                          {arm ? 'Tap again to cancel' : 'Cancel booking'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={s.darkBtn}
                        onClick={() => {
                          setDone(null)
                          setDoneErr('')
                          setPick(NO_PICK)
                          setTitle('')
                          setPax(2)
                        }}
                      >
                        Book another room
                      </button>
                    </div>
                    {doneErr ? <div className={s.err}>{doneErr}</div> : null}
                  </div>
                ) : (
                  <>
                    {editId ? (
                      <div className={s.editing}>
                        <span className={s.editingText}>
                          Editing <b>{title}</b>
                        </span>
                        <button type="button" className={s.stopEdit} onClick={stopEdit}>
                          Stop editing
                        </button>
                      </div>
                    ) : null}
                    <section className={s.section}>
                      <div className={s.secLabel}>1 · Who is booking</div>
                      <div className={s.who}>
                        <label className={s.field}>
                          <span className={s.fieldLabel}>Company</span>
                          <Select
                            bare
                            round={12}
                            className={s.select}
                            value={co}
                            onChange={e => {
                              setCo(e.target.value)
                              setDept('')
                              setErr('')
                            }}
                          >
                            <option value="">Choose your company</option>
                            {open.subs.map(x => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className={s.field}>
                          <span className={s.fieldLabel}>Department</span>
                          <Select
                            bare
                            round={12}
                            className={s.select}
                            value={dept}
                            disabled={!!sub && sub.departments.length === 0}
                            onChange={e => {
                              setDept(e.target.value)
                              setErr('')
                            }}
                          >
                            <option value="">{sub ? (sub.departments.length ? 'Choose a department' : 'No departments listed') : 'Choose a company first'}</option>
                            {(sub?.departments ?? []).map(x => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className={s.field}>
                          <span className={s.fieldLabel}>Your name</span>
                          <input
                            className={s.input}
                            value={name}
                            maxLength={80}
                            autoComplete="name"
                            onChange={e => {
                              setName(e.target.value)
                              setErr('')
                            }}
                          />
                        </label>
                      </div>
                    </section>
                    <section className={s.section}>
                      <div className={s.secLabel}>2 · Pick a room and time</div>
                      {chipRow}
                      <div className={s.rooms}>
                        {open.rooms.map(r => {
                          const isOpen = pick.room === r.id
                          const meta = `${r.seats} seats${r.location ? ` · ${r.location}` : ''}${r.facilities ? ` · ${r.facilities}` : ''}`
                          const togglePick = () => {
                            setPick(isOpen ? NO_PICK : { room: r.id, start: null, end: null })
                            setErr('')
                          }
                          return (
                            <div key={r.id} className={s.roomCard} data-open={isOpen ? 'true' : 'false'}>
                              <button type="button" className={s.roomTop} onClick={togglePick} aria-expanded={isOpen}>
                                <div className={s.roomText}>
                                  <div className={s.roomName}>{r.name}</div>
                                  <div className={s.roomMeta}>{meta}</div>
                                </div>
                                <span className={s.roomFree}>{freeLine(dayTaken, r.id, editId)}</span>
                              </button>
                              <button type="button" className={s.bar} onClick={togglePick} aria-label={`${r.name}: the day from 08:00 to 20:00`}>
                                {availabilityBars(dayTaken, r.id, isOpen ? pick : null).map((b, i) => (
                                  <span key={i} className={s.barSeg} data-picked={b.picked ? 'true' : 'false'} style={{ left: b.left, width: b.width }} />
                                ))}
                              </button>
                              <div className={s.barScale}>
                                <span>08:00</span>
                                <span>12:00</span>
                                <span>16:00</span>
                                <span>20:00</span>
                              </div>
                              {isOpen ? (
                                <>
                                  <div className={s.hint}>Tap a start time, then the last slot you need. Booked times are blocked.</div>
                                  <div className={s.slots}>
                                    {guestSlots().map(m => {
                                      const isBusy = busyAt(dayTaken, r.id, m, editId)
                                      const picked = pick.start != null && pick.end != null && m >= pick.start && m < pick.end
                                      return (
                                        <button
                                          key={m}
                                          type="button"
                                          className={s.slot}
                                          data-state={picked ? 'picked' : isBusy ? 'busy' : 'free'}
                                          aria-disabled={isBusy || loadingDay === date}
                                          onClick={() => {
                                            if (loadingDay === date) return
                                            const res = pickSlot(pick, r.id, m, dayTaken, editId)
                                            if (!res) return
                                            setPick(res.pick)
                                            setErr(res.err)
                                          }}
                                        >
                                          {hm(m)}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          )
                        })}
                        {!open.rooms.length ? <div className={s.noRooms}>No rooms are open for guest booking.</div> : null}
                      </div>
                      {selectionLine(room, date, pick) ? <div className={s.sel}>{selectionLine(room, date, pick)}</div> : null}
                    </section>
                    <section className={s.section}>
                      <div className={s.secLabel}>3 · Meeting</div>
                      <label className={s.field}>
                        <span className={s.fieldLabel}>Meeting title</span>
                        <input
                          className={s.input}
                          value={title}
                          maxLength={120}
                          placeholder="e.g. Delivery schedule review"
                          onChange={e => {
                            setTitle(e.target.value)
                            setErr('')
                          }}
                        />
                      </label>
                      <div className={s.paxRow}>
                        <span className={s.paxText}>
                          <span className={s.paxLabel}>How many people</span>
                          <span className={s.paxNote} data-over={note.over ? 'true' : 'false'}>
                            {note.line}
                          </span>
                        </span>
                        <span className={s.stepper}>
                          <button type="button" className={s.step} aria-label="One fewer" onClick={() => setPax(p => Math.max(1, p - 1))}>
                            −
                          </button>
                          <span className={s.count}>{pax}</span>
                          <button type="button" className={s.step} aria-label="One more" onClick={() => setPax(p => Math.min(99, p + 1))}>
                            +
                          </button>
                        </span>
                      </div>
                    </section>
                    {err ? (
                      <div className={s.err} role="alert">
                        {err}
                      </div>
                    ) : null}
                    <button type="button" className={s.submit} onClick={submit} disabled={busy}>
                      {editId ? 'Save changes' : 'Book room'}
                    </button>
                  </>
                )}
              </>
            ) : null}
          </div>

          {showPreview ? (
            <aside className={s.aside} aria-label="Preview">
              <div>
                <div className={s.pvKicker}>Preview</div>
                <div className={s.pvTitle}>Your booking</div>
                <div className={s.pvSub}>Updates as you fill in the form</div>
              </div>
              <div className={s.pvProg}>
                <div className={s.pvDone}>
                  <span>{preview.done}</span>
                </div>
                <span className={s.pvTrack}>
                  <span className={s.pvFill} style={{ width: preview.pct }} />
                </span>
              </div>
              {preview.groups.map(g => (
                <div key={g.title} className={s.pvGroup}>
                  <div className={s.pvGroupTitle}>{g.title}</div>
                  {g.rows.map(r => (
                    <div key={r.l} className={s.pvRow}>
                      <span className={s.pvL}>{r.l}</span>
                      <span className={s.pvV} data-filled={r.filled ? 'true' : 'false'}>
                        {r.v}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </aside>
          ) : null}
        </div>
        <div className={s.foot}>HOUZS Venture · guest link</div>
      </div>

      {open && viewing ? (
        <div className={s.scrim} onClick={() => setViewId(null)}>
          <div className={s.window} role="dialog" aria-modal="true" aria-label={viewing.title || 'Booked'} onClick={e => e.stopPropagation()}>
            <div className={s.vHead}>
              <span className={s.vBar} data-guest={viewing.guest ? 'true' : 'false'} />
              <div className={s.vText}>
                <div className={s.vTitle}>{viewing.title || 'Booked'}</div>
                <div className={s.vWhen}>
                  {shortDay(viewing.day)} · {hm(viewing.from)}–{hm(viewing.to)}
                </div>
              </div>
              <button type="button" className={s.vX} aria-label="Close" onClick={() => setViewId(null)}>
                ×
              </button>
            </div>
            <div className={s.vFacts}>
              {takenFacts(viewing, open.allRooms.find(r => r.id === viewing.room)?.name ?? 'Room').map(f => (
                <FactPair key={f.l} l={f.l} v={f.v} />
              ))}
            </div>
            {viewing.guest ? (
              <div className={s.vBtns}>
                <button
                  type="button"
                  className={s.vCancel}
                  onClick={() => {
                    setViewId(null)
                    setAsk({ id: viewing.id, title: viewing.title })
                    setActor('')
                    setActorErr('')
                  }}
                >
                  Cancel meeting
                </button>
                <button type="button" className={s.vEdit} onClick={() => editTaken(viewing)}>
                  Edit
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {open && nameModal ? (
        <div className={s.scrim}>
          <div className={s.window} role="dialog" aria-modal="true" aria-label={ask ? 'Cancel meeting' : 'Save changes'}>
            <div>
              <div className={s.nmTitle}>{ask ? `Cancel “${ask.title || 'meeting'}”?` : 'Save changes'}</div>
              <div className={s.nmSub}>
                {ask ? 'Type your name so the admin team knows who cancelled it.' : 'Type your name so the admin team knows who changed this booking.'}
              </div>
            </div>
            <input
              className={`${s.input} ${s.nmInput}`}
              value={actor}
              maxLength={80}
              placeholder="Your name"
              autoComplete="name"
              autoFocus
              onChange={e => {
                setActor(e.target.value)
                setActorErr('')
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') void nameGo()
              }}
            />
            {actorErr ? <span className={s.nmErr}>{actorErr}</span> : null}
            <div className={s.nmBtns}>
              <button
                type="button"
                className={s.nmBack}
                onClick={() => {
                  setAsk(null)
                  setConfirmEdit(false)
                  setActorErr('')
                }}
              >
                {ask ? 'Keep it' : 'Back'}
              </button>
              <button type="button" className={s.nmGo} data-danger={ask ? 'true' : 'false'} onClick={nameGo} disabled={busy}>
                {ask ? 'Cancel meeting' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FactPair({ l, v }: { l: string; v: string }) {
  return (
    <>
      <span className={s.factL}>{l}</span>
      <span className={s.factV}>{v}</span>
    </>
  )
}
