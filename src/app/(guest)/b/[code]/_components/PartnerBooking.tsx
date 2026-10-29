'use client'

/**
 * /b/<code> — a partner's showroom booking (2026-10-29; the owner: The Conts' own salespeople book a slot without signing
 * in to the CRM; it lands on the CRM's calendar and takes the showroom's per-slot place, so a full slot is full on both
 * sides). A desktop page: the showroom, a day of the next three weeks and a time on the left; the booker, the customer and
 * the remarks on the right. Booked, it shows its reference — typed under *Change or cancel*, it opens the booking again.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { partnerBook, partnerCancel, partnerDay, partnerGet } from '@/lib/crm-partner/actions'
import {
  addDays, bookingProblem, dowOf, INFO_LABELS, slotsOf, t12,
  type PartnerBooked, type PartnerInfo, type PartnerPage, type PartnerTaken,
} from '@/lib/crm-partner/model'
import s from './partner.module.css'

const DAYS = 21
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (ymd: string) => { const [, m, d] = ymd.split('-').map(Number); return `${DOW[dowOf(ymd)]}, ${d} ${MON[m - 1]}` }
const officeDay = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const officeTime = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(11, 16)
const whenOf = (iso: string) => `${dayLabel(officeDay(iso))} · ${t12(officeTime(iso))}`

interface Form { booker: string; bookerPhone: string; customer: string; customerPhone: string; info: PartnerInfo; remarks: string; note: string }
const EMPTY: Form = { booker: '', bookerPhone: '', customer: '', customerPhone: '', info: {}, remarks: '', note: '' }
const ME_KEY = 'partner-booker'

export default function PartnerBooking({ code, initial }: { code: string; initial: PartnerPage }) {
  if (!initial.on) {
    return (
      <div className={s.root}><div className={s.closed}>
        <h1>This link is closed</h1>
        <p>Ask the HOUZS team for the current booking link.</p>
      </div></div>
    )
  }
  return <Open code={code} page={initial} />
}

function Open({ code, page }: { code: string; page: Extract<PartnerPage, { on: true }> }) {
  const [room, setRoom] = useState(page.rooms[0]?.id ?? '')
  const [day, setDay] = useState(page.today)
  const [start, setStart] = useState('')
  const [taken, setTaken] = useState<PartnerTaken>({})
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<PartnerBooked | null>(null)
  const [done, setDone] = useState<PartnerBooked | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refText, setRefText] = useState('')
  const [refError, setRefError] = useState('')
  const [now, setNow] = useState(() => new Date())

  // The booker's own name and phone stay on this computer for the next booking (never the customer's).
  useEffect(() => {
    try { const me = JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as { booker?: string; bookerPhone?: string } | null; if (me) setForm(f => ({ ...f, booker: me.booker ?? '', bookerPhone: me.bookerPhone ?? '' })) } catch { /* private window */ }
  }, [])

  const r = page.rooms.find(x => x.id === room)
  const load = useCallback(async () => {
    if (!room) return
    const a = await partnerDay(code, room, page.today, DAYS + 1)
    setNow(new Date())
    if (a.ok) setTaken(a.taken); else setError(a.reason)
  }, [code, room, page.today])
  useEffect(() => { void load() }, [load])

  const days = useMemo(() => Array.from({ length: DAYS }, (_, k) => addDays(page.today, k)), [page.today])
  const except = editing ? { showroom: editing.showroom, start: editing.start } : null
  const slots = r ? slotsOf(r, day, taken, now, except) : []
  const openDay = (ymd: string) => !!r && slotsOf(r, ymd, taken, now, except).some(x => !x.full && !x.past)

  const set = (p: Partial<Form>) => setForm(f => ({ ...f, ...p }))
  const setInfo = (k: keyof PartnerInfo, v: string) => setForm(f => ({ ...f, info: { ...f.info, [k]: v } }))

  const problem = bookingProblem({ room, start, booker: form.booker, customer: form.customer, customerPhone: form.customerPhone })
  const submit = async () => {
    if (problem || busy) { setError(problem ?? ''); return }
    setBusy(true); setError('')
    const a = await partnerBook({ code, ref: editing?.ref ?? null, room, start, ...form })
    setBusy(false)
    if (!a.ok) { setError(a.reason); void load(); return }
    try { localStorage.setItem(ME_KEY, JSON.stringify({ booker: form.booker, bookerPhone: form.bookerPhone })) } catch { /* private window */ }
    setDone(a.booked); setEditing(null)
  }
  const again = () => { setDone(null); setStart(''); setForm(f => ({ ...EMPTY, booker: f.booker, bookerPhone: f.bookerPhone })); void load() }
  const findRef = async () => {
    setRefError('')
    const a = await partnerGet(code, refText)
    if (!a.ok) { setRefError(a.reason); return }
    const b = a.booked
    if (b.state === 'cancelled') { setRefError(`${b.ref} was cancelled.`); return }
    setDone(null); setEditing(b); setRoom(b.showroom); setDay(officeDay(b.start)); setStart(new Date(b.start).toISOString())
    setForm({ booker: b.booker, bookerPhone: b.bookerPhone, customer: b.customer, customerPhone: b.customerPhone, info: b.info, remarks: b.remarks, note: b.note })
  }
  const cancel = async () => {
    if (!editing || busy) return
    if (!window.confirm(`Cancel ${editing.ref} — ${editing.customer}, ${whenOf(editing.start)}?`)) return
    setBusy(true)
    const a = await partnerCancel(code, editing.ref)
    setBusy(false)
    if (!a.ok) { setError(a.reason); return }
    setDone(a.booked); setEditing(null)
  }
  const stopEditing = () => { setEditing(null); setStart(''); setForm(f => ({ ...EMPTY, booker: f.booker, bookerPhone: f.bookerPhone })) }

  return (
    <div className={s.root}>
      <div className={s.wrap}>
        <header className={s.head}>
          <div>
            <div className={s.kicker}>HOUZS showrooms · for {page.name}</div>
            <h1 className={s.title}>Book a showroom visit</h1>
          </div>
          <div className={s.lookup}>
            <label className={s.lookupLabel} htmlFor="ref">Change or cancel a booking</label>
            <div className={s.lookupRow}>
              <input id="ref" className={s.input} value={refText} onChange={e => setRefText(e.target.value.toUpperCase())} placeholder="TC-7KQ3X9" onKeyDown={e => { if (e.key === 'Enter') void findRef() }} />
              <button type="button" className={s.ghost} onClick={() => void findRef()}>Open</button>
            </div>
            {refError && <span className={s.err}>{refError}</span>}
          </div>
        </header>

        {done ? (
          <section className={s.done}>
            <div className={s.doneBadge}>{done.state === 'cancelled' ? 'Cancelled' : editing === null ? 'Booked' : 'Saved'}</div>
            <h2>{done.state === 'cancelled' ? 'The booking is cancelled' : 'The slot is yours'}</h2>
            <div className={s.ref}>{done.ref}</div>
            <p className={s.muted}>{done.state === 'cancelled' ? 'Its slot is free again.' : 'Keep this reference — type it under “Change or cancel a booking” to change or cancel.'}</p>
            <dl className={s.facts}>
              <dt>When</dt><dd>{whenOf(done.start)}</dd>
              <dt>Showroom</dt><dd>{done.showroomName}</dd>
              <dt>Customer</dt><dd>{done.customer} · {done.customerPhone}</dd>
              <dt>Booked by</dt><dd>{done.booker}{done.bookerPhone ? ` · ${done.bookerPhone}` : ''}</dd>
              {done.remarks && <><dt>Remarks</dt><dd>{done.remarks}</dd></>}
              {done.note && <><dt>Your note</dt><dd>{done.note}</dd></>}
            </dl>
            <button type="button" className={s.primary} onClick={again}>Book another</button>
          </section>
        ) : (
          <div className={s.grid}>
            <section className={s.card}>
              {editing && (
                <div className={s.editing}>
                  Changing <b>{editing.ref}</b> · {editing.customer}, {whenOf(editing.start)}
                  <button type="button" className={s.link} onClick={stopEditing}>New booking instead</button>
                </div>
              )}
              <h2 className={s.h2}>1 · Showroom</h2>
              <div className={s.rooms}>
                {page.rooms.map(x => (
                  <button key={x.id} type="button" className={x.id === room ? `${s.room} ${s.on}` : s.room} onClick={() => { setRoom(x.id); setStart('') }}>
                    <b>{x.name}</b>{x.address && <span>{x.address}</span>}
                  </button>
                ))}
                {!page.rooms.length && <p className={s.muted}>No showroom is open for booking.</p>}
              </div>

              <h2 className={s.h2}>2 · Date</h2>
              <div className={s.days}>
                {days.map(d => {
                  const open = openDay(d)
                  return (
                    <button key={d} type="button" disabled={!open} className={d === day ? `${s.day} ${s.on}` : s.day} onClick={() => { setDay(d); setStart('') }}>
                      <span>{DOW[dowOf(d)]}</span><b>{Number(d.slice(8))}</b><span>{MON[Number(d.slice(5, 7)) - 1]}</span>
                    </button>
                  )
                })}
              </div>

              <h2 className={s.h2}>3 · Time · {dayLabel(day)}</h2>
              <div className={s.slots}>
                {slots.map(x => {
                  const off = x.full || x.past, on = start === x.start
                  return (
                    <button key={x.time} type="button" disabled={off} className={on ? `${s.slot} ${s.on}` : s.slot} onClick={() => setStart(x.start)}>
                      <b>{x.label}</b><span>{x.past ? 'Passed' : x.full ? 'Full' : `${x.left} of ${r?.cap ?? 0} left`}</span>
                    </button>
                  )
                })}
                {!slots.length && <p className={s.muted}>{r ? 'The showroom is closed that day.' : 'Pick a showroom.'}</p>}
              </div>
            </section>

            <section className={s.card}>
              <h2 className={s.h2}>You</h2>
              <div className={s.two}>
                <Field label="Your name *"><input className={s.input} value={form.booker} maxLength={80} onChange={e => set({ booker: e.target.value })} /></Field>
                <Field label="Your phone"><input className={s.input} value={form.bookerPhone} maxLength={30} onChange={e => set({ bookerPhone: e.target.value })} /></Field>
              </div>
              <h2 className={s.h2}>Customer</h2>
              <div className={s.two}>
                <Field label="Customer name *"><input className={s.input} value={form.customer} maxLength={80} onChange={e => set({ customer: e.target.value })} /></Field>
                <Field label="Customer phone *"><input className={s.input} value={form.customerPhone} maxLength={30} inputMode="tel" onChange={e => set({ customerPhone: e.target.value })} /></Field>
                {(Object.keys(INFO_LABELS) as (keyof PartnerInfo)[]).map(k => (
                  <Field key={k} label={INFO_LABELS[k]}><input className={s.input} value={form.info[k] ?? ''} maxLength={120} onChange={e => setInfo(k, e.target.value)} /></Field>
                ))}
              </div>
              <Field label="Remarks for the showroom"><textarea className={s.input} rows={3} maxLength={1000} value={form.remarks} onChange={e => set({ remarks: e.target.value })} placeholder="What the customer wants to see, keys, parking…" /></Field>
              <Field label="Your own note"><textarea className={s.input} rows={3} maxLength={1000} value={form.note} onChange={e => set({ note: e.target.value })} placeholder="Anything about this lead for yourself" /></Field>

              <div className={s.summary}>
                {start && r ? <span><b>{r.name}</b> · {whenOf(start)}</span> : <span className={s.muted}>Pick a showroom, a date and a time.</span>}
              </div>
              {error && <div className={s.err}>{error}</div>}
              <div className={s.actions}>
                {editing && <button type="button" className={s.danger} disabled={busy} onClick={() => void cancel()}>Cancel booking</button>}
                <button type="button" className={s.primary} disabled={busy || !!problem} title={problem ?? undefined} onClick={() => void submit()}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Book this slot'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={s.field}><span>{label}</span>{children}</label>
}
