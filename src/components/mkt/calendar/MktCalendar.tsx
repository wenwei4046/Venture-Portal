'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addDays, longDay, type MktSub } from '@/lib/marketing/board'
import {
  ALL_LAYERS, LAYERS, LEGEND, addMonths, eventRows, listDays, monthCells, monthLabel, monthOf, passes, weekCells, weekLabel,
  type CalEvent, type CalKind, type CalTone, type CalView,
} from '@/lib/marketing/calendar'
import { linkPlace } from '@/lib/marketing/posts'
import u from '../ui/page.module.css'
import s from './calendar.module.css'

// The Calendar (`Calendar.dc.html`): Month / Week / List with ‹ › and Today; the layers on and off; the subsidiaries
// picked; "Only mine" (or one person, from the top bar's search); a 320px panel for the item or day picked, with Open
// task. Months outside what the page read are read again (`?d=`).

const TONE: Record<CalTone, { box: string; fg: string; dot: string }> = {
  red: { box: s.tRed, fg: s.fgRed, dot: u.dotRed },
  waiting: { box: s.tWaiting, fg: s.fgWaiting, dot: u.dotWaiting },
  done: { box: s.tDone, fg: s.fgDone, dot: u.dotDone },
  draft: { box: s.tDraft, fg: s.fgDraft, dot: u.dotDraft },
  meet: { box: s.tMeet, fg: s.fgMeet, dot: u.dotMeet },
}
const PILL: Record<CalTone, string> = { red: u.red, waiting: u.waiting, done: u.done, draft: u.draft, meet: u.meet }

type Sel = { type: 'event'; id: string } | { type: 'day'; day: string } | null

export interface MktCalendarProps {
  events: CalEvent[]
  subs: MktSub[]
  today: string
  /** The viewer's People id ("Only mine"), when their login has one. */
  me: string | null
  /** One person's dates, from the search: their id and first name. */
  who: { id: string; name: string } | null
  people: Record<string, string>
  view: CalView
  day: string
  window: { from: string; to: string }
}

export default function MktCalendar(p: MktCalendarProps) {
  const router = useRouter()
  const [view, setView] = useState<CalView>(p.view)
  const [cursor, setCursor] = useState(p.day)
  const [layers, setLayers] = useState<Record<CalKind, boolean>>(ALL_LAYERS)
  const [subs, setSubs] = useState<string[]>([])
  const [who, setWho] = useState<string | null>(p.who?.id ?? null)
  const [sel, setSel] = useState<Sel>(null)

  // A month the page did not read: read again around it.
  useEffect(() => {
    if (cursor < p.window.from || cursor > p.window.to) router.push(`/marketing/calendar?d=${cursor}&view=${view}`, { scroll: false })
  }, [cursor, view, p.window.from, p.window.to, router])

  const filter = { layers, subs, who }
  const shown = useMemo(() => p.events.filter(e => passes(e, { layers, subs, who })), [p.events, layers, subs, who])
  const month = monthOf(cursor)
  const inMonth = (e: CalEvent) => e.day.slice(0, 7) === month.slice(0, 7) && passes(e, { ...filter, layers: ALL_LAYERS })
  const selEvent = sel?.type === 'event' ? p.events.find(e => e.id === sel.id) ?? null : null
  const selDay = sel?.type === 'day' ? sel.day : null
  const pickEvent = (e: CalEvent) => (ev: React.MouseEvent) => {
    ev.stopPropagation()
    setSel({ type: 'event', id: e.id })
  }
  const step = (dir: number) => setCursor(c => (view === 'week' ? addDays(c, dir * 7) : addMonths(monthOf(c), dir)))
  const mine = !!p.me && who === p.me
  const nameOf = (id: string) => p.people[id] ?? '—'

  return (
    <div className={u.page}>
      <div className={u.head}>
        <div className={u.headLeft}>
          <span className={u.title}>{view === 'week' ? weekLabel(cursor) : monthLabel(month)}</span>
          <div className={u.navs}>
            <button type="button" className={u.navBtn} onClick={() => step(-1)} aria-label="Previous">‹</button>
            <button type="button" className={u.navBtn} onClick={() => step(1)} aria-label="Next">›</button>
          </div>
          <button type="button" className={u.todayBtn} onClick={() => setCursor(p.today)}>Today</button>
        </div>
        <div className={u.grow} />
        {p.me ? (
          <button type="button" className={u.switch} onClick={() => setWho(mine ? null : p.me)} aria-pressed={mine}>
            <span className={`${u.track}${mine ? ` ${u.trackOn}` : ''}`}><span className={u.knob} /></span>
            <span>Only mine</span>
          </button>
        ) : null}
        <div className={u.seg} role="radiogroup" aria-label="View">
          {([['month', '▦ Month'], ['week', '▥ Week'], ['list', '☰ List']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={view === k} className={`${u.segBtn}${view === k ? ` ${u.segOn}` : ''}`} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={u.bar}>
        {LAYERS.map(l => (
          <button
            key={l.key}
            type="button"
            className={`${u.layer}${layers[l.key] ? ` ${u.layerOn}` : ''}`}
            onClick={() => setLayers(x => ({ ...x, [l.key]: !x[l.key] }))}
            aria-pressed={layers[l.key]}
          >
            <span className={u.layerIcon} aria-hidden="true">{l.icon}</span>
            <span className={u.layerLabel}>{l.label}</span>
            <span className={u.layerCount}>{p.events.filter(e => e.kind === l.key && inMonth(e)).length}</span>
          </button>
        ))}
        <span className={u.rule} aria-hidden="true" />
        <button type="button" className={`${u.chip}${!subs.length ? ` ${u.chipOn}` : ''}`} onClick={() => setSubs([])}>
          All subsidiaries
        </button>
        {p.subs.map(x => {
          const on = subs.includes(x.id)
          return (
            <button key={x.id} type="button" className={`${u.chip}${on ? ` ${u.chipOn}` : ''}`} onClick={() => setSubs(l => (on ? l.filter(i => i !== x.id) : [...l, x.id]))} aria-pressed={on}>
              <span className={u.chipDot} style={{ background: x.dot }} aria-hidden="true" />
              <span>{x.name}</span>
            </button>
          )
        })}
        {who && !mine ? (
          <button type="button" className={`${u.chip} ${u.chipOn}`} onClick={() => setWho(null)} aria-label="Show everybody">
            <span>Only {p.who?.id === who ? p.who.name : nameOf(who)}</span>
            <span className={u.chipX} aria-hidden="true">✕</span>
          </button>
        ) : null}
      </div>
      <div className={u.legend}>
        {LEGEND.map(l => (
          <span key={l.tone} className={u.legendItem}>
            <span className={`${u.dot} ${TONE[l.tone].dot}`} aria-hidden="true" />
            {l.label}
          </span>
        ))}
      </div>

      <div className={s.body}>
        <div className={s.main}>
          {view === 'month' ? <Month cursor={month} events={shown} today={p.today} sel={sel} onDay={d => setSel({ type: 'day', day: d })} onEvent={pickEvent} /> : null}
          {view === 'week' ? <Week cursor={cursor} events={shown} today={p.today} sel={sel} onDay={d => setSel({ type: 'day', day: d })} onEvent={pickEvent} /> : null}
          {view === 'list' ? <List cursor={month} events={shown} today={p.today} sel={sel} onEvent={pickEvent} /> : null}
        </div>
        {selEvent ? (
          <aside className={s.panel} aria-label="Details">
            <div className={s.panelHead}>
              <span className={s.kicker}>Details</span>
              <button type="button" className={s.close} onClick={() => setSel(null)} aria-label="Close">✕</button>
            </div>
            <div className={s.pbody}>
              <div>
                <div className={s.pkind}>
                  <span className={s.pkindIcon} aria-hidden="true">{selEvent.icon}</span>
                  <span className={s.pkindLabel}>{selEvent.kindLabel}</span>
                </div>
                <div className={s.ptitle}>{selEvent.title}</div>
                {selEvent.trackId ? <div className={s.ptid}>{selEvent.trackId}</div> : null}
              </div>
              <div style={{ display: 'flex' }}>
                <span className={`${u.pill} ${PILL[selEvent.tone]}`}>
                  <span className={`${u.pillDot} ${TONE[selEvent.tone].dot}`} aria-hidden="true" />
                  {selEvent.label}
                </span>
              </div>
              <div className={s.prows}>
                {eventRows(selEvent, nameOf).map(r => (
                  <div key={r.k} className={s.prow}>
                    <span className={s.prowK}>{r.k}</span>
                    {/* A post's link once posted (⑧-1) opens the post. */}
                    <span className={s.prowV}>{r.k === 'Posted' ? <a href={r.v} target="_blank" rel="noopener noreferrer">{linkPlace(r.v)} ↗</a> : r.v}</span>
                  </div>
                ))}
              </div>
              {selEvent.trackId ? (
                <Link href={`/marketing/projects/${encodeURIComponent(selEvent.trackId)}`} className={s.popen}>Open task</Link>
              ) : null}
            </div>
          </aside>
        ) : selDay ? (
          <aside className={s.panel} aria-label="Day">
            <div className={s.panelHead}>
              <span className={s.kicker}>Day</span>
              <button type="button" className={s.close} onClick={() => setSel(null)} aria-label="Close">✕</button>
            </div>
            <div className={s.dayTitle}>{longDay(selDay)}</div>
            {(() => {
              const evs = shown.filter(e => e.day === selDay)
              return evs.length ? (
                <div className={s.dayEvs}>
                  {evs.map(e => (
                    <button key={e.id} type="button" className={`${s.dayEv} ${TONE[e.tone].box}${e.kind === 'due' ? ` ${s.evDue}` : ''}`} onClick={pickEvent(e)}>
                      <span className={s.licon} aria-hidden="true">{e.icon}</span>
                      <span className={s.dayEvText}>
                        <span className={s.dayEvTitle} style={{ display: 'block' }}>{e.title}</span>
                        <span className={s.dayEvLine}>
                          <span className={s.subSq} style={{ background: e.sub?.dot }} aria-hidden="true" />
                          <span className={s.ellipsis}>{e.sub?.name ?? '—'} · {e.label}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={s.dayNone}>Nothing scheduled.</div>
              )
            })()}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

type Pick = (e: CalEvent) => (ev: React.MouseEvent) => void

function Item({ e, sel, onEvent }: { e: CalEvent; sel: Sel; onEvent: Pick }) {
  const t = TONE[e.tone]
  return (
    <button
      type="button"
      title={e.title}
      onClick={onEvent(e)}
      className={`${s.ev} ${t.box}${e.kind === 'due' ? ` ${s.evDue}` : ''}${sel?.type === 'event' && sel.id === e.id ? ` ${s.evPicked}` : ''}`}
    >
      <span className={s.evTop}>
        <span className={`${s.evDot} ${t.dot}`} aria-hidden="true" />
        <span className={s.evTitle}>{e.title}</span>
      </span>
      <span className={s.evLine}>
        <span className={s.subSq} style={{ background: e.sub?.dot }} aria-hidden="true" />
        <span aria-hidden="true">{e.icon}</span>
        <span className={s.evLineText}>{e.line2}</span>
      </span>
    </button>
  )
}

function Month({ cursor, events, today, sel, onDay, onEvent }: { cursor: string; events: CalEvent[]; today: string; sel: Sel; onDay: (d: string) => void; onEvent: Pick }) {
  const cells = monthCells(cursor, events, today)
  const lastRow = cells.length - 7
  return (
    <div className={s.month}>
      <div className={s.wdRow}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <div key={w} className={s.wd}>{w}</div>)}
      </div>
      <div className={s.grid}>
        {cells.map((c, i) => (
          <div
            key={c.day}
            role="button"
            tabIndex={0}
            onClick={() => onDay(c.day)}
            onKeyDown={ev => (ev.key === 'Enter' ? onDay(c.day) : undefined)}
            className={`${s.cell}${c.out ? ` ${s.cellOut}` : ''}${sel?.type === 'day' && sel.day === c.day ? ` ${s.cellPicked}` : ''}${i >= lastRow ? ` ${s.lastRow}` : ''}`}
          >
            <div className={s.numRow}>
              <span className={`${s.num}${c.today ? ` ${s.numToday}` : c.out ? ` ${s.numOut}` : ''}`}>{c.n}</span>
            </div>
            {c.events.slice(0, 3).map(e => <Item key={e.id} e={e} sel={sel} onEvent={onEvent} />)}
            {c.events.length > 3 ? <span className={s.more}>+{c.events.length - 3} more</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Week({ cursor, events, today, sel, onDay, onEvent }: { cursor: string; events: CalEvent[]; today: string; sel: Sel; onDay: (d: string) => void; onEvent: Pick }) {
  return (
    <div className={s.week}>
      {weekCells(cursor, events, today).map((c, i) => (
        <div key={c.day} className={`${s.wcol}${c.today ? ` ${s.wcolToday}` : ''}`}>
          <button type="button" className={s.whead} onClick={() => onDay(c.day)}>
            <span className={s.whWd}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
            <span className={`${s.whNum}${c.today ? ` ${s.numToday}` : ''}`}>{c.n}</span>
          </button>
          <div className={s.wevs}>
            {c.events.map(e => {
              const t = TONE[e.tone]
              return (
                <button key={e.id} type="button" onClick={onEvent(e)} className={`${s.wev} ${t.box}${e.kind === 'due' ? ` ${s.evDue}` : ''}${sel?.type === 'event' && sel.id === e.id ? ` ${s.evPicked}` : ''}`}>
                  {e.time ? <span className={s.wevTime}>{e.time}</span> : null}
                  <span className={s.wevTitle}>{e.title}</span>
                  <span className={s.wevSub}>
                    <span className={s.subSq} style={{ background: e.sub?.dot }} aria-hidden="true" />
                    <span className={s.ellipsis}>{e.sub?.name ?? '—'}</span>
                  </span>
                  <span className={`${s.wevStatus} ${t.fg}`}>
                    <span className={`${s.evDot} ${t.dot}`} aria-hidden="true" />
                    <span className={s.ellipsis}>{e.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function List({ cursor, events, today, sel, onEvent }: { cursor: string; events: CalEvent[]; today: string; sel: Sel; onEvent: Pick }) {
  const days = listDays(cursor, events, today)
  return (
    <div className={s.list}>
      {!days.length ? <div className={s.listEmpty}>Nothing scheduled this month.</div> : null}
      {days.map(d => (
        <div key={d.day} className={s.lday}>
          <div className={`${s.ldayHead}${d.today ? ` ${s.ldayHeadToday}` : ''}`}>
            <span className={s.ldWd}>{d.wd}</span>
            <span className={s.ldN}>{d.label}</span>
          </div>
          <div className={s.lrows}>
            {d.events.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={onEvent(e)}
                className={`${s.lrow}${e.tone === 'red' ? ` ${s.lrowRed}` : sel?.type === 'event' && sel.id === e.id ? ` ${s.lrowPicked}` : ''}`}
              >
                <span className={s.licon} aria-hidden="true">{e.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span className={u.cellTitle} style={{ display: 'block' }}>{e.title}</span>
                  <span className={u.mono} style={{ display: 'block' }}>{[e.trackId, e.line2].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={u.cellSub}>
                  <span className={u.dot} style={{ background: e.sub?.dot }} aria-hidden="true" />
                  {e.sub?.name ?? '—'}
                </span>
                <span className={u.cell}>{e.who}</span>
                <span style={{ display: 'flex', minWidth: 0 }}>
                  <span className={`${u.pill} ${PILL[e.tone]}`}>
                    <span className={`${u.pillDot} ${TONE[e.tone].dot}`} aria-hidden="true" />
                    {e.label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
