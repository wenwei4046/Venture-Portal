'use client'

import { useMemo, useState, useTransition, type CSSProperties } from 'react'
import { Button } from '@/components/ds/Button'
import { Banner, DataTable, type Column } from '@/components/ds/Data'
import { DsSelect, TextField } from '@/components/ds/Field'
import { SegmentedControl, Switch } from '@/components/ds/Controls'
import { saveSetting } from '@/lib/attendance/actions'
import { assignmentFor, policyOn } from '@/lib/attendance/engine'
import {
  CUTOVERS, MONTHS, csvLine, dayBar, dmy, entitlementLine, isWeekend, monthCells, nextFirsts, otRates, rm, scheduleSum, scheduleUsers, weeklyHours,
} from '@/lib/attendance/settings'
import type { AttAssignment, AttConfig, AttPolicy, AttRoute, ScheduleDay } from '@/lib/attendance/types'
import { HoverButton, HoverDiv } from './bits'
import type { Sm } from './SettingsWindows'

/**
 * The eight sub pages of Attendance › Settings, as the handoff draws them
 * (`HR Attendance.dc.html` 702-861), value for value, over the live config.
 */

export interface PanelProps {
  config: AttConfig
  open: (s: Sm) => void
  flash: (m: string) => void
  canEdit: boolean
}

const LBL: CSSProperties = { fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }
const HOVER_ACCENT: CSSProperties = { borderColor: 'var(--hr-accent, rgb(233 154 83))' }
const DASHED: CSSProperties = { padding: '1px 6px', border: '1.5px dashed var(--ds-border)', borderRadius: 12, background: 'transparent', minHeight: 120, fontFamily: 'inherit', fontSize: 13, color: 'var(--ds-ink-2)', cursor: 'pointer' }
const DASHED_HOVER: CSSProperties = { borderColor: 'var(--hr-accent, rgb(233 154 83))', color: 'rgb(var(--tone-clay-deep))' }

function AddTile({ label, onClick, canEdit }: { label: string; onClick: () => void; canEdit: boolean }) {
  if (!canEdit) return null
  return <HoverButton onClick={onClick} style={DASHED} hover={DASHED_HOVER}>{label}</HoverButton>
}

const OT_LABEL: Record<string, string> = { by_wage: 'by wage', statutory: 'statutory', none: 'none' }

export function assignmentFacts(a: AttAssignment, config: AttConfig) {
  const sch = a.scheduleId ? config.schedules.find(s => s.id === a.scheduleId)?.name ?? '—' : '—'
  const loc = a.anywhere ? 'Anywhere' : a.locationId ? config.locations.find(l => l.id === a.locationId)?.name ?? '—' : '—'
  return { sch: a.mode === 'off' ? '—' : sch, loc: a.mode === 'off' ? '—' : loc, ot: a.mode === 'off' ? '—' : a.ot ? OT_LABEL[a.ot] : '—' }
}

// ── 1. Who clocks ───────────────────────────────────────────────────────────

const MODE: Record<string, [string, string, string, string]> = {
  clock: ['Clocks', 'var(--ds-success-bg)', 'var(--ds-success)', 'var(--ds-success)'],
  no_clock: ['No clock-in', 'var(--ds-info-bg)', 'var(--ds-info)', 'var(--ds-info)'],
  off: ['Off', 'var(--ds-surface-3)', 'var(--ds-ink-2)', 'var(--ds-border)'],
}

export function ClockPanel({ config, open, canEdit }: PanelProps) {
  const tiers: Array<[string, string, string, AttAssignment['level'], string]> = [
    ['1', 'Company default', 'Everyone, unless a title or person says otherwise', 'company', '+ Company'],
    ['2', 'By title', 'Overrides the company', 'title', '+ Title'],
    ['3', 'By person', 'Overrides the title', 'person', '+ Person'],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {tiers.map(([n, title, note, level, add]) => (
        <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ds-ink)', color: 'rgb(255 255 255)', display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 600 }}>{n}</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
            <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>{note}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
            {config.assignments.filter(a => a.level === level).map(a => {
              const m = MODE[a.mode]
              const f = assignmentFacts(a, config)
              return (
                <HoverDiv
                  key={a.id}
                  onClick={() => open({ kind: 'assignment', id: a.id })}
                  style={{ cursor: 'pointer', border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, borderTop: `3px solid ${m[3]}` }}
                  hover={HOVER_ACCENT}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{a.label}</span>
                    <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: m[1], color: m[2] }}>{m[0]}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                    {([['Schedule', f.sch], ['Where', f.loc], ['OT', f.ot]] as const).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={LBL}>{k}</span>
                        <span style={{ fontSize: 12.5 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>From {dmy(a.from)}</div>
                </HoverDiv>
              )
            })}
            <AddTile label={add} canEdit={canEdit} onClick={() => open({ kind: 'assignment', id: null, seed: { level } })} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 2. Schedules ────────────────────────────────────────────────────────────

/** Warnings on a week: more than 45 normal hours, or a long day with no break (they never stop a save). */
export function scheduleWarnings(days: readonly ScheduleDay[]): string | null {
  const out: string[] = []
  const h = weeklyHours(days)
  if (h > 45) out.push(`${h} h a week`)
  for (const d of days) {
    const b = dayBar(d)
    if (b && !(d.break ?? 0) && d.start && d.end && (Number(d.end.slice(0, 2)) - Number(d.start.slice(0, 2))) >= 5) out.push(`a ${b.note.split(' ')[0]} h ${({ Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' } as Record<string, string>)[d.day] ?? d.day} with no break`)
  }
  return out.length ? out.join(' · ') : null
}

export function SchedulesPanel({ config, open, canEdit, picked, pick }: PanelProps & { picked: string | null; pick: (id: string) => void }) {
  const cur = config.schedules.find(s => s.id === picked) ?? config.schedules[0] ?? null
  const warn = cur ? scheduleWarnings(cur.days) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        {config.schedules.map(s => {
          const on = cur?.id === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              style={{ textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer', border: `1px solid ${on ? 'var(--hr-accent, rgb(233 154 83))' : 'var(--ds-border)'}`, boxShadow: on ? '0 0 0 1px var(--hr-accent, rgb(233 154 83))' : 'none', background: on ? 'rgb(255 248 240)' : 'var(--ds-surface)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 'normal' }}
            >
              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: 12, color: 'var(--ds-ink-2)' }}>{scheduleUsers(s, config, config.today)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ds-ink-3)' }}>{scheduleSum(s)}</span>
            </button>
          )
        })}
        <AddTile label="+ Schedule" canEdit={canEdit} onClick={() => open({ kind: 'schedule', id: null })} />
      </div>
      {cur ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500 }}>{cur.name} · week</span>
            {canEdit ? <Button variant="secondary" size="sm" onClick={() => open({ kind: 'schedule', id: cur.id })}>Edit schedule</Button> : null}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 8 }}>
            {cur.days.map((d, i) => {
              const b = dayBar(d)
              const work = d.type === 'work'
              return (
                <div key={i} style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--ds-surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{d.day}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: work ? 'rgb(225 240 230)' : 'var(--ds-surface-3)', color: work ? 'var(--ds-success)' : 'var(--ds-ink-2)' }}>{d.type}</span>
                  </div>
                  <div style={{ position: 'relative', height: 150, borderRadius: 6, background: 'var(--ds-surface-2)', overflow: 'hidden' }}>
                    {b ? (
                      <>
                        <span style={{ position: 'absolute', left: 0, right: 0, top: b.top, height: b.h, background: 'rgb(var(--tone-olive-deep))', borderRadius: 4 }} />
                        <span style={{ position: 'absolute', left: 0, right: 0, top: b.bTop, height: b.bH, background: 'repeating-linear-gradient(135deg,rgb(255 255 255 / .7) 0 3px,transparent 3px 6px)' }} />
                      </>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b ? b.range : '—'}</span>
                    <span style={{ fontSize: 11, color: 'var(--ds-ink-3)' }}>{b ? b.note : d.type === 'rest' ? 'Rest day · 2× OT' : 'Off day · 1.5× OT'}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {warn ? <Banner tone="warning" title={warn} /> : null}
        </>
      ) : null}
    </div>
  )
}

// ── 3. Locations ────────────────────────────────────────────────────────────

const MAP_BG = 'repeating-linear-gradient(135deg,var(--ds-surface-2) 0 8px,var(--ds-surface-3) 8px 9px)'

export function FenceRing({ radius }: { radius: number }) {
  const r = `${Math.min(130, Math.round(radius / 2.2))}px`
  return (
    <span style={{ width: r, height: r, borderRadius: '50%', border: '2px solid var(--hr-accent, rgb(233 154 83))', background: 'rgb(232 150 80 / .14)', display: 'grid', placeItems: 'center' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--hr-accent, rgb(233 154 83))', boxShadow: '0 0 0 3px rgb(255 255 255)' }} />
    </span>
  )
}

export function LocationsPanel({ config, open, canEdit }: PanelProps) {
  // People counted on the day the latest assignment starts (today if that is past), as the schedules count theirs.
  const on = config.assignments.reduce((d, a) => (a.from > d ? a.from : d), config.today)
  const where = config.people.map(p => assignmentFor(p, on, config.assignments)).filter(a => a && a.mode !== 'off')
  const peopleAt = (id: string) => where.filter(a => a!.locationId === id && !a!.anywhere).length
  const anywhere = config.assignments.filter(a => a.anywhere).length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
      {config.locations.map(l => {
        const n = peopleAt(l.id)
        return (
          <HoverDiv key={l.id} onClick={() => open({ kind: 'location', id: l.id })} style={{ cursor: 'pointer', border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} hover={HOVER_ACCENT}>
            <div style={{ position: 'relative', height: 130, background: MAP_BG, display: 'grid', placeItems: 'center' }}>
              <FenceRing radius={l.radius} />
              <span style={{ position: 'absolute', right: 8, bottom: 8, fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '2px 6px', borderRadius: 5, background: 'var(--ds-surface)', color: 'var(--ds-ink-2)' }}>r {l.radius} m</span>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{l.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ds-ink-2)' }}>{n} {n === 1 ? 'person' : 'people'}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--ds-ink-2)' }}>{l.address || '—'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ds-ink-3)' }}>{l.state || '—'}</span>
            </div>
          </HoverDiv>
        )
      })}
      <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--ds-surface-2)' }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Anywhere</span>
        <span style={{ fontSize: 12, color: 'var(--ds-ink-3)', marginTop: 'auto' }}>{anywhere} {anywhere === 1 ? 'assignment uses' : 'assignments use'} it</span>
      </div>
      <AddTile label="+ Location" canEdit={canEdit} onClick={() => open({ kind: 'location', id: null })} />
    </div>
  )
}

// ── 4. Holidays ─────────────────────────────────────────────────────────────

export const HOL_KIND: Record<string, [string, string]> = {
  compulsory: ['rgb(var(--tone-gold))', 'rgb(var(--tone-gold-deep))'],
  replacement: ['rgb(var(--tone-clay))', 'rgb(var(--tone-clay-deep))'],
  chosen: ['rgb(var(--tone-olive))', 'rgb(var(--tone-olive-deep))'],
}

export function HolidaysPanel({ config, open, canEdit, year }: PanelProps & { year: number }) {
  const [y, setY] = useState(year)
  const hs = config.holidays.filter(h => h.day.startsWith(String(y)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--ds-ink-2)' }}>
        {Object.entries(HOL_KIND).map(([k, [bg, bc]]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: bg, border: `1.5px solid ${bc}`, boxSizing: 'border-box' }} />
            {k[0].toUpperCase() + k.slice(1)}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <button type="button" aria-label="Previous year" onClick={() => setY(y - 1)} style={{ width: 30, height: 30, border: 0, background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ds-ink)', padding: '1px 6px', fontFamily: 'Arial, sans-serif' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{y}</span>
          <button type="button" aria-label="Next year" onClick={() => setY(y + 1)} style={{ width: 30, height: 30, border: 0, background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ds-ink)', padding: '1px 6px', fontFamily: 'Arial, sans-serif' }}>›</button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
        {MONTHS.map((name, mi) => {
          const items = hs.filter(h => Number(h.day.slice(5, 7)) === mi + 1).sort((a, b) => (a.day < b.day ? -1 : 1))
          return (
            <div key={name} style={{ border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>{items.length || ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 2 }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} style={{ textAlign: 'center', fontSize: 9.5, color: 'var(--ds-ink-3)' }}>{w}</span>)}
                {monthCells(y, mi + 1).map((d, i) => {
                  if (!d) return <span key={i} />
                  const h = items.find(x => x.day === d)
                  const k = h ? HOL_KIND[h.kind] : null
                  return (
                    <HoverButton
                      key={i}
                      title={h ? h.name : undefined}
                      onClick={() => (h ? open({ kind: 'holiday', id: h.id }) : canEdit ? open({ kind: 'holiday', id: null, seed: { day: d } }) : undefined)}
                      style={{ height: 22, padding: 0, border: 0, borderRadius: 5, background: k ? k[0] : 'transparent', color: k ? k[1] : isWeekend(d) ? 'var(--ds-ink-3)' : 'var(--ds-ink)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: h ? 700 : 400, cursor: 'pointer' }}
                      hover={{ boxShadow: 'inset 0 0 0 1.5px var(--hr-accent, rgb(233 154 83))' }}
                    >
                      {Number(d.slice(8, 10))}
                    </HoverButton>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {items.map(h => (
                  <button key={h.id} type="button" onClick={() => open({ kind: 'holiday', id: h.id })} style={{ display: 'flex', gap: 6, alignItems: 'center', border: 0, background: 'none', padding: '2px 0', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'var(--ds-ink)' }}>
                    <span style={{ width: 8, height: 8, flex: 'none', borderRadius: 2, background: HOL_KIND[h.kind][1] }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>{Number(h.day.slice(8, 10))}</span>
                    <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 5. Leave types ──────────────────────────────────────────────────────────

export const ROUTE_LABEL: Record<string, string> = { upline_only: 'Upline only', hr_only: 'HR only', upline_then_hr: 'Upline → HR' }
export const tagColours = (code: string, unpaid = false): [string, string] =>
  ['SL', 'HL'].includes(code) ? ['var(--ds-info-bg)', 'var(--ds-info)'] : unpaid || code === 'UL' ? ['var(--ds-surface-3)', 'var(--ds-ink-2)'] : ['rgb(var(--tone-slate))', 'rgb(var(--tone-slate-deep))']

export function LeavePanel({ config, open, canEdit }: PanelProps) {
  const titleName = (id: string) => config.titles.find(t => t.id === id)?.name ?? '—'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
      {config.leaveTypes.map(t => {
        const [bg, fg] = tagColours(t.code, t.unpaid)
        return (
          <div key={t.id} onClick={() => open({ kind: 'leave', id: t.id })} style={{ cursor: 'pointer', border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 7px', borderRadius: 5, background: bg, color: fg }}>{t.code}</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 500 }}>{entitlementLine(t, titleName)}</span>
            <span style={{ fontSize: 12, color: 'var(--ds-ink-2)', lineHeight: 1.45 }}>{t.rules}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--ds-border)' }}>
              <span style={LBL}>Route</span>
              <span style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 12 }}>{ROUTE_LABEL[t.route]}</span>
            </div>
          </div>
        )
      })}
      <AddTile label="+ Leave type" canEdit={canEdit} onClick={() => open({ kind: 'leave', id: null })} />
    </div>
  )
}

// ── 6. OT rules ─────────────────────────────────────────────────────────────

const OT_TOP: Record<string, string> = { work: 'rgb(var(--tone-olive-deep))', off: 'rgb(var(--tone-slate-deep))', rest: 'rgb(var(--tone-gold-deep))', ph: 'rgb(var(--tone-clay-deep))' }
export const OT_DAY: Record<string, string> = { work: 'Work day', off: 'Off day', rest: 'Rest day', ph: 'Public holiday' }

export function OtPanel({ config, open, canEdit }: PanelProps) {
  const [wage, setWage] = useState('3000')
  const [hrs, setHrs] = useState('8')
  const { orp, hrp } = otRates(Number(wage) || 0, Number(hrs) || 8)
  const rate = (k: string) => config.otRates.find(r => r.dayType === k) ?? { dayType: k, multiplier: ({ work: 1.5, off: 1.5, rest: 2, ph: 3 } as Record<string, number>)[k], minimum: ({ work: 1.5, off: 1.5, rest: 2, ph: 3 } as Record<string, number>)[k] }
  const cards: Array<[string, string, string]> = [
    ['work', 'Normal pay', 'No OT within the schedule'],
    ['off', `${rate('off').multiplier}× HRP`, `Every hour is OT · ${rm(rate('off').multiplier * hrp)} an hour`],
    ['rest', 'Half or full day ORP', `Up to half: ${rm(orp / 2)} · more: ${rm(orp)}`],
    ['ph', "2 days' ORP", `${rm(2 * orp)} on top of holiday pay`],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', background: 'var(--ds-surface-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={LBL}>Try a salary</span>
          <div style={{ width: 150 }}><TextField type="number" value={wage} onChange={setWage} prefix="RM" ariaLabel="Try a salary" /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={LBL}>Normal hours a day</span>
          <div style={{ width: 120 }}><DsSelect value={hrs} onChange={setHrs} options={['7', '7.5', '8', '9'].map(v => ({ value: v, label: v + ' h' }))} ariaLabel="Normal hours a day" /></div>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {([['ORP · a day', rm(orp), 'monthly ÷ 26'], ['HRP · an hour', rm(hrp), 'ORP ÷ normal hours']] as const).map(([k, v, n]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={LBL}>{k}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>{v}</span>
              <span style={{ fontSize: 11, color: 'var(--ds-ink-3)' }}>{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
        {cards.map(([k, w, wx]) => {
          const r = rate(k)
          const up = r.multiplier > r.minimum
          return (
            <HoverDiv
              key={k}
              onClick={canEdit ? () => open({ kind: 'ot', id: null, seed: { dayType: k } }) : undefined}
              style={{ cursor: canEdit ? 'pointer' : 'default', border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', borderTop: `3px solid ${OT_TOP[k]}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
              hover={canEdit ? HOVER_ACCENT : {}}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: 0, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{OT_DAY[k]}</span>
                <span style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 11, color: up ? 'var(--ds-success)' : 'var(--ds-ink-3)', fontWeight: 600 }}>{up ? 'Above minimum' : 'Act minimum'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 10, borderRadius: 8, background: 'var(--ds-surface-2)' }}>
                <span style={LBL}>Within normal hours</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{w}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ds-ink-2)' }}>{wx}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 10, borderRadius: 8, background: up ? 'rgb(225 240 230)' : 'rgb(255 245 233)' }}>
                <span style={LBL}>Beyond normal hours</span>
                <span style={{ fontSize: 22, fontWeight: 500, fontFamily: 'var(--font-mono)', color: up ? 'var(--ds-success)' : 'rgb(var(--tone-clay-deep))' }}>{r.multiplier}×</span>
                <span style={{ fontSize: 11.5, color: 'var(--ds-ink-2)' }}>{rm(r.multiplier * hrp)} an hour</span>
              </div>
            </HoverDiv>
          )
        })}
      </div>
    </div>
  )
}

// ── 7. Approval routes ──────────────────────────────────────────────────────

const ROUTE_OPTS = [{ value: 'upline_then_hr', label: 'Upline → HR' }, { value: 'hr_only', label: 'HR only' }, { value: 'upline_only', label: 'Upline only' }]

function RouteCell({ r, canEdit, flash }: { r: AttRoute; canEdit: boolean; flash: (m: string) => void }) {
  const [v, setV] = useState(r.route)
  const [, start] = useTransition()
  return (
    <div onClick={e => e.stopPropagation()}>
      <DsSelect
        value={v}
        disabled={!canEdit}
        options={ROUTE_OPTS}
        ariaLabel={`Route for ${r.label}`}
        onChange={next => {
          setV(next as AttRoute['route'])
          start(async () => {
            const res = await saveSetting('route', r.id, { scope: r.scope, kinds: r.kinds, label: r.label, titleId: r.titleId, route: next, why: r.why })
            if (res.ok) flash('Route saved · applies to new requests')
            else {
              setV(r.route)
              flash(res.reason)
            }
          })
        }}
      />
    </div>
  )
}

export function RoutesPanel({ config, open, canEdit, flash }: PanelProps) {
  type Row = { id: string; g: string; t: string; r: AttRoute; w: string }
  const rows: Row[] = config.routes.map(r => ({ id: r.id, g: r.scope === 'company' ? 'Company' : 'Title override', t: r.label, r, w: r.why }))
  const cols: Column<Row>[] = [
    { key: 't', label: 'Request', width: 'minmax(0,1.2fr)', render: x => <span style={{ fontWeight: 500 }}>{x.t}</span> },
    { key: 'r', label: 'Route', width: '200px', render: x => <RouteCell r={x.r} canEdit={canEdit} flash={flash} /> },
    { key: 'w', label: 'Why', width: 'minmax(0,1.6fr)' },
  ]
  return <DataTable columns={cols} rows={rows} groupBy="g" onRowClick={canEdit ? x => open({ kind: 'route', id: x.id }) : undefined} empty="No routes yet." />
}

// ── 8. Policy ───────────────────────────────────────────────────────────────

function PolicyRow({ label, children, first = false }: { label: string; children: React.ReactNode; first?: boolean }) {
  void first
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--ds-border)' }}>
      <div><div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div></div>
      <div>{children}</div>
    </div>
  )
}

function PolicyGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...LBL, paddingBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

const DEFAULT_POLICY: Omit<AttPolicy, 'id' | 'from'> = { fenceMode: 'flag', photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80, otFlagH: 104, otBase: 'basic', photoKeepDays: 90 }

export function PolicyPanel({ config, canEdit, flash }: PanelProps) {
  const cur = policyOn(config.today, config.policies)
  const [p, setP] = useState(() => ({ ...DEFAULT_POLICY, ...(cur ?? {}) }))
  const [busy, start] = useTransition()
  const from = useMemo(() => nextFirsts(config.today, 1)[0], [config.today])
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP(x => ({ ...x, [k]: v }))
  const int = (v: string) => Math.max(0, Math.round(Number(v) || 0))
  const save = () =>
    start(async () => {
      const res = await saveSetting('policy', null, {
        from, fenceMode: p.fenceMode, photoRequired: p.photoRequired, earliestInMin: p.earliestInMin, cutover: p.cutover, graceMin: p.graceMin,
        correctionsPerMonth: p.correctionsPerMonth, otWarnH: p.otWarnH, otFlagH: p.otFlagH, otBase: p.otBase, photoKeepDays: p.photoKeepDays,
      })
      flash(res.ok ? `Policy saved · applies from ${dmy(from)}` : res.reason)
    })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <PolicyGroup title="Punching">
        <PolicyRow label="Outside every fence">
          <SegmentedControl options={[{ value: 'flag', label: 'Flag' }, { value: 'refuse', label: 'Refuse' }]} value={p.fenceMode} onChange={v => set('fenceMode', v as 'flag' | 'refuse')} block />
        </PolicyRow>
        <PolicyRow label="Photo at every punch">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Switch checked={p.photoRequired} onChange={v => set('photoRequired', v)} ariaLabel="Photo at every punch" /></div>
        </PolicyRow>
        <PolicyRow label="Earliest IN">
          <TextField value={String(p.earliestInMin)} onChange={v => set('earliestInMin', int(v))} suffix="min before start" ariaLabel="Earliest IN" />
        </PolicyRow>
        <PolicyRow label="Day cutover">
          <DsSelect value={p.cutover} onChange={v => set('cutover', v)} options={CUTOVERS} ariaLabel="Day cutover" />
        </PolicyRow>
      </PolicyGroup>
      <PolicyGroup title="Lateness">
        <PolicyRow label="Grace">
          <TextField value={String(p.graceMin)} onChange={v => set('graceMin', int(v))} suffix="min" ariaLabel="Grace" />
        </PolicyRow>
        <PolicyRow label="Lateness and pay">
          <TextField value="Recorded only" disabled ariaLabel="Lateness and pay" />
        </PolicyRow>
      </PolicyGroup>
      <PolicyGroup title="Corrections">
        <PolicyRow label="Self-service corrections">
          <TextField value={String(p.correctionsPerMonth)} onChange={v => set('correctionsPerMonth', int(v))} suffix="a month" ariaLabel="Self-service corrections" />
        </PolicyRow>
      </PolicyGroup>
      <PolicyGroup title="Overtime">
        <PolicyRow label="Monthly limit">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <TextField value={String(p.otWarnH)} onChange={v => set('otWarnH', int(v))} prefix="Warn" suffix="h" ariaLabel="Warn at" />
            <TextField value={String(p.otFlagH)} onChange={v => set('otFlagH', int(v))} prefix="Flag" suffix="h" ariaLabel="Flag above" />
          </div>
        </PolicyRow>
        <PolicyRow label="OT base">
          <DsSelect value={p.otBase} onChange={v => set('otBase', v as 'basic' | 'fixed')} options={[{ value: 'basic', label: 'Basic only' }, { value: 'fixed', label: 'Basic + fixed allowances' }]} ariaLabel="OT base" />
        </PolicyRow>
      </PolicyGroup>
      <PolicyGroup title="Privacy">
        <PolicyRow label="Photos kept">
          <TextField value={String(p.photoKeepDays)} onChange={v => set('photoKeepDays', Math.max(1, int(v)))} suffix="days" ariaLabel="Photos kept" />
        </PolicyRow>
      </PolicyGroup>
      {canEdit ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--ds-surface-2)' }}>
          <Button size="sm" disabled={busy} onClick={save}>Save · from {dmy(from).replace(/ \d{4}$/, '')}</Button>
        </div>
      ) : null}
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────────────────────

export function exportRows(tab: string, config: AttConfig): { name: string; lines: string[] } {
  const t = (id: string | null) => config.titles.find(x => x.id === id)?.name ?? ''
  switch (tab) {
    case 'clock':
      return { name: 'who-clocks.csv', lines: [csvLine(['Level', 'Applies to', 'Mode', 'Schedule', 'Where', 'OT', 'From']), ...config.assignments.map(a => { const f = assignmentFacts(a, config); return csvLine([a.level, a.label, a.mode, f.sch, f.loc, f.ot, a.from]) })] }
    case 'sched':
      return { name: 'schedules.csv', lines: [csvLine(['Schedule', 'Day', 'Type', 'Start', 'End', 'Break']), ...config.schedules.flatMap(s => s.days.map(d => csvLine([s.name, d.day, d.type, d.start ?? '', d.end ?? '', d.break ?? ''])))] }
    case 'loc':
      return { name: 'locations.csv', lines: [csvLine(['Name', 'Address', 'State', 'Radius m', 'Lat', 'Lng']), ...config.locations.map(l => csvLine([l.name, l.address, l.state, l.radius, l.lat, l.lng]))] }
    case 'hol':
      return { name: 'holidays.csv', lines: [csvLine(['Date', 'Holiday', 'Kind', 'States']), ...config.holidays.map(h => csvLine([h.day, h.name, h.kind, h.states]))] }
    case 'leave':
      return { name: 'leave-types.csv', lines: [csvLine(['Code', 'Type', 'Entitlement', 'Rules', 'Route']), ...config.leaveTypes.map(l => csvLine([l.code, l.name, entitlementLine(l, t), l.rules, ROUTE_LABEL[l.route]]))] }
    case 'ot':
      return { name: 'ot-rules.csv', lines: [csvLine(['Day', 'Multiplier', 'Act minimum']), ...config.otRates.map(r => csvLine([OT_DAY[r.dayType], r.multiplier, r.minimum]))] }
    case 'route':
      return { name: 'approval-routes.csv', lines: [csvLine(['Scope', 'Request', 'Route', 'Why']), ...config.routes.map(r => csvLine([r.scope, r.label, ROUTE_LABEL[r.route], r.why]))] }
    default: {
      const p = policyOn(config.today, config.policies)
      return { name: 'clock-in-policy.csv', lines: [csvLine(['Setting', 'Value']), ...Object.entries(p ?? {}).filter(([k]) => k !== 'id').map(([k, v]) => csvLine([k, String(v)]))] }
    }
  }
}
