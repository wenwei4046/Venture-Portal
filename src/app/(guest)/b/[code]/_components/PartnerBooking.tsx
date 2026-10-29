'use client'

/**
 * /b/<code> — a partner's showroom booking (2026-10-29; the owner: The Conts' own salespeople book a slot without signing
 * in to the CRM; it lands on the CRM's calendar and takes the showroom's per-slot place, so a full slot is full on both
 * sides). In pages, for a phone: Home (this booker's bookings, or Book appointment now), then the showroom, the date and
 * time, and the details. Booked, it shows its reference; a booking opens again from Home to change or cancel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { partnerBook, partnerCancel, partnerDay, partnerGet, partnerList } from '@/lib/crm-partner/actions'
import {
  addDays, bookingProblem, dowOf, INFO_LABELS, slotsOf, t12,
  type PartnerBooked, type PartnerInfo, type PartnerPage, type PartnerTaken,
} from '@/lib/crm-partner/model'
import s from './partner.module.css'

// How far ahead a visit may be booked (the database allows 120 days).
const AHEAD = 119
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthFirst = (ymd: string) => `${ymd.slice(0, 8)}01`
const addMonths = (first: string, n: number) => { const y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7)) - 1 + n; return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, '0')}-01` }
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (ymd: string) => { const [, m, d] = ymd.split('-').map(Number); return `${DOW[dowOf(ymd)]}, ${d} ${MON[m - 1]}` }
const officeDay = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const officeTime = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(11, 16)
const whenOf = (iso: string) => `${dayLabel(officeDay(iso))} · ${t12(officeTime(iso))}`

interface Form { booker: string; bookerPhone: string; customer: string; customerPhone: string; info: PartnerInfo; remarks: string; note: string }
const EMPTY: Form = { booker: '', bookerPhone: '', customer: '', customerPhone: '', info: {}, remarks: '', note: '' }
const ME_KEY = 'partner-booker'
type Step = 'home' | 'room' | 'time' | 'details'

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
  const [step, setStep] = useState<Step>('home')
  const [meName, setMeName] = useState('')
  const [allOpen, setAllOpen] = useState(false)
  // Pages on a phone only; a computer keeps the page as it was (the owner, 2026-10-29: "desktop 用回上一次的版本，分页式只在手机").
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 760px)'), on = () => setPhone(m.matches)
    on(); m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  // Find by name (the owner, 2026-10-29: "搜寻那边是否可以搜寻自己的名字，看得到自己的预约"): a reference opens its booking;
  // anything else lists the bookings whose booker, customer or phone has it — and a booker's own name becomes this phone's,
  // so Your appointments shows theirs from then on.
  const [findQ, setFindQ] = useState('')
  const [found, setFound] = useState<PartnerBooked[] | null>(null)

  // The booker's own name and phone stay on this computer for the next booking (never the customer's).
  useEffect(() => {
    try { const me = JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as { booker?: string; bookerPhone?: string } | null; if (me) { setForm(f => ({ ...f, booker: me.booker ?? '', bookerPhone: me.bookerPhone ?? '' })); setMeName(me.booker ?? '') } } catch { /* private window */ }
  }, [])

  const r = page.rooms.find(x => x.id === room)
  // Every booking made through this link still to come, whoever made it (the owner, 2026-10-29: "这个表单能不能看到也是用这个
  // 表单的人的预约" — with the customer's phone and the reference, "不然预约的人忘记了就改不了了"), read with the places.
  const [list, setList] = useState<PartnerBooked[]>([])
  // The day picker as the CRM's (the owner, 2026-10-29: "时间表做成跟 crm 一样，week & month 可切换"): Week — seven days from
  // today, ‹ › a week at a time — or Month, the month's calendar; days gone by or past the limit cannot be picked.
  const [view, setView] = useState<'week' | 'month'>('week')
  const [wk, setWk] = useState(0)
  const [ym, setYm] = useState(() => monthFirst(page.today))
  const last = addDays(page.today, AHEAD)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, k) => addDays(page.today, wk * 7 + k)), [page.today, wk])
  const monthCells = useMemo(() => {
    const lead = (dowOf(ym) + 6) % 7, start = addDays(ym, -lead)
    const n = Math.ceil((lead + daysBetween(ym, addMonths(ym, 1))) / 7) * 7
    return Array.from({ length: n }, (_, k) => addDays(start, k))
  }, [ym])
  // The places are read for what is on screen (from today, 42 days at most).
  const rangeA = view === 'week' ? weekDays[0] : monthCells[0] < page.today ? page.today : monthCells[0]
  const rangeB = view === 'week' ? weekDays[6] : monthCells[monthCells.length - 1]
  const rangeDays = Math.max(1, Math.min(42, daysBetween(rangeA, rangeB) + 1))
  const showDay = (ymd: string) => { setWk(Math.max(0, Math.floor(daysBetween(page.today, ymd) / 7))); setYm(monthFirst(ymd)) }
  const [listQ, setListQ] = useState('')
  const load = useCallback(async () => {
    if (!room) return
    const [a, l] = await Promise.all([partnerDay(code, room, rangeA, rangeDays), partnerList(code)])
    setNow(new Date())
    if (a.ok) setTaken(a.taken); else setError(a.reason)
    if (l.ok) setList(l.list)
  }, [code, room, rangeA, rangeDays])
  useEffect(() => { void load() }, [load])
  // Every booking takes a place and a change or cancel gives one back, whoever made it (the owner, 2026-10-29: "只要有人预约成功，
  // showroom available 都要 -1"): the places are read again every 30 s while the page is open and when it comes back to the front.
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") void load() }
    const t = window.setInterval(again, 30_000)
    document.addEventListener("visibilitychange", again); window.addEventListener("focus", again)
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", again); window.removeEventListener("focus", again) }
  }, [load])

  const except = editing ? { showroom: editing.showroom, start: editing.start } : null
  const slots = r ? slotsOf(r, day, taken, now, except) : []
  const openDay = (ymd: string) => !!r && slotsOf(r, ymd, taken, now, except).some(x => !x.full && !x.past)
  // A new booking's date step opens on the first day with a place (today's times may all be gone).
  const firstOpen = !editing && step === 'time' && !start && !openDay(day) ? Array.from({ length: AHEAD + 1 }, (_, k) => addDays(page.today, k)).slice(0, 42).find(openDay) : undefined
  useEffect(() => { if (firstOpen && firstOpen !== day) { setDay(firstOpen); showDay(firstOpen) } }, [firstOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setMeName(form.booker)
    setDone(a.booked); setEditing(null); void load()
  }
  const again = () => { setDone(null); setStart(''); setForm(f => ({ ...EMPTY, booker: f.booker, bookerPhone: f.bookerPhone })); void load() }
  const findRef = async (ref: string = refText) => {
    setRefError('')
    const a = await partnerGet(code, ref)
    if (!a.ok) { setRefError(a.reason); return }
    const b = a.booked
    if (b.state === 'cancelled') { setRefError(`${b.ref} was cancelled.`); return }
    // Read the places again: the booking may have been made after this page last read them.
    if (b.showroom === room) void load();
    setDone(null); setEditing(b); setRoom(b.showroom); setDay(officeDay(b.start)); showDay(officeDay(b.start)); setStart(new Date(b.start).toISOString())
    setForm({ booker: b.booker, bookerPhone: b.bookerPhone, customer: b.customer, customerPhone: b.customerPhone, info: b.info, remarks: b.remarks, note: b.note })
    setStep('details'); window.scrollTo({ top: 0 })
  }
  const cancel = async () => {
    if (!editing || busy) return
    if (!window.confirm(`Cancel ${editing.ref} — ${editing.customer}, ${whenOf(editing.start)}?`)) return
    setBusy(true)
    const a = await partnerCancel(code, editing.ref)
    setBusy(false)
    if (!a.ok) { setError(a.reason); return }
    setDone(a.booked); setEditing(null); void load()
  }
  const stopEditing = () => { setEditing(null); setStart(''); setForm(f => ({ ...EMPTY, booker: f.booker, bookerPhone: f.bookerPhone })) }

  const find = () => {
    const q = findQ.trim()
    setRefError(''); setFound(null)
    if (!q) return
    if (/^TC-?[A-Z0-9]{6}$/i.test(q)) { const ref = q.toUpperCase().replace(/^TC-?/, 'TC-'); setRefText(ref); void findRef(ref); return }
    const ql = q.toLowerCase(), digits = q.replace(/\D/g, '')
    const hits = list.filter(b => b.booker.toLowerCase().includes(ql) || b.customer.toLowerCase().includes(ql) || (digits.length >= 4 && b.customerPhone.replace(/\D/g, '').includes(digits)))
    // A computer filters the list under the form, as its own search (the owner, 2026-10-29: "跟下面的 search 一样").
    if (phone) setFound(hits)
    else { setListQ(q); document.getElementById('partner-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    const exact = list.find(b => b.booker.trim().toLowerCase() === ql)
    if (exact) {
      setMeName(exact.booker); setForm(f => ({ ...f, booker: f.booker || exact.booker }))
      try { localStorage.setItem(ME_KEY, JSON.stringify({ booker: exact.booker, bookerPhone: form.bookerPhone })) } catch { /* private window */ }
    }
  }

  if (!phone) return (
    <div className={s.root}>
      <div className={s.wrap}>
        <header className={s.head}>
          <div>
            <div className={s.kicker}>HOUZS showrooms · for {page.name}</div>
            <h1 className={s.title}>Book a showroom visit</h1>
          </div>
          <div className={s.lookup}>
            <label className={s.lookupLabel} htmlFor="ref">Find a booking</label>
            <div className={s.lookupRow}>
              <input id="ref" className={s.input} value={findQ} onChange={e => setFindQ(e.target.value)} placeholder="Name, customer, phone or reference" onKeyDown={e => { if (e.key === 'Enter') find() }} />
              <button type="button" className={s.ghost} onClick={find}>Search</button>
            </div>
            {refError && <span className={s.err}>{refError}</span>}
          </div>
        </header>

        {done ? (
          <section className={s.done}>
            <div className={s.doneBadge}>{done.state === 'cancelled' ? 'Cancelled' : editing === null ? 'Booked' : 'Saved'}</div>
            <h2>{done.state === 'cancelled' ? 'The booking is cancelled' : 'The slot is yours'}</h2>
            <div className={s.ref}>{done.ref}</div>
            <p className={s.muted}>{done.state === 'cancelled' ? 'Its slot is free again.' : 'Keep this reference — search it under “Find a booking” to change or cancel.'}</p>
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

              <div className={s.pickHead}>
                <h2 className={s.h2}>2 · Date</h2>
                <span className={s.monthLabel}>{view === 'week' ? `${MON[Number(weekDays[0].slice(5, 7)) - 1]} ${weekDays[0].slice(0, 4)}` : `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`}</span>
                <div className={s.seg}>
                  {(['week', 'month'] as const).map(k => <button key={k} type="button" aria-pressed={view === k} className={view === k ? `${s.segOpt} ${s.segOn}` : s.segOpt} onClick={() => { setView(k); showDay(day) }}>{k === 'week' ? 'Week' : 'Month'}</button>)}
                </div>
                <button type="button" aria-label="Earlier" className={s.arrow} disabled={view === 'week' ? wk === 0 : ym <= monthFirst(page.today)} onClick={() => (view === 'week' ? setWk(w => Math.max(0, w - 1)) : setYm(m => addMonths(m, -1)))}>‹</button>
                <button type="button" aria-label="Later" className={s.arrow} disabled={view === 'week' ? addDays(weekDays[6], 1) > last : addMonths(ym, 1) > last} onClick={() => (view === 'week' ? setWk(w => w + 1) : setYm(m => addMonths(m, 1)))}>›</button>
              </div>
              {view === 'week' ? (
                <div className={s.days}>
                  {weekDays.map(d => {
                    const open = d <= last && openDay(d)
                    return (
                      <button key={d} type="button" disabled={!open} className={d === day ? `${s.day} ${s.on}` : s.day} onClick={() => { setDay(d); setStart('') }}>
                        <span>{DOW[dowOf(d)]}</span><b>{Number(d.slice(8))}</b>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className={s.month}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <span key={w} className={s.monthDow}>{w}</span>)}
                  {monthCells.map(d => {
                    const inMonth = d.slice(0, 7) === ym.slice(0, 7), open = inMonth && d >= page.today && d <= last && openDay(d)
                    return (
                      <button key={d} type="button" disabled={!open} className={[s.mday, d === day && inMonth ? s.on : '', inMonth ? '' : s.mdayOut].join(' ')} onClick={() => { setDay(d); setStart('') }}>
                        {Number(d.slice(8))}{d === page.today && <i className={s.todayDot} />}
                      </button>
                    )
                  })}
                </div>
              )}

              <h2 className={s.h2}>3 · Time · {dayLabel(day)}</h2>
              <div className={s.slots}>
                {slots.map(x => {
                  const off = x.full || x.past, on = start === x.start
                  return (
                    <button key={x.time} type="button" disabled={off} className={on ? `${s.slot} ${s.on}` : s.slot} onClick={() => setStart(x.start)}>
                      <b>{x.label}</b><span>{x.past ? 'Passed' : x.full ? 'Full' : `${x.left} of ${r?.cap ?? 0} free`}</span>
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

        <section id="partner-list" className={s.card}>
          <div className={s.listHead}>
            <h2 className={s.h2}>Bookings through this link · {list.length}</h2>
            <input className={`${s.input} ${s.listSearch}`} value={listQ} onChange={e => setListQ(e.target.value)} placeholder="Search customer, phone, booker or reference" />
          </div>
          {(() => {
            const q = listQ.trim().toLowerCase()
            const shown = list.filter(b => !q || `${b.customer} ${b.customerPhone} ${b.booker} ${b.ref} ${b.showroomName}`.toLowerCase().includes(q))
            if (!shown.length) return <p className={s.muted}>{list.length ? 'No booking matches.' : 'No bookings yet.'}</p>
            return (
              <div className={s.table}>
                <div className={`${s.row} ${s.rowHead}`}><span>When</span><span>Showroom</span><span>Customer</span><span>Phone</span><span>Booked by</span><span>Reference</span><span /></div>
                {shown.map(b => (
                  <div key={b.ref} className={s.row}>
                    <span>{whenOf(b.start)}</span><span>{b.showroomName}</span><span>{b.customer}</span><span>{b.customerPhone}</span><span>{b.booker}</span>
                    <span className={s.refCell}>{b.ref}</span>
                    <span><button type="button" className={s.ghost} onClick={() => { setRefText(b.ref); void findRef(b.ref); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Open</button></span>
                  </div>
                ))}
              </div>
            )
          })()}
        </section>
      </div>
    </div>
  )


  // Pages, for the phone (the owner, 2026-10-29: "做成分页会更好；首页可以有他已经的预约，或 no appt, book appointment now"):
  // Home — this booker's bookings (by the name kept on this phone) or "No appointment yet" and Book appointment now — then
  // 1 Showroom · 2 Date & time · 3 Details, each with Back and Next.
  const mine = meName.trim() ? list.filter(b => b.booker.trim().toLowerCase() === meName.trim().toLowerCase()) : []
  const go = (to: Step) => { setStep(to); setError(''); window.scrollTo({ top: 0 }) }
  const startNew = () => { stopEditing(); setDone(null); go('room') }
  const openBooking = (ref: string) => { setRefText(ref); void findRef(ref) }
  const STEPS: Step[] = ['room', 'time', 'details']
  const stepNo = STEPS.indexOf(step) + 1
  const stepTitle = step === 'room' ? 'Showroom' : step === 'time' ? 'Date & time' : 'Details'
  const card = (b: PartnerBooked) => (
    <button key={b.ref} type="button" className={s.bookingCard} onClick={() => openBooking(b.ref)}>
      <span className={s.bcWhen}>{whenOf(b.start)}</span>
      <span className={s.bcRoom}>{b.showroomName}</span>
      <span className={s.bcLine}>{b.customer} · {b.customerPhone}</span>
      <span className={s.bcFoot}><span className={s.refCell}>{b.ref}</span><span>by {b.booker}</span><span className={s.bcOpen}>Open ›</span></span>
    </button>
  )

  return (
    <div className={s.root}>
      <div className={`${s.wrap} ${s.wrapPhone}`}>
        <header className={s.head}>
          <div>
            <div className={s.kicker}>HOUZS showrooms · for {page.name}</div>
            <h1 className={s.title}>{step === 'home' && !done ? (meName.trim() ? `Hi, ${meName.trim()}` : 'Showroom bookings') : editing ? 'Change a booking' : 'Book a showroom visit'}</h1>
          </div>
        </header>

        {done ? (
          <section className={s.done}>
            <div className={s.doneBadge}>{done.state === 'cancelled' ? 'Cancelled' : 'Booked'}</div>
            <h2>{done.state === 'cancelled' ? 'The booking is cancelled' : 'The slot is yours'}</h2>
            <div className={s.ref}>{done.ref}</div>
            <p className={s.muted}>{done.state === 'cancelled' ? 'Its slot is free again.' : 'It is on your home page — open it there to change or cancel.'}</p>
            <dl className={s.facts}>
              <dt>When</dt><dd>{whenOf(done.start)}</dd>
              <dt>Showroom</dt><dd>{done.showroomName}</dd>
              <dt>Customer</dt><dd>{done.customer} · {done.customerPhone}</dd>
              <dt>Booked by</dt><dd>{done.booker}{done.bookerPhone ? ` · ${done.bookerPhone}` : ''}</dd>
              {done.remarks && <><dt>Remarks</dt><dd>{done.remarks}</dd></>}
              {done.note && <><dt>Your note</dt><dd>{done.note}</dd></>}
            </dl>
            <div className={s.navRow}>
              <button type="button" className={s.ghost} onClick={() => { again(); go('home') }}>Home</button>
              <button type="button" className={s.primary} onClick={() => { again(); go('room') }}>Book another</button>
            </div>
          </section>
        ) : step === 'home' ? (<>
          <section className={s.card}>
            <h2 className={s.h2}>Your appointments{mine.length ? ` · ${mine.length}` : ''}</h2>
            {mine.length ? <div className={s.cards}>{mine.map(card)}</div> : (
              <div className={s.empty}>
                <b>No appointment yet</b>
                <span className={s.muted}>{meName.trim() ? 'Book a showroom visit for your customer.' : 'Your bookings show here once you have made one on this phone.'}</span>
              </div>
            )}
            <button type="button" className={`${s.primary} ${s.bigBtn}`} onClick={startNew}>Book appointment now</button>
          </section>

          <section className={s.card}>
            <h2 className={s.h2}>Find your bookings</h2>
            <div className={s.lookupRow}>
              <input className={s.input} value={findQ} onChange={e => { setFindQ(e.target.value); setFound(null) }} placeholder="Your name, customer, phone or reference" onKeyDown={e => { if (e.key === 'Enter') find() }} />
              <button type="button" className={s.ghost} onClick={find}>Search</button>
            </div>
            {refError && <span className={s.err}>{refError}</span>}
            {found && (found.length ? <div className={s.cards}>{found.map(card)}</div> : <p className={s.muted}>No booking found for “{findQ.trim()}”.</p>)}
          </section>

          <section className={s.card}>
            <button type="button" className={s.foldHead} onClick={() => setAllOpen(o => !o)} aria-expanded={allOpen}>
              <span className={s.h2}>All bookings through this link · {list.length}</span><span>{allOpen ? '▴' : '▾'}</span>
            </button>
            {allOpen && (<>
              <input className={s.input} value={listQ} onChange={e => setListQ(e.target.value)} placeholder="Search customer, phone, booker or reference" />
              {(() => {
                const q = listQ.trim().toLowerCase()
                const shown = list.filter(b => !q || `${b.customer} ${b.customerPhone} ${b.booker} ${b.ref} ${b.showroomName}`.toLowerCase().includes(q))
                return shown.length ? <div className={s.cards}>{shown.map(card)}</div> : <p className={s.muted}>{list.length ? 'No booking matches.' : 'No bookings yet.'}</p>
              })()}
            </>)}
          </section>
        </>) : (
          <section className={s.card}>
            <div className={s.stepHead}>
              <button type="button" className={s.backBtn} onClick={() => go(step === 'room' ? 'home' : step === 'time' ? (editing ? 'details' : 'room') : (editing ? 'home' : 'time'))}>‹ Back</button>
              <span className={s.stepNo}>Step {stepNo} of 3 · {stepTitle}</span>
            </div>
            <div className={s.progress}><i style={{ width: `${(stepNo / 3) * 100}%` }} /></div>
            {editing && (
              <div className={s.editing}>
                Changing <b>{editing.ref}</b> · {editing.customer}, {whenOf(editing.start)}
              </div>
            )}

            {step === 'room' && (<>
              <div className={s.rooms}>
                {page.rooms.map(x => (
                  <button key={x.id} type="button" className={x.id === room ? `${s.room} ${s.on}` : s.room} onClick={() => { setRoom(x.id); setStart('') }}>
                    <b>{x.name}</b>{x.address && <span>{x.address}</span>}
                  </button>
                ))}
                {!page.rooms.length && <p className={s.muted}>No showroom is open for booking.</p>}
              </div>
              <div className={s.navRow}><span /><button type="button" className={s.primary} disabled={!room} onClick={() => go('time')}>Next</button></div>
            </>)}

            {step === 'time' && (<>
              <div className={s.pickHead}>
                <span className={s.monthLabel}>{r?.name} · {view === 'week' ? `${MON[Number(weekDays[0].slice(5, 7)) - 1]} ${weekDays[0].slice(0, 4)}` : `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`}</span>
                <div className={s.seg}>
                  {(['week', 'month'] as const).map(k => <button key={k} type="button" aria-pressed={view === k} className={view === k ? `${s.segOpt} ${s.segOn}` : s.segOpt} onClick={() => { setView(k); showDay(day) }}>{k === 'week' ? 'Week' : 'Month'}</button>)}
                </div>
                <button type="button" aria-label="Earlier" className={s.arrow} disabled={view === 'week' ? wk === 0 : ym <= monthFirst(page.today)} onClick={() => (view === 'week' ? setWk(w => Math.max(0, w - 1)) : setYm(m => addMonths(m, -1)))}>‹</button>
                <button type="button" aria-label="Later" className={s.arrow} disabled={view === 'week' ? addDays(weekDays[6], 1) > last : addMonths(ym, 1) > last} onClick={() => (view === 'week' ? setWk(w => w + 1) : setYm(m => addMonths(m, 1)))}>›</button>
              </div>
              {view === 'week' ? (
                <div className={s.days}>
                  {weekDays.map(d => {
                    const open = d <= last && openDay(d)
                    return (
                      <button key={d} type="button" disabled={!open} className={d === day ? `${s.day} ${s.on}` : s.day} onClick={() => { setDay(d); setStart('') }}>
                        <span>{DOW[dowOf(d)]}</span><b>{Number(d.slice(8))}</b>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className={s.month}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <span key={w} className={s.monthDow}>{w}</span>)}
                  {monthCells.map(d => {
                    const inMonth = d.slice(0, 7) === ym.slice(0, 7), open = inMonth && d >= page.today && d <= last && openDay(d)
                    return (
                      <button key={d} type="button" disabled={!open} className={[s.mday, d === day && inMonth ? s.on : '', inMonth ? '' : s.mdayOut].join(' ')} onClick={() => { setDay(d); setStart('') }}>
                        {Number(d.slice(8))}{d === page.today && <i className={s.todayDot} />}
                      </button>
                    )
                  })}
                </div>
              )}
              <h2 className={s.h2}>Time · {dayLabel(day)}</h2>
              <div className={s.slots}>
                {slots.map(x => {
                  const off = x.full || x.past, on = start === x.start
                  return (
                    <button key={x.time} type="button" disabled={off && !on} className={on ? `${s.slot} ${s.on}` : s.slot} onClick={() => setStart(x.start)}>
                      <b>{x.label}</b><span>{x.past ? 'Passed' : x.full ? 'Full' : `${x.left} of ${r?.cap ?? 0} free`}</span>
                    </button>
                  )
                })}
                {!slots.length && <p className={s.muted}>The showroom is closed that day.</p>}
              </div>
              <div className={s.navRow}><span /><button type="button" className={s.primary} disabled={!start} onClick={() => go('details')}>Next</button></div>
            </>)}

            {step === 'details' && (<>
              <div className={s.summary}>
                {start && r ? <span><b>{r.name}</b> · {whenOf(start)}</span> : <span className={s.muted}>Pick a showroom, a date and a time.</span>}
                <button type="button" className={s.link} onClick={() => go(editing ? 'time' : 'room')}>Change</button>
              </div>
              <h2 className={s.h2}>You</h2>
              <div className={s.two}>
                <Field label="Your name *"><input className={s.input} value={form.booker} maxLength={80} onChange={e => set({ booker: e.target.value })} /></Field>
                <Field label="Your phone"><input className={s.input} value={form.bookerPhone} maxLength={30} inputMode="tel" onChange={e => set({ bookerPhone: e.target.value })} /></Field>
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
              {error && <div className={s.err}>{error}</div>}
              <div className={s.actions}>
                {editing && <button type="button" className={s.danger} disabled={busy} onClick={() => void cancel()}>Cancel booking</button>}
                <button type="button" className={s.primary} disabled={busy || !!problem} title={problem ?? undefined} onClick={() => void submit()}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Book this slot'}
                </button>
              </div>
            </>)}
          </section>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={s.field}><span>{label}</span>{children}</label>
}
