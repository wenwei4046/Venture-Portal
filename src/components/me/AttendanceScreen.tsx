'use client'

import { useState, type CSSProperties } from 'react'
import { Button } from '@/components/ds/Button'
import { DescriptionList, StatusChip } from '@/components/ds/Data'
import { dayInfo, dayMon, indexMonth, monthDays, monthName } from '@/lib/attendance/engine'
import { ctxOf, monthView, needsOf, scheduleWords, type Need, type Wash } from '@/lib/me/month'
import type { MeData } from '@/lib/me/types'
import { Banner, Label, NUM, SHADOW, Title } from './kit'

/**
 * Me › Attendance (2026-10-17, the handoff's `isAtt`): the month's totals, the calendar washed whole-cell as HR's
 * Records grid is, the picked day, and what needs doing before HR closes the month (last month's too, while it is
 * still open).
 */

const WASH: Record<Wash, [string, string, string]> = {
  present: ['var(--ds-success-bg)', 'var(--ds-success)', 'rgb(31 122 75 / .22)'],
  late: ['var(--ds-warning-bg)', 'var(--ds-warning)', 'rgb(176 120 20 / .28)'],
  incomplete: ['var(--ds-danger-bg)', 'var(--ds-danger)', 'rgb(190 50 40 / .25)'],
  leave: ['var(--me-slate)', 'var(--me-slate-deep)', 'rgb(68 96 122 / .25)'],
}

const LEGEND: Array<[string, string, string]> = [
  ['Present', 'var(--ds-success-bg)', 'var(--ds-success)'],
  ['Late', 'var(--ds-warning-bg)', 'var(--ds-warning)'],
  ['Incomplete', 'var(--ds-danger-bg)', 'var(--ds-danger)'],
  ['Leave', 'var(--me-slate)', 'var(--me-slate-deep)'],
]

export function AttendanceScreen({ data, prev, onFix, onClaim }: {
  data: MeData
  prev: MeData | null
  onFix: (n: { day: string; dir: 'in' | 'out'; time: string }) => void
  onClaim: (n: { day: string; hours: number; out: string; past: string; end: string }) => void
}) {
  const v = monthView(data)
  const [pick, setPick] = useState<string | null>(null)
  if (!v) return <Title title="Attendance" sub="Your staff record is not linked to this login. Ask HR." />
  const day = pick && pick.slice(0, 7) === v.month.slice(0, 7) ? pick : v.defaultDay
  const card = v.card(day)
  const words = scheduleWords(data)
  const close = v.closed ? `HR closed ${monthName(v.month)} on ${dayMon(v.closeDay)}` : `HR closes ${monthName(v.month)} on ${dayMon(v.closeDay)}`
  // Last month, while it is still open: its own missing punches and unclaimed time.
  const prevNeeds = prev?.me ? needsOf(prev, monthDays(prev.month.month).map(dd => dayInfo(prev.me!, dd, ctxOf(prev), indexMonth(prev.month))), monthDays(prev.month.month)) : []
  const needs: Need[] = [...prevNeeds, ...v.needs]
  const action = (n: Need) => (
    <Button variant="secondary" size="sm" onClick={() => (n.action.label === 'Fix' ? onFix(n.action) : onClaim(n.action))}>{n.action.label}</Button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title title="Attendance" sub={[words, close].filter(Boolean).join(' · ')} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label>{v.label} · history</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', boxShadow: SHADOW }}>
          {v.totals.map((x, i) => (
            <div key={x.label} style={{ padding: 10, borderLeft: i ? '1px solid var(--ds-border)' : 0 }}>
              <div style={{ fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>{x.label}</div>
              <div style={{ ...NUM, fontSize: 17, marginTop: 5 }}>{x.value}</div>
              <div style={{ fontSize: 11, color: 'var(--ds-ink-2)', marginTop: 2 }}>{x.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', textAlign: 'center' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }}>
          {Array.from({ length: v.lead }, (_, i) => <span key={`b${i}`} style={{ height: 46, visibility: 'hidden' }} />)}
          {v.cells.map(c => {
            const w = c.wash ? WASH[c.wash] : null
            const sel = c.day === day
            const cell: CSSProperties = {
              height: 46, borderRadius: 8, boxSizing: 'border-box', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...NUM, fontWeight: w ? 600 : 500, fontSize: 13,
              border: sel ? '2px solid var(--ds-ink)' : c.today ? '1.5px solid var(--ds-ink)' : w ? `1px solid ${w[2]}` : '1px solid var(--ds-border)',
              background: w ? w[0] : c.off ? 'var(--ds-surface-2)' : 'var(--ds-surface)',
              color: w ? w[1] : c.muted ? 'var(--ds-ink-3)' : 'var(--ds-ink)',
            }
            return <button key={c.day} type="button" onClick={() => setPick(c.day)} aria-pressed={sel} aria-label={c.day} style={cell}><span>{c.n}</span></button>
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 11.5, color: 'var(--ds-ink-2)', paddingTop: 4 }}>
          {LEGEND.map(([l, bg, bc]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${bc}`, boxSizing: 'border-box' }} />{l}
            </span>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--ds-surface)', boxShadow: SHADOW }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 15 }}>{card.title}</span>
          <StatusChip tone={card.tone}>{card.status}</StatusChip>
        </div>
        <DescriptionList items={card.facts} layout="stacked" columns={3} />
        {card.fix ? <Button variant="secondary" block onClick={() => onFix({ day: card.day, dir: card.fix!.dir, time: card.fix!.time })}>File a correction</Button> : null}
      </div>

      {needs.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label>Needs action</Label>
          {needs.map(n => <Banner key={n.key} tone={n.tone} title={n.title} action={action(n)}>{n.body}</Banner>)}
        </div>
      ) : null}
    </div>
  )
}
