'use client'

import { Fragment, useMemo, useState, useTransition, type ReactNode } from 'react'
import { officeTime } from '@/lib/office-time'
import { Select } from '@/components/hrv/select'
import ViewingAsBanner from '@/components/layout/ViewingAsBanner'
import {
  CAND_STAGE, CHIP, HIRE_FILTERS, MAJOR_EVENTS, MEMBER_KIND, ORANGE, SLATE,
  bookingTimes, budgetLabel, candChip, clashOf, dayLabel, daysToFill, hireChip, hm, hourFrom, initials, isPendingHire,
  isPendingRequest, missingFor, pipeline, positionLabel, requestStatusLabel, requestTitle, reviewItems, shiftDay, slotAt,
  type CandStage, type HrAppData, type HrBooking, type HrHire,
} from '@/lib/hr-app/model'
import s from './hr-app.module.css'

// The HR phone app (2026-10-11, HR revamp round 2 — README §17, the handoff's
// `HR Mobile App.dc.html`): Home · Review · Hiring · Rooms · More, a stack of
// pages pushed on top of a tab, and sheets that slide up over everything.
// It reads the portal's own modules and writes through their actions; the
// app keeps only where you are and what you are typing.

export type ActResult = { ok: true } | { ok: false; reason: string }

export interface HrAppActions {
  hireAck(id: string, ownerId: string): Promise<ActResult>
  hireInfo(id: string, note: string): Promise<ActResult>
  hireDecline(id: string, note: string): Promise<ActResult>
  hireCancel(id: string): Promise<ActResult>
  hireFill(id: string, hired: string, source: string, cost: string): Promise<ActResult>
  candStage(hireId: string, candId: string, stage: CandStage): Promise<ActResult>
  candAdd(hireId: string, cand: { name: string; phone: string; note: string }): Promise<ActResult>
  requestDecide(id: string, decision: 'accept' | 'approve' | 'reject', note: string): Promise<ActResult>
  book(b: { title: string; dept: string; roomId: string; date: string; from: number; to: number; attendees: string[]; pax: number }): Promise<ActResult>
  bookCancel(id: string): Promise<ActResult>
  talentNotes(id: string, notes: string): Promise<ActResult>
  talentRemove(id: string): Promise<ActResult>
  letterLink(letterId: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }>
  /** After a write: read the app's data again. */
  refresh(): void
}

type Tab = 'home' | 'review' | 'hiring' | 'rooms' | 'more'
type Page =
  | { k: 'hire'; id: string }
  | { k: 'req'; id: string }
  | { k: 'insights' }
  | { k: 'talents' }
  | { k: 'talent'; id: string }
  | { k: 'docs' }
  | { k: 'person'; id: string }
type Sheet =
  | { k: 'stage'; cid: string; name: string; cur: CandStage }
  | { k: 'ack' }
  | { k: 'info' }
  | { k: 'fill' }
  | { k: 'cand' }
  | { k: 'book' }
  | { k: 'booking'; id: string }

type Form = Record<string, string | string[] | number | undefined>

// The tab bar's icons (the prototype's own two-path glyphs, 21px, stroke 1.8).
const TAB_ICON: Record<Tab, [string, string]> = {
  home: ['M3 10.5 12 4l9 6.5', 'M5.5 9.5V20h13V9.5'],
  review: ['M4 5.5h16v13H4z', 'M8 12.2l2.7 2.7L16 9.6'],
  hiring: ['M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M4 20c0-3.6 2.7-6 6-6 1.2 0 2.3.3 3.2.8', 'M18 14v6M15 17h6'],
  rooms: ['M3.5 5h17v15h-17z', 'M8 3v4M16 3v4M3.5 10h17'],
  more: ['M5 12h.01M12 12h.01M19 12h.01', 'M4 6h16M4 18h16'],
}
const TABS: Array<[Tab, string]> = [['home', 'Home'], ['review', 'Review'], ['hiring', 'Hiring'], ['rooms', 'Rooms'], ['more', 'More']]
const TITLES: Record<string, [string, string]> = {
  home: ['', 'Human Resource'], review: ['Inbox', 'Review'], hiring: ['Hiring', 'Requests'], rooms: ['Admin', 'Meeting rooms'],
  more: ['HR', 'More'], insights: ['Hiring', 'Insights'], talents: ['Hiring', 'Talent Bank'], docs: ['Documentation', 'Data center'],
}

/** The book sheet opens on HR, as the prototype's does — or the first department there is. */
const defaultDept = (d: HrAppData) => (d.bookDepts.find(x => x.name === 'HR') ?? d.bookDepts[0])?.id ?? ''

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(128 107 96)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export default function HrApp({ data, actions }: { data: HrAppData; actions: HrAppActions }) {
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Page[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [form, setForm] = useState<Form>({})
  const [formErr, setFormErr] = useState('')
  const [note, setNote] = useState('')
  const [rvTab, setRvTab] = useState<'all' | 'hire' | 'req'>('all')
  const [hFilter, setHFilter] = useState('open')
  const [roomView, setRoomView] = useState<'cards' | 'timeline'>('cards')
  const [date, setDate] = useState<string | null>(null)
  const [tq, setTq] = useState('')
  const [arm, setArm] = useState(false)
  const [talentNotes, setTalentNotes] = useState<{ id: string; text: string } | null>(null)
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState('')

  // A part their tabs close is left out of every list (2026-10-11): Hiring › Requests closed, no request is
  // listed or reviewed — Insights alone still reads them (parts.insights).
  const d = useMemo(() => (data.parts.hiring ? data : { ...data, hires: [] }), [data])
  const top = stack[stack.length - 1]
  const view: string = top ? top.k : tab
  const today = d.today
  const day = date ?? today
  const live = d.bookings
  const items = useMemo(() => reviewItems(d), [d])
  const staffName = (id: string | null | undefined) => d.staff.find(p => p.id === id)?.name ?? id ?? '—'

  const push = (p: Page) => {
    setStack(st => [...st, p])
    setNote('')
    setArm(false)
  }
  const pop = () => setStack(st => st.slice(0, -1))
  const goTab = (t: Tab) => {
    setTab(t)
    setStack([])
    setSheet(null)
  }
  const openSheet = (sh: Sheet, f: Form = {}) => {
    setSheet(sh)
    setForm(f)
    setFormErr('')
    setArm(false)
  }

  /** Run a write; close what asked for it on success, say why on a refusal. */
  const run = (fn: () => Promise<ActResult>, after?: () => void, inSheet = true) => {
    startBusy(async () => {
      const res = await fn()
      if (!res.ok) {
        if (inSheet && sheet) setFormErr(res.reason)
        else setError(res.reason)
        return
      }
      setError('')
      after?.()
      actions.refresh()
    })
  }

  // ── the open hiring request ──
  const hr = top?.k === 'hire' ? d.hires.find(h => h.id === top.id) ?? null : null
  // ── the open member request ──
  const rr = top?.k === 'req' ? d.requests.find(r => r.id === top.id) ?? null : null
  // ── the open talent / person ──
  const tt = top?.k === 'talent' ? d.talents.find(t => t.id === top.id) ?? null : null
  const pp = top?.k === 'person' ? d.staff.find(p => p.id === top.id) ?? null : null

  const [kicker, title] =
    view === 'hire' ? [hr?.id ?? '', hr ? hr.position : '']
      : view === 'req' ? [rr ? MEMBER_KIND[rr.kind] : '', rr ? requestTitle(rr) : '']
        : view === 'talent' ? ['Talent Bank', tt?.name ?? '']
          : view === 'person' ? ['Data center', pp?.name ?? '']
            : TITLES[view] ?? ['', '']

  return (
    <div className={s.app} data-hr-app="">
      {d.viewingAs ? <ViewingAsBanner name={d.viewingAs} /> : null}
      <div className={s.scroller}>
        <header className={s.head}>
          {stack.length > 0 ? (
            <button type="button" className={s.back} onClick={pop} aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          ) : null}
          {view === 'home' ? (
            <span className={s.homeTile} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4a5 5 0 0 1 3 4.6v1" /></svg>
            </span>
          ) : null}
          <div className={s.headText}>
            {kicker ? <div className={s.kicker}>{kicker}</div> : null}
            {/* A div, as the prototype's: the portal's global h1 rule would set it in Georgia. */}
            <div className={s.title} role="heading" aria-level={1}>{title}</div>
          </div>
          {view === 'rooms' && d.may.book ? (
            // With no room yet there is nothing to book: the portal's "+ Book a room" greys out too.
            <button type="button" className={s.headAction} disabled={!d.rooms.length} onClick={() => openSheet({ k: 'book' }, { pax: 1, att: d.meId ? [d.meId] : [], dept: defaultDept(d) })}>
              + Book
            </button>
          ) : null}
        </header>

        {/* The body slides in once, as the prototype's; each screen is new when the view or its page changes. */}
        <div className={s.body}>
          <Fragment key={view + (top && 'id' in top ? top.id : '')}>
          {error ? <div className={s.formErr} role="alert">{error}</div> : null}

          {view === 'home' ? (
            <HomeScreen d={d} items={items} goTab={goTab} push={push} openBooking={id => openSheet({ k: 'booking', id })} staffName={staffName} />
          ) : null}

          {view === 'review' ? (
            <>
              <div className={s.chips}>
                {([['all', 'All', items.length], ['hire', 'Hiring', d.hires.filter(isPendingHire).length], ['req', 'Member services', d.requests.filter(isPendingRequest).length]] as const).map(([k, label, n]) => (
                  <button key={k} type="button" className={s.chip} onClick={() => setRvTab(k)} style={rvTab === k ? { background: 'rgb(43 31 23)', color: 'rgb(246 238 230)' } : { background: 'rgb(255 255 255)', color: 'rgb(43 31 23)' }}>
                    {label}<span className={s.chipN}>{n}</span>
                  </button>
                ))}
              </div>
              {items.filter(it => rvTab === 'all' || it.k === rvTab).map(it => (
                <button key={it.k + it.id} type="button" className={s.item} onClick={() => push({ k: it.k, id: it.id })}>
                  <div className={s.itemTop}>
                    <span className={s.itemTag} style={{ background: it.tagBg, color: it.tagFg }}>{it.tag}</span>
                    <span className={s.spacer} />
                    <span className={s.itemWhen}>{it.when}</span>
                  </div>
                  <div className={s.itemTitle}>{it.title}</div>
                  <div className={s.itemMeta}>{it.meta}</div>
                </button>
              ))}
              {items.filter(it => rvTab === 'all' || it.k === rvTab).length === 0 ? <div className={s.emptyCard}>Nothing waiting.</div> : null}
            </>
          ) : null}

          {view === 'hiring' ? (
            <>
              <div className={s.chips}>
                {HIRE_FILTERS.map(f => (
                  <button key={f.key} type="button" className={s.chip} onClick={() => setHFilter(f.key)} style={hFilter === f.key ? { background: 'rgb(43 31 23)', color: 'rgb(246 238 230)' } : { background: 'rgb(255 255 255)', color: 'rgb(43 31 23)' }}>
                    {f.label}<span className={s.chipN}>{d.hires.filter(h => f.statuses.includes(h.status)).length}</span>
                  </button>
                ))}
              </div>
              {d.hires.filter(h => (HIRE_FILTERS.find(f => f.key === hFilter)?.statuses ?? []).includes(h.status)).map(h => {
                const ch = hireChip(h.status)
                return (
                  <button key={h.id} type="button" className={s.hire} style={{ borderLeftColor: ch.fg }} onClick={() => push({ k: 'hire', id: h.id })}>
                    <div className={s.itemTop}>
                      <span className={s.hireId}>{h.id}</span>
                      <span className={s.spacer} />
                      <span className={s.statusChip} style={{ background: ch.bg, color: ch.fg }}>{ch.label}</span>
                    </div>
                    <div className={s.hirePos}>{positionLabel(h)}</div>
                    <div className={s.hireMeta}>
                      <span>{h.dept}</span>
                      <span className={s.budget}>{budgetLabel(h.budget)}</span>
                      <span>{h.ownerName ?? 'No owner'}</span>
                    </div>
                    <div className={s.pipe}>
                      {pipeline(h.candidates).map(p => (
                        <span key={p.l} className={s.pipePill}><b>{p.v}</b> {p.l}</span>
                      ))}
                    </div>
                  </button>
                )
              })}
              {/* Not in the handoff (its sample always has requests): the Review's own empty card. */}
              {d.hires.every(h => !(HIRE_FILTERS.find(f => f.key === hFilter)?.statuses ?? []).includes(h.status)) ? <div className={s.emptyCard}>No requests here.</div> : null}
            </>
          ) : null}

          {view === 'hire' && hr ? <HireScreen hr={hr} openSheet={openSheet} may={d.may} /> : null}

          {view === 'req' && rr ? (
            <>
              <div className={s.reqChips}>
                <span className={s.pageChip} style={{ background: 'rgb(249 238 214)', color: 'rgb(150 100 12)' }}>{requestStatusLabel(rr.status)}</span>
                <span className={s.pageChip} style={{ background: 'rgb(240 236 230)' }}>{MEMBER_KIND[rr.kind]}</span>
              </div>
              <section className={s.facts}>
                {([
                  ['Reference', rr.code], ['Sub-department', rr.sub], ['Submitted by', rr.byName],
                  ...(rr.kind === 'waiting'
                    ? [['Applicant', rr.newPerson], ['Mobile', rr.contact], ['Joining', rr.start]]
                    : rr.kind === 'claim'
                      ? [['Category', rr.category], ['Location', rr.location], ['Amount', rr.amount ? `RM ${rr.amount}` : '']]
                      : [['Leaving', rr.originalName], ['Effective', rr.effective], ['Reason', rr.reason]]),
                ] as Array<[string, string | null | undefined]>).filter(([, v]) => v).map(([l, v]) => (
                  <div key={l} className={s.fact}><span className={s.factL}>{l}</span><span className={s.factV}>{v}</span></div>
                ))}
              </section>
              <textarea className={s.note} rows={3} placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
              {isPendingRequest(rr) && rr.kind !== 'replacement' && d.may.decide ? (
                <div className={s.btnRow}>
                  <button type="button" className={s.rejectBtn} disabled={busy} onClick={() => run(() => actions.requestDecide(rr.id, 'reject', note), pop, false)}>Reject</button>
                  <button type="button" className={s.approveBtn} disabled={busy} onClick={() => run(() => actions.requestDecide(rr.id, rr.kind === 'waiting' ? 'accept' : 'approve', note), pop, false)}>
                    {rr.kind === 'waiting' ? 'Accept to waiting list' : 'Approve'}
                  </button>
                </div>
              ) : null}
              {rr.kind === 'replacement' ? <div className={s.replNote}>Replacements need a person and an effective date. Finish them in Member services on the desktop.</div> : null}
            </>
          ) : null}

          {view === 'rooms' ? (
            <RoomsScreen
              d={d} day={day} today={today} setDate={setDate} roomView={roomView} setRoomView={setRoomView}
              openBooking={id => openSheet({ k: 'booking', id })}
              bookAt={d.may.book ? (roomId, from) => openSheet({ k: 'book' }, { pax: 1, att: d.meId ? [d.meId] : [], dept: defaultDept(d), room: roomId, from: String(from), to: String(hourFrom(from)) }) : undefined}
            />
          ) : null}

          {view === 'more' ? (
            <section className={s.more}>
              {([
                ['insights', 'Insights', 'Hiring time, cost and sources', '◔', 'rgb(230 237 241)', SLATE, d.parts.insights],
                ['talents', 'Talent Bank', `${d.talents.length} people kept on file`, '★', 'rgb(255 244 231)', 'rgb(163 78 37)', d.parts.talent],
                ['docs', 'Data center', 'Letters on each person’s record', '▤', 'rgb(238 240 226)', 'rgb(88 98 68)', d.parts.docs],
              ] as const).filter(row => row[6]).map(([k, t, sub, icon, bg, fg]) => (
                <button key={k} type="button" className={s.moreRow} onClick={() => push({ k } as Page)}>
                  <span className={s.moreIcon} style={{ background: bg, color: fg }}>{icon}</span>
                  <span className={s.grow}><span className={s.moreTitle}>{t}</span><span className={s.moreSub}>{sub}</span></span>
                  <Chevron />
                </button>
              ))}
            </section>
          ) : null}

          {view === 'insights' ? <InsightsScreen d={data} /> : null}

          {view === 'talents' ? (
            <>
              <input className={s.search} placeholder="Search talent" value={tq} onChange={e => setTq(e.target.value)} />
              {d.talents.filter(t => !tq.trim() || `${t.name} ${t.position} ${t.notes}`.toLowerCase().includes(tq.trim().toLowerCase())).map(t => (
                <button key={t.id} type="button" className={s.talent} onClick={() => push({ k: 'talent', id: t.id })}>
                  <span className={s.talentIni}>{initials(t.name)}</span>
                  <span className={s.grow}>
                    <span className={s.candName}>{t.name}</span>
                    <span className={s.talentSub}>{t.position} · {t.dept}</span>
                    <span className={s.talentNote}>{(t.notes || '').split('\n')[0]}</span>
                  </span>
                </button>
              ))}
              {d.talents.length === 0 ? <div className={s.emptyCard}>Nobody kept on file yet.</div> : null}
            </>
          ) : null}

          {view === 'talent' && tt ? (
            <>
              <section className={s.facts}>
                {([['Good fit for', tt.position], ['Department', tt.dept], ['Phone', tt.phone], ['Email', tt.email], ['Saved from', tt.from || 'Added directly'], ['Saved', tt.when]] as Array<[string, string | null | undefined]>).filter(([, v]) => v).map(([l, v]) => (
                  <div key={l} className={s.fact}><span className={s.factL}>{l}</span><span className={s.factV}>{v}</span></div>
                ))}
              </section>
              <section className={s.long}>
                <div className={s.capsLabel}>HR notes</div>
                <textarea
                  className={s.notesBox}
                  rows={5}
                  readOnly={!d.may.talentEdit}
                  value={talentNotes?.id === tt.id ? talentNotes.text : tt.notes}
                  onChange={e => setTalentNotes({ id: tt.id, text: e.target.value })}
                  onBlur={() => {
                    if (d.may.talentEdit && talentNotes?.id === tt.id && talentNotes.text !== tt.notes) run(() => actions.talentNotes(tt.id, talentNotes.text), undefined, false)
                  }}
                />
              </section>
              {d.may.talentEdit ? (
                <button
                  type="button"
                  className={s.removeBtn}
                  style={{ background: arm ? 'rgb(250 228 224)' : 'rgb(255 255 255)' }}
                  disabled={busy}
                  onClick={() => {
                    if (!arm) return setArm(true)
                    run(() => actions.talentRemove(tt.id), () => { pop(); setArm(false) }, false)
                  }}
                >
                  {arm ? 'Tap again to remove' : 'Remove from Talent Bank'}
                </button>
              ) : null}
            </>
          ) : null}

          {view === 'docs' ? (
            d.staff.map(p => {
              const n = d.letters.filter(l => l.staffId === p.id).length
              return (
                <button key={p.id} type="button" className={s.person} onClick={() => push({ k: 'person', id: p.id })}>
                  <span className={s.grow}>
                    <span className={s.candName}>{p.name}</span>
                    <span className={s.meta12} style={{ marginTop: 0 }}>{p.title} · {p.dept}</span>
                  </span>
                  {missingFor(d, p.id).length ? <span className={s.bang}>!</span> : null}
                  <span className={s.count}>{n}</span>
                </button>
              )
            })
          ) : null}

          {view === 'person' && pp ? (
            <>
              {missingFor(d, pp.id).map(m => <div key={m} className={s.missing}>{m} missing</div>)}
              {d.letters.filter(l => l.staffId === pp.id).map(l => (
                <div key={l.id} className={s.letter}>
                  <span className={s.letterIcon}>{(l.file.split('.').pop() || 'PDF').toUpperCase().slice(0, 4)}</span>
                  <span className={s.letterType}>{d.docTypes.find(t => t.id === l.typeId)?.name ?? l.typeName}</span>
                  <button
                    type="button"
                    className={s.viewBtn}
                    onClick={() => {
                      // A link made at the press (never kept): opened in a tab of its own.
                      const tab = window.open('', '_blank')
                      // The file's page gets no handle back on the app.
                      if (tab) tab.opener = null
                      void actions.letterLink(l.id).then(res => {
                        if (res.ok && tab) tab.location.href = res.url
                        else {
                          tab?.close()
                          if (!res.ok) setError(res.reason)
                        }
                      })
                    }}
                  >
                    View
                  </button>
                </div>
              ))}
              {d.letters.filter(l => l.staffId === pp.id).length === 0 ? <div className={s.noLetters}>No letters on file.</div> : null}
            </>
          ) : null}
          </Fragment>
        </div>
      </div>

      {view === 'hire' && hr && d.may.hireApprove ? <HireBar hr={hr} busy={busy} openSheet={openSheet} cancel={() => run(() => actions.hireCancel(hr.id), undefined, false)} meId={d.meId} /> : null}

      <nav className={s.tabs} aria-label="HR app">
        {TABS.map(([k, label]) => {
          const on = tab === k
          const badge = k === 'review' && items.length ? String(items.length) : ''
          return (
            <button key={k} type="button" className={s.tab} aria-current={on ? 'page' : undefined} onClick={() => goTab(k)}>
              <span className={s.tabPill}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={TAB_ICON[k][0]} />
                  <path d={TAB_ICON[k][1]} />
                </svg>
              </span>
              {badge ? <span className={s.tabBadge}>{badge}</span> : null}
              <span className={s.tabLabel}>{label}</span>
            </button>
          )
        })}
      </nav>

      {sheet ? (
        <SheetView
          d={d} sheet={sheet} hr={hr} day={day} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr}
          busy={busy} arm={arm} setArm={setArm} close={() => setSheet(null)} run={run} actions={actions} live={live}
        />
      ) : null}
    </div>
  )
}

function HomeScreen({ d, items, goTab, push, openBooking, staffName }: {
  d: HrAppData
  items: ReturnType<typeof reviewItems>
  goTab: (t: Tab) => void
  push: (p: Page) => void
  openBooking: (id: string) => void
  staffName: (id: string | null) => string
}) {
  const missing = d.staff.filter(p => missingFor(d, p.id).length).length
  const meetings = d.bookings.filter(b => b.date === d.today).sort((a, b) => a.from - b.from)
  void staffName
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.heroHello}>Good {greeting()},</div>
          <div className={s.heroName}>{d.greetName}</div>
        </div>
        <div className={s.heroStats}>
          {([
            [String(items.length), 'To review', 'rgb(244 178 120)', () => goTab('review')],
            [String(d.hires.filter(h => h.status === 'acknowledged').length), 'Open roles', 'rgb(246 238 230)', () => goTab('hiring')],
            [String(missing), 'Letters missing', 'rgb(240 150 140)', () => { goTab('more'); push({ k: 'docs' }) }],
          ] as const).map(([v, l, c, click]) => (
            <button key={l} type="button" className={s.heroStat} onClick={click}>
              <div className={s.heroStatV} style={{ color: c }}>{v}</div>
              <div className={s.heroStatL}>{l}</div>
            </button>
          ))}
        </div>
      </div>
      <section className={s.card18}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Waiting for you</span>
          <button type="button" className={s.cardLink} onClick={() => goTab('review')}>See all</button>
        </div>
        {items.slice(0, 4).map(it => (
          <button key={it.k + it.id} type="button" className={s.todo} onClick={() => push({ k: it.k, id: it.id })}>
            <span className={s.todoTag} style={{ background: it.tagBg, color: it.tagFg }}>{it.tag}</span>
            <span className={s.grow}>
              <span className={s.line}>{it.title}</span>
              <span className={s.meta12}>{it.meta}</span>
            </span>
            <Chevron />
          </button>
        ))}
        {items.length === 0 ? <div className={s.allClear}>All clear.</div> : null}
      </section>
      <section className={s.card18}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>{"Today's meetings"}</span>
          <button type="button" className={s.cardLink} onClick={() => goTab('rooms')}>Rooms</button>
        </div>
        {meetings.map(b => (
          <button key={b.id} type="button" className={s.meet} onClick={() => openBooking(b.id)}>
            <span className={s.meetTime}>{hm(b.from)}</span>
            <span className={s.meetBlock} style={{ borderLeftColor: b.guest ? ORANGE : SLATE }}>
              <span className={s.line}>{b.title}</span>
              <span className={s.meetMeta}>{(d.rooms.find(r => r.id === b.roomId)?.name ?? '') + ' · ' + (b.guest ? b.company ?? '' : b.byName)}</span>
            </span>
          </button>
        ))}
        {meetings.length === 0 ? <div className={s.meetNone}>No meetings today.</div> : null}
      </section>
    </>
  )
}

/** "afternoon" — by the office's clock (UTC+8), as the portal greets. */
function greeting(): string {
  const h = officeTime().hour()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

function HireScreen({ hr, openSheet, may }: { hr: HrHire; openSheet: (sh: Sheet, f?: Form) => void; may: HrAppData['may'] }) {
  const ch = hireChip(hr.status)
  const facts = ([
    ['Department', hr.dept], ['Requested by', hr.requester], ['Employment', hr.employment], ['Reason', hr.reason], ['Age', hr.age], ['Gender', hr.gender],
    ...(hr.status === 'filled' ? [['Hired', hr.hired], ['Hired through', hr.source], ['Cost', hr.cost ? `RM ${hr.cost}` : '—']] : []),
  ] as Array<[string, string | null | undefined]>).filter(([, v]) => v)
  const longs = ([['Job description', hr.jd], ['Special notes', hr.notes]] as Array<[string, string | undefined]>).filter(([, v]) => v)
  return (
    <>
      <div className={s.pageChips}>
        <span className={s.pageChip} style={{ background: ch.bg, color: ch.fg }}>{ch.label}</span>
        <span className={s.pageChip} style={{ background: 'rgb(255 244 231)', color: 'rgb(163 78 37)' }}>{hr.ownerName ? `Owner: ${hr.ownerName}` : 'No owner yet'}</span>
      </div>
      <div className={s.pageMeta}>From {hr.company || hr.requester} · {hr.when}</div>
      <div className={s.keyGrid}>
        {([['Budget', budgetLabel(hr.budget)], ['Headcount', String(hr.headcount || 1)], ['Start', (hr.start || '—').replace('Within ', '≤ ')]] as const).map(([l, v]) => (
          <div key={l} className={s.keyTile}><div className={s.keyL}>{l}</div><div className={s.keyV}>{v}</div></div>
        ))}
      </div>
      <section className={s.facts}>
        {facts.map(([l, v]) => <div key={l} className={s.fact}><span className={s.factL}>{l}</span><span className={s.factV}>{v}</span></div>)}
      </section>
      {longs.map(([l, v]) => (
        <section key={l} className={s.long}><div className={s.capsLabel}>{l}</div><div className={s.longText}>{v}</div></section>
      ))}
      <section className={s.cands}>
        <div className={s.candsHead}>
          <span className={s.candsTitle}>Candidates · {hr.candidates.length}</span>
          {may.hireCreate ? <button type="button" className={s.plus} aria-label="Add a candidate" onClick={() => openSheet({ k: 'cand' })}>+</button> : null}
        </div>
        {hr.candidates.map(c => {
          const cc = candChip(c.stage)
          return (
            <div key={c.id} className={s.cand}>
              <span className={s.candIni} style={{ background: cc.bg, color: cc.fg }}>{initials(c.name)}</span>
              <span className={s.grow}>
                <span className={s.candName}>{c.name}</span>
                <span className={s.candMeta}>{[c.source, c.phone, c.note].filter(Boolean).join(' · ')}</span>
              </span>
              {may.hireEdit ? (
                <button type="button" className={s.stageBtn} style={{ background: cc.bg, color: cc.fg }} onClick={() => openSheet({ k: 'stage', cid: c.id, name: c.name, cur: c.stage })}>
                  {cc.label} ▾
                </button>
              ) : (
                <span className={s.stageBtn} style={{ background: cc.bg, color: cc.fg }}>{cc.label}</span>
              )}
            </div>
          )
        })}
        {hr.candidates.length === 0 ? <div className={s.noCands}>No candidates yet.</div> : null}
      </section>
      <section className={s.trail}>
        <div className={s.trailTitle}>Audit trail</div>
        {[...hr.events].reverse().map((e, i) => {
          const major = MAJOR_EVENTS.includes(e.what)
          return (
            <div key={i} className={s.ev}>
              <span
                className={s.evDot}
                style={{ width: major ? 10 : 7, height: major ? 10 : 7, background: major ? ORANGE : 'rgb(255 255 255)', boxShadow: major ? 'none' : 'inset 0 0 0 1.5px rgb(205 184 162)' }}
              />
              <span className={s.grow}>
                <span className={s.evWhat} style={{ fontSize: major ? 14 : 13, fontWeight: major ? 700 : 500 }}>{e.what}</span>
                <span className={s.evWho}>{e.who} · {e.when}</span>
                {e.note ? <span className={s.evNote}>{e.note}</span> : null}
              </span>
            </div>
          )
        })}
      </section>
    </>
  )
}

function HireBar({ hr, busy, openSheet, cancel, meId }: { hr: HrHire; busy: boolean; openSheet: (sh: Sheet, f?: Form) => void; cancel: () => void; meId: string | null }) {
  const pending = hr.status === 'submitted' || hr.status === 'needs_info'
  if (!pending && hr.status !== 'acknowledged') return null
  const outline = { borderColor: 'rgb(222 214 203)', background: 'rgb(255 255 255)', color: 'rgb(43 31 23)' }
  const go = { borderColor: ORANGE, background: ORANGE, color: 'rgb(43 31 23)' }
  return (
    <div className={s.actBar}>
      {pending ? (
        <>
          <button type="button" className={s.actBtn} style={{ ...outline, flex: 1 }} onClick={() => openSheet({ k: 'info' }, { note: '' })}>More info</button>
          <button type="button" className={s.actBtn} style={{ ...go, flex: 2 }} onClick={() => openSheet({ k: 'ack' }, { owner: meId ?? '' })}>Acknowledge</button>
        </>
      ) : (
        <>
          <button type="button" className={s.actBtn} style={{ borderColor: 'rgb(236 190 184)', background: 'rgb(255 255 255)', color: 'rgb(176 40 34)', flex: 1 }} disabled={busy} onClick={cancel}>Cancel</button>
          <button type="button" className={s.actBtn} style={{ ...go, flex: 2 }} onClick={() => openSheet({ k: 'fill' }, { hired: '', source: '', cost: '' })}>Mark filled</button>
        </>
      )}
    </div>
  )
}

function RoomsScreen({ d, day, today, setDate, roomView, setRoomView, openBooking, bookAt }: {
  d: HrAppData
  day: string
  today: string
  setDate: (x: string) => void
  roomView: 'cards' | 'timeline'
  setRoomView: (v: 'cards' | 'timeline') => void
  openBooking: (id: string) => void
  /** Absent when they may not book (Meeting rooms · Create closed): the slots take no tap. */
  bookAt?: (roomId: string, from: number) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i))
  const cols = `40px repeat(${Math.max(1, d.rooms.length)}, minmax(0,1fr))`
  const pax = (b: HrBooking) => b.pax
  return (
    <>
      <div className={s.modes}>
        {([['cards', 'By room'], ['timeline', 'Timeline']] as const).map(([k, label]) => (
          <button key={k} type="button" className={s.mode} aria-pressed={roomView === k} onClick={() => setRoomView(k)}>{label}</button>
        ))}
      </div>
      <div className={s.days}>
        {days.map(x => (
          <button key={x} type="button" className={s.day} aria-pressed={x === day} onClick={() => setDate(x)}>
            <span className={s.dayWd}>{x === today ? 'Today' : dayLabel(x, { weekday: 'short' })}</span>
            <span className={s.dayN}>{dayLabel(x, { day: 'numeric' })}</span>
          </button>
        ))}
      </div>
      {d.rooms.length === 0 ? (
        // Rooms start empty (the user, 2026-10-11): HR adds them on Admin › Meeting Rooms.
        <div className={s.noLetters}>No meeting rooms yet.</div>
      ) : roomView === 'timeline' ? (
        <>
          <div className={s.tl}>
            <div className={s.tlHead} style={{ gridTemplateColumns: cols }}>
              <span />
              {d.rooms.map(r => <span key={r.id} className={s.tlRoom}>{r.name.replace('Meeting Room', 'Room')}</span>)}
            </div>
            <div className={s.tlGrid} style={{ gridTemplateColumns: cols }}>
              <div className={s.tlHours}>
                {Array.from({ length: 12 }, (_, i) => <span key={i} className={s.tlHour}>{hm((8 + i) * 60)}</span>)}
              </div>
              {d.rooms.map(r => (
                <div
                  key={r.id}
                  className={s.tlCol}
                  onClick={bookAt ? e => {
                    const rc = e.currentTarget.getBoundingClientRect()
                    bookAt(r.id, slotAt(e.clientY - rc.top, rc.height))
                  } : undefined}
                >
                  {d.bookings.filter(b => b.roomId === r.id && b.date === day).map(b => {
                    const dur = b.to - b.from
                    return (
                      <div
                        key={b.id}
                        className={s.tlBlock}
                        style={{ top: ((b.from - 480) / 60) * 64 + 1, height: (dur / 60) * 64 - 2, background: b.guest ? 'rgb(255 244 231)' : 'rgb(230 237 241)', borderLeftColor: b.guest ? ORANGE : SLATE }}
                        onClick={ev => { ev.stopPropagation(); openBooking(b.id) }}
                      >
                        <div className={s.tlTitle} style={{ WebkitLineClamp: dur <= 30 ? 1 : dur <= 60 ? 3 : 5 }}>{b.title}</div>
                        <div className={s.tlTime}>{hm(b.from)}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          {bookAt ? <div className={s.tlHint}>Tap an empty slot to book it.</div> : null}
        </>
      ) : (
        d.rooms.map(r => {
          const its = d.bookings.filter(b => b.roomId === r.id && b.date === day).sort((a, b) => a.from - b.from)
          return (
            <section key={r.id} className={s.room}>
              <div className={s.roomHead}><span className={s.roomName}>{r.name}</span><span className={s.roomMeta}>{r.seats} seats</span></div>
              {its.map(b => (
                <button key={b.id} type="button" className={s.roomItem} onClick={() => openBooking(b.id)}>
                  <span className={s.roomTime}>{hm(b.from)}–{hm(b.to)}</span>
                  <span className={s.roomBlock} style={{ borderLeftColor: b.guest ? ORANGE : SLATE }}>
                    <span className={s.roomTitle}>{b.title}</span>
                    <span className={s.roomWho}>{(b.guest ? b.company ?? '' : b.byName) + ' · ' + pax(b) + ' pax'}</span>
                  </span>
                </button>
              ))}
              {its.length === 0 ? <div className={s.free}>Free all day</div> : null}
            </section>
          )
        })
      )}
    </>
  )
}

function InsightsScreen({ d }: { d: HrAppData }) {
  const days = daysToFill(d.hires).sort((a, b) => b.days - a.days)
  const maxD = Math.max(1, ...days.map(x => x.days))
  const cost = d.hires.filter(h => h.status === 'filled').reduce((sum, h) => sum + (Number(String(h.cost ?? '').replace(/[^\d.]/g, '')) || 0), 0)
  const cards: Array<[string, string, string]> = [
    ['Open requests', String(d.hires.filter(h => ['submitted', 'needs_info', 'acknowledged'].includes(h.status)).length), 'rgb(205 184 162)'],
    ['People hired', String(days.length), 'rgb(21 110 78)'],
    ['Avg days to fill', days.length ? String(Math.round(days.reduce((sum, x) => sum + x.days, 0) / days.length)) : '—', 'rgb(205 184 162)'],
    ['Hiring cost', cost ? `RM ${cost.toLocaleString('en-US')}` : '—', 'rgb(222 178 104)'],
  ]
  return (
    <>
      <div className={s.insGrid}>
        {cards.map(([l, v, bar]) => (
          <div key={l} className={s.insCard}>
            <span className={s.insBar} style={{ background: bar }} />
            <span className={s.insL}>{l}</span>
            <span className={s.insV}>{v}</span>
          </div>
        ))}
      </div>
      <section className={s.bars}>
        <div className={s.trailTitle}>Days to fill</div>
        {days.length === 0 ? <div className={s.noLetters}>No request filled yet.</div> : null}
        {days.map(x => (
          <div key={x.hire.id} className={s.barRow}>
            <div className={s.barTop}><span>{x.hire.position}</span><span className={s.mono}>{x.days} d</span></div>
            <span className={s.track}><span className={s.fill} style={{ width: `${(x.days / maxD) * 100}%` }} /></span>
          </div>
        ))}
      </section>
    </>
  )
}

// Declared here, not inside SheetView: a component made afresh on every render is a new
// component each time, and React would remount its input after every keystroke (2026-10-11).
// A group of controls (Attending, Total pax) is a div, not a label: a label clicks its first button when its
// text is pressed — pressing "Attending" removed the first person, "Total pax" took one off (the prototype's
// × and − are spans, so its labels never did).
function Field({ label, group = false, children }: { label: string; group?: boolean; children: ReactNode }) {
  const Box = group ? 'div' : 'label'
  return <Box className={s.field}><span className={s.fieldL}>{label}</span>{children}</Box>
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }> }) {
  return (
    <Field label={label}>
      <Select bare className={s.selectBox} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </Select>
    </Field>
  )
}

function SheetView(p: {
  d: HrAppData
  sheet: Sheet
  hr: HrHire | null
  day: string
  form: Form
  setForm: (f: Form) => void
  formErr: string
  setFormErr: (e: string) => void
  busy: boolean
  arm: boolean
  setArm: (a: boolean) => void
  close: () => void
  run: (fn: () => Promise<ActResult>, after?: () => void, inSheet?: boolean) => void
  actions: HrAppActions
  live: HrBooking[]
}) {
  const { d, sheet: sh, hr, day, form: F, setForm, formErr, setFormErr, busy, arm, setArm, close, run, actions, live } = p
  const set = (k: string) => (v: string) => { setForm({ ...F, [k]: v }); setFormErr('') }
  const str = (k: string) => (F[k] == null ? '' : String(F[k]))
  const outline = { borderColor: 'rgb(222 214 203)', background: 'rgb(255 255 255)', color: 'rgb(43 31 23)' }
  const go = { borderColor: ORANGE, background: ORANGE, color: 'rgb(43 31 23)' }
  const cancelBtn = <button type="button" className={s.formBtn} style={{ ...outline, flex: 1 }} onClick={close}>Cancel</button>

  let title = ''
  let body: ReactNode = null

  if (sh.k === 'stage' && hr) {
    title = `Status · ${sh.name}`
    body = (Object.keys(CAND_STAGE) as CandStage[]).map(v => {
      const cc = candChip(v)
      const on = v === sh.cur
      return (
        <button
          key={v}
          type="button"
          className={s.stageOpt}
          style={{ background: on ? 'rgb(255 244 231)' : 'rgb(246 242 236)' }}
          onClick={() => {
            if (v === sh.cur) return close()
            run(() => actions.candStage(hr.id, sh.cid, v), close)
          }}
        >
          <span className={s.stageDot} style={{ background: CHIP[cc.tone][1] }} />
          <span className={s.stageLabel} style={{ fontWeight: on ? 700 : 500 }}>{cc.label}</span>
          <span className={s.tick}>{on ? '✓' : ''}</span>
        </button>
      )
    })
  }

  // A select's value and its setter, by the form's key.
  const pick = (k: string) => ({ value: str(k), onChange: set(k) })

  if (sh.k === 'ack' && hr) {
    title = `Acknowledge ${hr.id}`
    body = (
      <>
        <SelectField {...pick('owner')} label="Owner" options={d.owners.map(o => ({ v: o.id, l: o.name }))} />
        {formErr ? <span className={s.formErr}>{formErr}</span> : null}
        <div className={s.btnRow}>
          {cancelBtn}
          <button type="button" className={s.formBtn} style={{ ...go, flex: 2 }} disabled={busy} onClick={() => {
            if (!str('owner')) return setFormErr('Pick the owner.')
            run(() => actions.hireAck(hr.id, str('owner')), close)
          }}>Acknowledge</button>
        </div>
      </>
    )
  }
  if (sh.k === 'info' && hr) {
    title = 'Ask for more, or decline'
    body = (
      <>
        <Field label="Note to requester">
          <textarea className={s.area} rows={3} placeholder="What do you need from them?" value={str('note')} onChange={e => set('note')(e.target.value)} />
        </Field>
        {formErr ? <span className={s.formErr}>{formErr}</span> : null}
        <div className={s.btnRow}>
          <button type="button" className={s.formBtn} style={{ ...outline, color: 'rgb(176 40 34)', borderColor: 'rgb(236 190 184)', flex: 1 }} disabled={busy} onClick={() => {
            if (!str('note')) return setFormErr('Give a reason.')
            run(() => actions.hireDecline(hr.id, str('note')), close)
          }}>Decline</button>
          <button type="button" className={s.formBtn} style={{ ...go, flex: 2 }} disabled={busy} onClick={() => {
            if (!str('note')) return setFormErr('Write what you need.')
            run(() => actions.hireInfo(hr.id, str('note')), close)
          }}>Request more info</button>
        </div>
      </>
    )
  }
  if (sh.k === 'fill' && hr) {
    title = 'Mark filled'
    body = (
      <>
        <SelectField {...pick('hired')} label="Hired" options={hr.candidates.filter(c => c.stage !== 'rejected').map(c => ({ v: c.name, l: c.name }))} />
        <SelectField {...pick('source')} label="Hired through" options={d.sources.map(x => ({ v: x, l: x }))} />
        <Field label="Hiring cost (RM)">
          <input className={s.input} placeholder="0" value={str('cost')} onChange={e => set('cost')(e.target.value)} />
        </Field>
        {formErr ? <span className={s.formErr}>{formErr}</span> : null}
        <div className={s.btnRow}>
          {cancelBtn}
          <button type="button" className={s.formBtn} style={{ ...go, flex: 2 }} disabled={busy} onClick={() => {
            if (!str('hired') || !str('source')) return setFormErr('Pick who was hired and where from.')
            run(() => actions.hireFill(hr.id, str('hired'), str('source'), str('cost').replace(/[^\d.]/g, '')), close)
          }}>Mark filled</button>
        </div>
      </>
    )
  }
  if (sh.k === 'cand' && hr) {
    title = 'New candidate'
    body = (
      <>
        <Field label="Name"><input className={s.input} value={str('name')} onChange={e => set('name')(e.target.value)} /></Field>
        <Field label="Phone"><input className={s.input} value={str('phone')} onChange={e => set('phone')(e.target.value)} /></Field>
        <Field label="Reference / note">
          <textarea className={s.area} rows={3} placeholder="e.g. Referred by Chea Huan" value={str('note')} onChange={e => set('note')(e.target.value)} />
        </Field>
        {formErr ? <span className={s.formErr}>{formErr}</span> : null}
        <div className={s.btnRow}>
          {cancelBtn}
          <button type="button" className={s.formBtn} style={{ ...go, flex: 2 }} disabled={busy} onClick={() => {
            if (!str('name')) return setFormErr('Add a name.')
            run(() => actions.candAdd(hr.id, { name: str('name'), phone: str('phone'), note: str('note') }), close)
          }}>Add</button>
        </div>
      </>
    )
  }
  if (sh.k === 'book') {
    title = 'Book a room'
    const att = (F.att as string[] | undefined) ?? (d.meId ? [d.meId] : [])
    const total = Math.max(att.length, Number(F.pax) || 1)
    const pq = str('pq').trim().toLowerCase()
    const times = bookingTimes()
    body = (
      <>
        <Field label="Meeting title"><input className={s.input} placeholder="e.g. Interview" value={str('title')} onChange={e => set('title')(e.target.value)} /></Field>
        <SelectField {...pick('dept')} label="Department" options={d.bookDepts.map(x => ({ v: x.id, l: x.name }))} />
        <SelectField {...pick('room')} label="Room" options={d.rooms.map(r => ({ v: r.id, l: `${r.name} · ${r.seats} seats` }))} />
        <SelectField {...pick('from')} label="From" options={times} />
        <SelectField {...pick('to')} label="To" options={times} />
        <Field label="Attending" group>
          <div className={s.people}>
            <div className={s.picked}>
              {att.map(id => (
                <span key={id} className={s.pickedChip}>
                  {d.staff.find(x => x.id === id)?.name ?? id}
                  <button type="button" className={s.pickedX} aria-label={`Remove ${d.staff.find(x => x.id === id)?.name ?? id}`} onClick={() => setForm({ ...F, att: att.filter(x => x !== id) })}>×</button>
                </span>
              ))}
            </div>
            <input className={s.peopleInput} placeholder="Add a colleague — type a name" aria-label="Add a colleague" value={str('pq')} onChange={e => setForm({ ...F, pq: e.target.value })} />
            {pq ? (
              <div className={s.picked}>
                {d.staff.filter(x => !att.includes(x.id) && x.name.toLowerCase().includes(pq)).slice(0, 6).map(x => (
                  <button key={x.id} type="button" className={s.sugg} onClick={() => setForm({ ...F, att: [...att, x.id], pq: '' })}>+ {x.name}</button>
                ))}
              </div>
            ) : null}
          </div>
        </Field>
        <Field label={`Total pax · ${att.length} named`} group>
          <span className={s.stepper}>
            <button type="button" className={s.stepBtn} aria-label="One fewer" onClick={() => setForm({ ...F, pax: Math.max(att.length, total - 1) })}>−</button>
            <span className={s.stepV}>{total}</span>
            <button type="button" className={s.stepBtn} aria-label="One more" onClick={() => setForm({ ...F, pax: total + 1 })}>+</button>
          </span>
        </Field>
        {formErr ? <span className={s.formErr}>{formErr}</span> : null}
        <div className={s.btnRow}>
          {cancelBtn}
          <button type="button" className={s.formBtn} style={{ ...go, flex: 2 }} disabled={busy} onClick={() => {
            const fr = Number(F.from), to = Number(F.to)
            if (!str('title') || !str('dept') || !str('room') || !fr || !to) return setFormErr('Fill in the title, department, room and time.')
            if (to <= fr) return setFormErr('End must be after start.')
            const clash = clashOf(live, str('room'), day, fr, to)
            if (clash) return setFormErr(`Taken ${hm(clash.from)}–${hm(clash.to)} · ${clash.title}`)
            run(() => actions.book({ title: str('title'), dept: str('dept'), roomId: str('room'), date: day, from: fr, to, attendees: att, pax: total }), close)
          }}>Book</button>
        </div>
      </>
    )
  }
  const bk = sh.k === 'booking' ? live.find(b => b.id === sh.id) ?? null : null
  if (sh.k === 'booking') {
    if (!bk) return null
    title = bk.title
    body = (
      <>
        <div className={s.bookWhen}>{dayLabel(bk.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {hm(bk.from)}–{hm(bk.to)}</div>
        <div className={s.bookFacts}>
          {([['Room', d.rooms.find(r => r.id === bk.roomId)?.name ?? ''], ['Booked by', bk.byName], ['From', bk.guest ? bk.company ?? '' : bk.dept], ['People', `${bk.pax} pax`]] as const).map(([l, v]) => (
            <div key={l} className={s.bookFact}><span className={s.factL}>{l}</span><span className={s.bookFactV}>{v}</span></div>
          ))}
        </div>
        {bk.mine ? (
          <button type="button" className={s.cancelBtn} style={{ background: arm ? 'rgb(250 228 224)' : 'rgb(255 255 255)' }} disabled={busy} onClick={() => {
            if (!arm) return setArm(true)
            run(() => actions.bookCancel(bk.id), () => { close(); setArm(false) })
          }}>
            {arm ? 'Tap again to cancel' : 'Cancel meeting'}
          </button>
        ) : (
          <div className={s.onlyBooker}>Only {bk.byName} can cancel this meeting.</div>
        )}
        {formErr ? <span className={s.formErr}>{formErr}</span> : null}
      </>
    )
  }

  return (
    <>
      <div className={s.scrim} onClick={close} aria-hidden="true" />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <span className={s.grab} aria-hidden="true" />
        <div className={s.sheetTitle}>{title}</div>
        {body}
      </div>
    </>
  )
}
