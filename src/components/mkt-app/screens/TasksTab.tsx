'use client'

import { useState } from 'react'
import type { PlateColumn, WeekRow } from '@/lib/marketing/my-space'
import { cardsOf, segsOf, type SegKey } from '@/lib/mkt-app/model'
import { Pill, Seg } from '../kit'
import s from '../mkt-app.module.css'

// Tasks (the handoff's first tab — work only): the head with the punch chip and the bell, My turn · Waiting · Delegated
// with their counts, the cards (red first — My Space's plate, lib/marketing/my-space.ts), then This week.

export interface TasksTabProps {
  columns: PlateColumn[]
  week: WeekRow[]
  /** Me's Today in a word (`🕘 Punch in`, `🟢 In · 09:41`); none without a People record. */
  punch: string | null
  unread: number
  onPunch: () => void
  onNotices: () => void
  onOpen: (trackId: string) => void
  onCalendar: (() => void) | null
}

export default function TasksTab(p: TasksTabProps) {
  const [seg, setSeg] = useState<SegKey>('turn')
  const segs = segsOf(p.columns)
  const cards = cardsOf(p.columns, seg)
  return (
    <div className={s.tabPage}>
      <div className={s.tasksHead}>
        <div className={s.headRow}>
          <h1 className={s.h1}>Tasks</h1>
          {p.punch ? <button type="button" className={s.punchChip} onClick={p.onPunch}>{p.punch}</button> : null}
          <button type="button" className={s.bellBtn} onClick={p.onNotices} aria-label={p.unread ? `Notifications, ${p.unread} new` : 'Notifications'}>
            🔔
            {p.unread ? <span className={s.bellBadge}>{p.unread > 99 ? '99+' : p.unread}</span> : null}
          </button>
        </div>
        <Seg label="Tasks" value={seg} onPick={setSeg} items={segs.map(g => ({ key: g.key, label: g.label, count: g.count, hot: g.hot }))} />
      </div>
      <div className={s.scroll}>
        <div className={s.list}>
          {cards.map(c => (
            <button key={c.key} type="button" className={s.card} data-red={c.red ? 'true' : 'false'} onClick={() => p.onOpen(c.trackId)}>
              <span className={s.cardTitle}>{c.title}</span>
              <span className={s.cardMeta}>
                {c.dot ? <span className={s.dot7} style={{ background: c.dot }} /> : null}
                <span className={s.ellipsis}>{c.meta}</span>
              </span>
              <span className={s.cardFoot}>
                <Pill tone={c.tone} text={c.label} />
                <span className={s.grow} />
                <span className={s.cardAct} data-review={c.act === 'Review' ? 'true' : 'false'}>{c.act}</span>
              </span>
            </button>
          ))}
          {cards.length ? null : <div className={s.empty}>Nothing here right now</div>}
          <div className={s.week}>
            <div className={s.weekHead}>
              <span className={s.weekTitle}>🗓️ This week</span>
              {p.onCalendar ? <button type="button" className={s.linkBtn} onClick={p.onCalendar}>Calendar ›</button> : null}
            </div>
            {p.week.map(w => (
              <button key={w.key} type="button" className={s.weekRow} onClick={() => p.onOpen(w.trackId)}>
                <span className={s.weekWhen} data-red={w.red ? 'true' : 'false'}>{w.when}</span>
                <span className={s.ellipsis}>{w.title}</span>
              </button>
            ))}
            {p.week.length ? null : <div className={s.weekNone}>No due dates this week</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
