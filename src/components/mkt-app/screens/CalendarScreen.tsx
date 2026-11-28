'use client'

import { useState } from 'react'
import { ALL_LAYERS, type CalEvent, type CalKind } from '@/lib/marketing/calendar'
import { agendaOf, CAL_LAYERS, layerCounts, monthTitle, toneOf, weekStrip } from '@/lib/mkt-app/model'
import { shortDay } from '@/lib/marketing/board'
import { Shell } from './TaskScreen'
import s from '../mkt-app.module.css'

// The Calendar, pushed from More or This week (`Marketing App iOS + Android.dc.html` › Calendar): this week's strip with
// up to three dots a day (a day tapped filters the agenda to it), the layers with their counts and the Mine switch, then
// the agenda by day — the desktop Calendar's events (lib/marketing/calendar.ts). A row with a task opens it.

export interface CalendarScreenProps {
  today: string
  events: CalEvent[]
  me: string | null
  onOpen: (trackId: string) => void
  onBack: () => void
  say: (text: string) => void
}

export default function CalendarScreen(p: CalendarScreenProps) {
  const [layers, setLayers] = useState<Record<CalKind, boolean>>(ALL_LAYERS)
  const [mine, setMine] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const counts = layerCounts(p.events, { mine }, p.me)
  const strip = weekStrip(p.today, p.events, { layers, mine }, p.me)
  const agenda = agendaOf(p.today, p.events, { layers, mine, day }, p.me)
  const chips = CAL_LAYERS.filter(l => l.key !== 'ads' || counts.ads > 0)
  return (
    <Shell title={monthTitle(p.today)} sub={day ? shortDay(day) : undefined} onBack={p.onBack}>
      <div className={s.calHead}>
        <div className={s.weekStrip}>
          {strip.map(d => (
            <button key={d.day} type="button" className={s.wday} data-picked={day === d.day ? 'true' : 'false'} onClick={() => setDay(day === d.day ? null : d.day)}>
              <span className={s.wdName}>{d.wd}</span>
              <span className={s.wdNum} data-today={d.today ? 'true' : 'false'}>{d.n}</span>
              <span className={s.wdDots}>{d.dots.map((t, i) => <span key={i} className={s.wdDot} data-tone={t} />)}</span>
            </button>
          ))}
        </div>
        <div className={s.layers}>
          {chips.map(l => (
            <button key={l.key} type="button" className={`${s.chip} ${s.chip36}`} data-on={layers[l.key] ? 'true' : 'false'}
              aria-pressed={layers[l.key]} onClick={() => setLayers(x => ({ ...x, [l.key]: !x[l.key] }))}>
              {l.label} <b>{counts[l.key]}</b>
            </button>
          ))}
          {p.me ? (
            <button type="button" className={s.mine} aria-pressed={mine} onClick={() => setMine(m => !m)}>
              <span className={s.switch} data-on={mine ? 'true' : 'false'}><span className={s.switchKnob} /></span>Mine
            </button>
          ) : null}
        </div>
      </div>
      <div className={s.scroll} style={{ background: 'rgb(var(--mk-app))' }}>
        <div className={s.agenda}>
          {agenda.map(g => (
            <div key={g.day} className={s.day}>
              <div className={s.dayHead} data-today={g.today ? 'true' : 'false'} data-red={g.overdue ? 'true' : 'false'}>
                <span className={s.dayLabel}>{g.label}</span>
                <span className={s.dayWd}>{g.overdue ? `${g.wd} · overdue` : g.wd}</span>
              </div>
              {g.events.map(e => (
                <button key={e.id} type="button" className={s.event} data-tone={toneOf(e.tone)} data-due={e.kind === 'due' ? 'true' : 'false'}
                  onClick={() => (e.trackId ? p.onOpen(e.trackId) : p.say(`${e.title} · ${e.line2}`))}>
                  <span className={s.evIcon}>{e.icon}</span>
                  <span className={s.grow}>
                    <span className={s.evTitle} style={{ display: 'block' }}>{e.title}</span>
                    <span className={s.evLine}>
                      {e.sub ? <span className={s.evDot} style={{ background: e.sub.dot }} /> : null}
                      <span className={s.ellipsis}>{[e.sub?.name, e.time, e.line2].filter(Boolean).join(' · ')}</span>
                    </span>
                  </span>
                  <span className={s.evLabel}>{e.label}</span>
                </button>
              ))}
            </div>
          ))}
          {agenda.length ? null : <div className={s.emptyTall}>Nothing scheduled.</div>}
        </div>
      </div>
    </Shell>
  )
}
