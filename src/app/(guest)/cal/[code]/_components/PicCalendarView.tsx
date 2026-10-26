'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { WEEKDAYS } from '@/lib/marketing/board'
import { monthLabel, monthOf } from '@/lib/marketing/calendar'
import {
  calendarItems, calendarMonths, campaignsRunning, legendOf, listDays, monthWeeks, picCalBanner,
  type PicBar, type PicCalendar, type PicCalItem, type PicCalTone,
} from '@/lib/marketing/pic-calendar'
import s from './cal.module.css'

// The PIC's own calendar (⑤-2, `PIC Calendar.dc.html`): a subsidiary's marketing calendar shared with one of its PICs —
// what waits for their approval, then what is coming up (List — the phone's) or the month (Month — the desktop's) with
// the campaigns running across it and HR's holidays as ⚑ key dates. Read-only; each item opens its project's tracking
// page, the PIC's own link.

type View = 'auto' | 'list' | 'month'
const TONE: Record<PicCalTone | 'key', string> = { plain: s.plain, live: s.live, approve: s.approve, key: s.key }
const DESKTOP = '(min-width: 900px)'

function Card({ it }: { it: PicCalItem }) {
  const approve = it.kind === 'approve'
  const body = (
    <>
      <span className={`${s.icon} ${TONE[it.tone]}`} aria-hidden="true">{it.glyph}</span>
      <span className={s.cardText}>
        <span className={`${s.kind}${approve ? ` ${s.kindApprove}` : ''}`}>{it.label}</span>
        <span className={s.cardTitle}>{it.title}</span>
        {it.note ? <span className={s.note}>{it.note}</span> : null}
      </span>
      {it.href ? <span className={s.chev} aria-hidden="true">›</span> : null}
    </>
  )
  return (
    <div className={`${s.card}${approve ? ` ${s.cardApprove}` : ''}${it.urgent ? ` ${s.cardUrgent}` : ''}`}>
      {it.href ? <a className={s.cardMain} href={it.href}>{body}</a> : <div className={s.cardMain}>{body}</div>}
      {it.postLink ? <a className={s.postLink} href={it.postLink} target="_blank" rel="noreferrer">View post ↗</a> : null}
    </div>
  )
}

function Chip({ it }: { it: PicCalItem }) {
  const words = it.kind === 'approve' ? `Approve: ${it.title}` : it.title
  const inner = (
    <>
      <span className={s.chipGlyph} aria-hidden="true">{it.glyph}</span>
      <span className={s.chipText}>{words}</span>
    </>
  )
  const cls = `${s.chip} ${TONE[it.tone]}`
  return it.href
    ? <a className={cls} href={it.href} title={`${it.label} · ${it.title}`}>{inner}</a>
    : <span className={cls} title={`${it.label} · ${it.title}`}>{inner}</span>
}

function Bar({ b }: { b: PicBar }) {
  const cls = `${s.bar} ${b.tone ? s.toneB : s.toneA}${b.start ? ` ${s.barStart}` : ''}${b.end ? ` ${s.barEnd}` : ''}`
  const style = { left: `calc(${b.left}% + 4px)`, width: `calc(${b.width}% - 8px)`, top: 30 + b.row * 23 }
  return b.href
    ? <a className={cls} style={style} href={b.href} title={b.label}>{b.label}</a>
    : <span className={cls} style={style} title={b.label}>{b.label}</span>
}

export default function PicCalendarView({ cal }: { cal: PicCalendar | null }) {
  // The phone opens on the list, the desktop on the month (the handoff's): the stylesheet draws the right one before the
  // page is in the browser — then it is the one picked.
  const [view, setView] = useState<View>('auto')
  const [keyOn, setKeyOn] = useState(true)
  const months = useMemo(() => (cal ? calendarMonths(cal) : []), [cal])
  const [month, setMonth] = useState(() => (cal ? monthOf(cal.today) : ''))
  // Whether the minutes have waited 4 working hours, only once in the browser: the server's clock and the browser's differ.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    setView(v => (v === 'auto' ? (typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches ? 'month' : 'list') : v))
  }, [])
  const items = useMemo(() => (cal ? calendarItems(cal, now) : []), [cal, now])

  const top = (
    <header className={s.top}>
      <div className={s.topIn}>
        <span className={s.logo} aria-hidden="true">H</span>
        <span className={s.brand}>HOUZS Marketing</span>
        <span className={s.grow} />
        <span className={s.topNote}>Marketing calendar</span>
      </div>
    </header>
  )
  if (!cal) {
    return (
      <div className={`mkt-pic ${s.root}`}>
        {top}
        <main className={s.main}>
          <div className={s.closed}><div className={s.closedTitle}>This link is closed</div></div>
        </main>
      </div>
    )
  }

  const days = listDays(cal, items, keyOn)
  const weeks = monthWeeks(cal, items, month, keyOn)
  const running = campaignsRunning(cal)
  const banner = picCalBanner(cal, items)
  const legend = legendOf(items)
  const at = months.indexOf(month)
  const bannerBody: ReactNode = banner ? (
    <>
      <span className={s.bannerDot} aria-hidden="true" />
      <span className={s.bannerText}>
        <span className={s.bannerTitle}>{banner.title}</span>
        <span className={s.bannerLine}>{banner.text}</span>
      </span>
      {banner.href ? <span className={s.review}>Review →</span> : null}
    </>
  ) : null

  return (
    <div className={`mkt-pic ${s.root}`} data-view={view}>
      {top}
      <main className={s.main}>
        <div className={s.nameRow}>
          <span className={s.subDot} style={{ background: cal.sub.dot }} aria-hidden="true" />
          <h1 className={s.title}>{cal.sub.name}</h1>
        </div>
        <div className={s.shared}>Shared with {cal.pic} · read-only</div>

        {banner ? (
          <div className={s.bannerWrap} role="status">
            {banner.href
              ? <a className={`${s.banner}${banner.tone === 'red' ? ` ${s.bannerRed}` : ''}`} href={banner.href}>{bannerBody}</a>
              : <div className={`${s.banner}${banner.tone === 'red' ? ` ${s.bannerRed}` : ''}`}>{bannerBody}</div>}
          </div>
        ) : null}

        <div className={s.toolbar}>
          <span className={`${s.toolTitle} ${s.listOnly}`}>Coming up</span>
          <span className={`${s.toolTitle} ${s.monthOnly}`}>{monthLabel(month)}</span>
          <span className={`${s.navs} ${s.monthOnly}`}>
            <button type="button" className={s.nav} aria-label="Previous month" disabled={at <= 0} onClick={() => setMonth(months[Math.max(0, at - 1)])}>‹</button>
            <button type="button" className={s.nav} aria-label="Next month" disabled={at < 0 || at >= months.length - 1}
              onClick={() => setMonth(months[Math.min(months.length - 1, at + 1)])}>›</button>
          </span>
          <span className={s.grow} />
          <button type="button" className={s.keyBtn} aria-pressed={keyOn} onClick={() => setKeyOn(k => !k)}>
            <span className={s.track} aria-hidden="true"><span className={s.knob} /></span>Key dates
          </button>
          <div className={s.segs} role="group" aria-label="View">
            <button type="button" className={`${s.seg} ${s.segList}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
            <button type="button" className={`${s.seg} ${s.segMonth}`} aria-pressed={view === 'month'} onClick={() => setView('month')}>Month</button>
          </div>
        </div>

        <section className={`${s.list} ${s.listOnly}`} aria-label="Coming up">
          {running.length ? (
            <section className={s.camps} aria-label="Campaigns running">
              <div className={s.campsHead}>Campaigns running</div>
              {running.map(c => {
                const inner = (
                  <>
                    <span className={`${s.campBar} ${c.tone ? s.toneB : s.toneA}`} aria-hidden="true" />
                    <span className={s.campText}>
                      <span className={s.campName}>{c.title}</span>
                      <span className={s.campRange}>{c.range}</span>
                    </span>
                    <span className={s.progress} aria-hidden="true">
                      <span className={`${s.progressFill} ${c.tone ? s.toneB : s.toneA}`} style={{ width: `${c.pct}%` }} />
                    </span>
                  </>
                )
                return c.href ? <a key={c.key} className={s.camp} href={c.href}>{inner}</a> : <div key={c.key} className={s.camp}>{inner}</div>
              })}
            </section>
          ) : null}
          {days.length ? days.map(d => (
            <div key={d.day} className={s.day}>
              <div className={`${s.dayHead}${d.today ? ` ${s.dayToday}` : ''}`}>
                <div className={s.wd}>{d.wd}</div>
                <div className={s.dn}>{d.n}</div>
                <div className={s.mon}>{d.mon}</div>
              </div>
              <div className={s.dayItems}>
                {d.flags.map(f => <span key={f.name} className={s.flag}>⚑ {f.name}</span>)}
                {d.items.map(it => <Card key={it.key} it={it} />)}
              </div>
            </div>
          )) : <div className={s.empty}>Nothing coming up</div>}
        </section>

        <section className={`${s.month} ${s.monthOnly}`} aria-label={monthLabel(month)}>
          <div className={s.wdRow}>{WEEKDAYS.map(w => <div key={w} className={s.wdCell}>{w}</div>)}</div>
          {weeks.map(wk => (
            <div key={wk.days[0].day} className={s.week}>
              <div className={s.weekDays}>
                {wk.days.map(d => (
                  <div key={d.day} className={`${s.cell}${d.out ? ` ${s.cellOut}` : ''}`} style={{ minHeight: 100 + wk.bars.length * 23 }}>
                    <div className={s.cellHead}>
                      {d.flags.map(f => <span key={f.name} className={s.flagSm} title={f.name}>⚑ {f.short}</span>)}
                      <span className={s.grow} />
                      <span className={`${s.dayNum}${d.today ? ` ${s.dayNumToday}` : ''}`}>{d.n}</span>
                    </div>
                    <div className={s.barSpace} style={{ height: wk.bars.length * 23 }} />
                    {d.items.map(it => <Chip key={it.key} it={it} />)}
                  </div>
                ))}
              </div>
              {wk.bars.map(b => <Bar key={b.key} b={b} />)}
            </div>
          ))}
        </section>

        <div className={s.legend}>
          {legend.map(l => (
            <span key={l.kind} className={s.legendItem}>
              <span className={`${s.swatch} ${TONE[l.tone]}`} aria-hidden="true">{l.glyph}</span>{l.label}
            </span>
          ))}
        </div>
      </main>
    </div>
  )
}
