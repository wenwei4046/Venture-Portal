'use client'

import { useMemo, useState, useTransition, type CSSProperties } from 'react'
import { Button } from '@/components/ds/Button'
import { DsSelect, Field, TextField, Textarea } from '@/components/ds/Field'
import { SegmentedControl } from '@/components/ds/Controls'
import { CenterWindow } from '@/components/ds/Overlay'
import { deleteSetting, saveSetting, type SettingKind } from '@/lib/attendance/actions'
import {
  DAY_NAMES, HALF_HOURS, MONTHS, blankWeek, dmy, groupSummary, isWeekend, monthCells, multipliersFrom, nextFirsts, previewGroups, toggleAll, unitOf, weeklyHours,
} from '@/lib/attendance/settings'
import type { AttConfig, AttLeaveType, LeaveGroup, ScheduleDay } from '@/lib/attendance/types'
import { Avatar, HoverButton } from './bits'
import { FenceRing, OT_DAY } from './SettingsPanels'

/**
 * Settings' centred window (the handoff's `smOpen`, 541-681): one shell —
 * eyebrow + title + ×, the body, Delete · Cancel · Save/Add — and a body per
 * kind. The leave type's window has its Preview beside it.
 */

export type Sm = {
  kind: 'assignment' | 'schedule' | 'location' | 'holiday' | 'leave' | 'ot' | 'route'
  id: string | null
  seed?: { level?: 'company' | 'title' | 'person'; day?: string; dayType?: string }
}

const SECTION: Record<Sm['kind'], [string, string]> = {
  assignment: ['Who clocks', 'assignment'], schedule: ['Schedules', 'schedule'], location: ['Locations', 'location'], holiday: ['Holidays', 'holiday'],
  leave: ['Leave types', 'leave type'], ot: ['OT rules', 'rate'], route: ['Approval routes', 'override'],
}
const LBL: CSSProperties = { fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }
const two: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }
const STATES = ['Federal Territory', 'Selangor', 'Penang', 'Johor', 'Perak', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perlis', 'Terengganu', 'Sabah', 'Sarawak']

type Props = { sm: Sm; config: AttConfig; close: () => void; flash: (m: string) => void; canEdit: boolean; onSchedule: (id: string) => void }

export function SettingsWindow(props: Props) {
  const { sm } = props
  if (sm.kind === 'assignment') return <AssignmentWindow {...props} />
  if (sm.kind === 'schedule') return <ScheduleWindow {...props} />
  if (sm.kind === 'location') return <LocationWindow {...props} />
  if (sm.kind === 'holiday') return <HolidayWindow {...props} />
  if (sm.kind === 'leave') return <LeaveWindow {...props} />
  if (sm.kind === 'ot') return <OtWindow {...props} />
  return <RouteWindow {...props} />
}

/** The window shell, value for value. */
function Shell({
  props, title, body, beside, blocked, save, canDelete = false, kind,
}: {
  props: Props
  title: string
  body: React.ReactNode
  beside?: React.ReactNode
  blocked: boolean
  save: () => Promise<{ ok: true; data: { id?: string } | unknown } | { ok: false; reason: string }>
  canDelete?: boolean
  kind: SettingKind
}) {
  const { sm, close, flash, canEdit } = props
  const isNew = !sm.id
  const [busy, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>, done: string) =>
    start(async () => {
      const r = await fn()
      if (r.ok) {
        close()
        flash(done)
      } else flash(r.reason ?? 'Something went wrong.')
    })
  return (
    <CenterWindow open onClose={close} beside={beside ? <div className="sheet-theme" data-fin-kit="" style={{ display: 'contents' }}>{beside}</div> : undefined}>
      <div className="sheet-theme" data-fin-kit="" style={{ display: 'contents' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid var(--ds-border)' }}>
        <div>
          <div style={LBL}>Settings · {SECTION[sm.kind][0]}</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4 }}>{title || `New ${SECTION[sm.kind][1]}`}</div>
        </div>
        <button type="button" onClick={close} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 22, lineHeight: 1, color: 'var(--ds-ink-3)', cursor: 'pointer', padding: '1px 6px', fontFamily: 'Arial, sans-serif' }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>{body}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--ds-border)' }}>
        <div>
          {canDelete && canEdit && !isNew && kind !== 'ot' && kind !== 'policy' ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => deleteSetting(kind as Exclude<SettingKind, 'ot' | 'policy'>, sm.id!), `${title} deleted`)}>Delete</Button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
          {canEdit ? (
            <Button size="sm" disabled={blocked || busy} onClick={() => run(save as () => Promise<{ ok: boolean; reason?: string }>, kind === 'ot' ? `${title} OT saved · from next close` : `${title} saved · ${isNew ? 'added' : 'updated'} · audited`)}>
              {isNew && kind !== 'ot' ? 'Add' : 'Save'}
            </Button>
          ) : null}
        </div>
      </div>
      </div>
    </CenterWindow>
  )
}

// ── Who clocks ──────────────────────────────────────────────────────────────

function AssignmentWindow(props: Props) {
  const { sm, config } = props
  const cur = config.assignments.find(a => a.id === sm.id)
  const froms = nextFirsts(config.today, 3)
  const [f, setF] = useState(() => ({
    level: cur?.level ?? sm.seed?.level ?? 'title',
    label: cur?.label ?? 'HOUZS Venture',
    titleId: cur?.titleId ?? '',
    staffId: cur?.staffId ?? '',
    mode: cur?.mode ?? 'clock',
    scheduleId: cur?.scheduleId ?? config.schedules[0]?.id ?? '',
    where: cur ? (cur.anywhere ? 'anywhere' : cur.locationId ?? '') : config.locations[0]?.id ?? '',
    ot: cur?.ot ?? 'statutory',
    from: cur?.from ?? froms[0],
  }))
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
  const label = f.level === 'company' ? f.label.trim() : f.level === 'title' ? config.titles.find(t => t.id === f.titleId)?.name ?? '' : config.people.find(p => p.id === f.staffId)?.name ?? ''
  const off = f.mode === 'off'
  const fromOpts = [...new Set([f.from, ...froms])].map(d => ({ value: d, label: dmy(d) }))
  return (
    <Shell
      props={props}
      kind="assignment"
      title={cur?.label ?? ''}
      canDelete={cur?.level !== 'company'}
      blocked={!label}
      save={() => saveSetting('assignment', sm.id, {
        level: f.level, titleId: f.level === 'title' ? f.titleId : null, staffId: f.level === 'person' ? f.staffId : null, label, mode: f.mode,
        scheduleId: off || !f.scheduleId ? null : f.scheduleId, locationId: off || f.where === 'anywhere' || !f.where ? null : f.where,
        anywhere: !off && f.where === 'anywhere', ot: off ? null : f.ot || null, from: f.from,
      })}
      body={
        <>
          <Field label="Applies to">
            <SegmentedControl block value={f.level} onChange={v => set('level', v)} options={[{ value: 'company', label: 'Company default' }, { value: 'title', label: 'Title' }, { value: 'person', label: 'Person' }]} />
          </Field>
          <Field label={f.level === 'person' ? 'Person' : f.level === 'title' ? 'Title' : 'Company'}>
            {f.level === 'company' ? (
              <TextField value={f.label} onChange={v => set('label', v)} placeholder="e.g. HOUZS Venture" />
            ) : f.level === 'title' ? (
              <DsSelect value={f.titleId} onChange={v => set('titleId', v)} options={[{ value: '', label: 'Choose a title…' }, ...config.titles.map(t => ({ value: t.id, label: t.name }))]} ariaLabel="Title" />
            ) : (
              <DsSelect value={f.staffId} onChange={v => set('staffId', v)} options={[{ value: '', label: 'Choose a person…' }, ...config.people.map(p => ({ value: p.id, label: p.name }))]} ariaLabel="Person" />
            )}
          </Field>
          <Field label="Mode">
            <SegmentedControl block value={f.mode} onChange={v => set('mode', v)} options={[{ value: 'clock', label: 'Clocks' }, { value: 'no_clock', label: 'No clock-in' }, { value: 'off', label: 'Off' }]} />
          </Field>
          <div style={two}>
            <Field label="Schedule"><DsSelect value={off ? '' : f.scheduleId} disabled={off} onChange={v => set('scheduleId', v)} options={[{ value: '', label: '—' }, ...config.schedules.map(s => ({ value: s.id, label: s.name }))]} ariaLabel="Schedule" /></Field>
            <Field label="Where"><DsSelect value={off ? '' : f.where} disabled={off} onChange={v => set('where', v)} options={[{ value: '', label: '—' }, ...config.locations.map(l => ({ value: l.id, label: l.name })), { value: 'anywhere', label: 'Anywhere' }]} ariaLabel="Where" /></Field>
          </div>
          <div style={two}>
            <Field label="OT"><DsSelect value={off ? '' : f.ot} disabled={off} onChange={v => set('ot', v)} options={[{ value: '', label: '—' }, { value: 'by_wage', label: 'by wage' }, { value: 'statutory', label: 'statutory' }, { value: 'none', label: 'none' }]} ariaLabel="OT" /></Field>
            <Field label="From"><DsSelect value={f.from} onChange={v => set('from', v)} options={fromOpts} ariaLabel="From" /></Field>
          </div>
        </>
      }
    />
  )
}

// ── Schedules ───────────────────────────────────────────────────────────────

function ScheduleWindow(props: Props) {
  const { sm, config, onSchedule } = props
  const cur = config.schedules.find(s => s.id === sm.id)
  const [name, setName] = useState(cur?.name ?? '')
  const [days, setDays] = useState<ScheduleDay[]>(() => (cur?.days ?? blankWeek()).map(d => ({ ...d })))
  const inUse = !!cur && config.assignments.some(a => a.scheduleId === cur.id)
  const upd = (i: number, k: keyof ScheduleDay, v: string) =>
    setDays(ds => ds.map((d, j) => {
      if (j !== i) return d
      if (k === 'type') return v === 'work' ? { day: d.day, type: 'work', start: d.start ?? '09:00', end: d.end ?? '18:00', break: d.break ?? 60 } : { ...d, type: v as ScheduleDay['type'] }
      return { ...d, [k]: k === 'break' ? Number(v) : v }
    }))
  const grid = '44px 110px minmax(0,1fr) minmax(0,1fr) 96px'
  return (
    <Shell
      props={props}
      kind="schedule"
      title={cur?.name ?? ''}
      canDelete={!inUse}
      blocked={!name.trim()}
      save={async () => {
        const r = await saveSetting('schedule', sm.id, { name: name.trim(), days: days.map((d, i) => (d.type === 'work' ? { day: DAY_NAMES[i], type: 'work', start: d.start, end: d.end, break: d.break ?? 0 } : { day: DAY_NAMES[i], type: d.type })) })
        if (r.ok) onSchedule(r.data.id)
        return r
      }}
      body={
        <>
          <Field label="Name"><TextField value={name} onChange={setName} placeholder="e.g. Warehouse 8–5" /></Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, ...LBL }}><span>Day</span><span>Type</span><span>Start</span><span>End</span><span>Break</span></div>
            {days.map((d, i) => {
              const offDay = d.type !== 'work'
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{DAY_NAMES[i]}</span>
                  <DsSelect value={d.type} onChange={v => upd(i, 'type', v)} options={['work', 'off', 'rest']} ariaLabel={`${DAY_NAMES[i]} type`} />
                  <DsSelect value={d.start ?? '09:00'} disabled={offDay} onChange={v => upd(i, 'start', v)} options={HALF_HOURS} ariaLabel={`${DAY_NAMES[i]} start`} />
                  <DsSelect value={d.end ?? '18:00'} disabled={offDay} onChange={v => upd(i, 'end', v)} options={HALF_HOURS} ariaLabel={`${DAY_NAMES[i]} end`} />
                  <DsSelect value={String(d.break ?? 60)} disabled={offDay} onChange={v => upd(i, 'break', v)} options={[{ value: '0', label: 'none' }, { value: '30', label: '30 min' }, { value: '60', label: '60 min' }, { value: '90', label: '90 min' }]} ariaLabel={`${DAY_NAMES[i]} break`} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'var(--ds-surface-2)', fontSize: 12.5 }}>
            <span style={{ color: 'var(--ds-ink-2)' }}>Normal hours a week</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{weeklyHours(days)} h</span>
          </div>
        </>
      }
    />
  )
}

// ── Locations ───────────────────────────────────────────────────────────────

function LocationWindow(props: Props) {
  const { sm, config } = props
  const cur = config.locations.find(l => l.id === sm.id)
  const [f, setF] = useState({ name: cur?.name ?? '', address: cur?.address ?? '', state: cur?.state || 'Selangor', radius: String(cur?.radius ?? 150), lat: cur?.lat != null ? String(cur.lat) : '', lng: cur?.lng != null ? String(cur.lng) : '' })
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
  const inUse = !!cur && config.assignments.some(a => a.locationId === cur.id)
  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const badCoord = (f.lat.trim() !== '' && num(f.lat) === null) || (f.lng.trim() !== '' && num(f.lng) === null)
  return (
    <Shell
      props={props}
      kind="location"
      title={cur?.name ?? ''}
      canDelete={!inUse}
      blocked={!f.name.trim() || badCoord}
      save={() => saveSetting('location', sm.id, { name: f.name.trim(), address: f.address.trim(), state: f.state, radius: Number(f.radius), lat: num(f.lat), lng: num(f.lng) })}
      body={
        <>
          <div style={{ position: 'relative', height: 150, borderRadius: 10, background: 'repeating-linear-gradient(135deg,var(--ds-surface-2) 0 8px,var(--ds-surface-3) 8px 9px)', display: 'grid', placeItems: 'center', border: '1px solid var(--ds-border)' }}>
            <FenceRing radius={Number(f.radius)} />
            <span style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 11.5, color: 'var(--ds-ink-2)' }}>Map preview</span>
          </div>
          <Field label="Name"><TextField value={f.name} onChange={v => set('name', v)} placeholder="e.g. Penang branch" /></Field>
          <Field label="Address"><TextField value={f.address} onChange={v => set('address', v)} placeholder="Street, postcode, city" /></Field>
          <div style={two}>
            <Field label="State"><DsSelect value={f.state} onChange={v => set('state', v)} options={STATES} ariaLabel="State" /></Field>
            <Field label="Fence radius"><DsSelect value={f.radius} onChange={v => set('radius', v)} options={['100', '150', '200', '300', '500'].map(v => ({ value: v, label: `${v} m` }))} ariaLabel="Fence radius" /></Field>
          </div>
          <div style={two}>
            <Field label="Latitude"><TextField value={f.lat} onChange={v => set('lat', v)} placeholder="e.g. 3.0738" invalid={f.lat.trim() !== '' && num(f.lat) === null} /></Field>
            <Field label="Longitude"><TextField value={f.lng} onChange={v => set('lng', v)} placeholder="e.g. 101.6187" invalid={f.lng.trim() !== '' && num(f.lng) === null} /></Field>
          </div>
        </>
      }
    />
  )
}

// ── Holidays ────────────────────────────────────────────────────────────────

function HolidayWindow(props: Props) {
  const { sm, config } = props
  const cur = config.holidays.find(h => h.id === sm.id)
  const [f, setF] = useState({ name: cur?.name ?? '', day: cur?.day ?? sm.seed?.day ?? config.today, kind: cur?.kind ?? 'chosen', states: cur?.states ?? 'All' })
  const [pm, setPm] = useState(() => (f.day.slice(0, 7)))
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
  const y = Number(pm.slice(0, 4)), m = Number(pm.slice(5, 7))
  const others = config.holidays.filter(h => h.id !== sm.id)
  const step = (n: number) => {
    const k = y * 12 + (m - 1) + n
    setPm(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`)
  }
  return (
    <Shell
      props={props}
      kind="holiday"
      title={cur?.name ?? ''}
      canDelete
      blocked={!f.name.trim()}
      save={() => saveSetting('holiday', sm.id, { day: f.day, name: f.name.trim(), kind: f.kind, states: f.states })}
      body={
        <>
          <Field label="Holiday"><TextField value={f.name} onChange={v => set('name', v)} placeholder="e.g. Deepavali" /></Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LBL}>Date · {dmy(f.day)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button type="button" onClick={() => step(-1)} aria-label="Previous month" style={{ width: 30, height: 30, border: 0, background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ds-ink)', padding: '1px 6px', fontFamily: 'Arial, sans-serif' }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 72, textAlign: 'center' }}>{MONTHS[m - 1]} {y}</span>
                <button type="button" onClick={() => step(1)} aria-label="Next month" style={{ width: 30, height: 30, border: 0, background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ds-ink)', padding: '1px 6px', fontFamily: 'Arial, sans-serif' }}>›</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 3, padding: 10, border: '1px solid var(--ds-border)', borderRadius: 12 }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ds-ink-3)' }}>{w}</span>)}
              {monthCells(y, m).map((d, i) => {
                if (!d) return <span key={i} />
                const on = f.day === d
                const other = others.find(h => h.day === d)
                return (
                  <button key={i} type="button" title={other?.name} onClick={() => set('day', d)} style={{ height: 34, border: 0, borderRadius: 8, background: on ? 'var(--hr-accent, rgb(233 154 83))' : other ? 'var(--ds-surface-3)' : 'transparent', color: on ? '#fff' : isWeekend(d) ? 'var(--ds-ink-3)' : 'var(--ds-ink)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>
                    {Number(d.slice(8, 10))}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={two}>
            <Field label="Kind"><DsSelect value={f.kind} onChange={v => set('kind', v)} options={[{ value: 'compulsory', label: 'Compulsory' }, { value: 'chosen', label: 'Chosen' }, { value: 'replacement', label: 'Replacement' }]} ariaLabel="Kind" /></Field>
            <Field label="States"><DsSelect value={f.states} onChange={v => set('states', v)} options={['All', 'All except Sarawak', ...STATES]} ariaLabel="States" /></Field>
          </div>
        </>
      }
    />
  )
}

// ── Leave types ─────────────────────────────────────────────────────────────

/** What a code implies: AL accrues monthly, UL has no balance, EL comes out of AL, maternity / paternity count calendar days. */
export function derivedFlags(code: string, name: string, cur?: AttLeaveType) {
  if (cur && cur.code === code) return { accrues: cur.accrues, unpaid: cur.unpaid, drawsFrom: cur.drawsFrom, counts: cur.counts }
  return { accrues: code === 'AL', unpaid: code === 'UL', drawsFrom: code === 'EL' ? 'AL' : null, counts: /maternity|paternity/i.test(name) ? 'calendar' : 'working' }
}

const chip = (on: boolean): CSSProperties => ({ whiteSpace: 'nowrap', padding: '4px 10px', borderRadius: 999, border: `1px solid ${on ? 'var(--hr-accent, rgb(233 154 83))' : 'var(--ds-border)'}`, background: on ? 'rgb(255 240 228)' : 'var(--ds-surface)', color: on ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink-2)', fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 600 : 400, cursor: 'pointer' })

function LeaveWindow(props: Props) {
  const { sm, config } = props
  const cur = config.leaveTypes.find(t => t.id === sm.id)
  const [f, setF] = useState({ name: cur?.name ?? '', code: cur?.code ?? '', rules: cur?.rules ?? '', route: cur?.route ?? 'upline_only' })
  const [groups, setGroups] = useState<LeaveGroup[]>(() => (cur?.groups.length ? cur.groups : [{ titles: ['all'], levels: ['all'], base: 0, steps: [] }]).map(g => ({ ...g, titles: [...g.titles], levels: [...g.levels], steps: g.steps.map(s => ({ ...s })) })))
  const [dd, setDd] = useState<number | null>(null)
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
  const setG = (fn: (g: LeaveGroup[]) => void) => setGroups(gs => {
    const next = gs.map(g => ({ ...g, titles: [...g.titles], levels: [...g.levels], steps: g.steps.map(s => ({ ...s })) }))
    fn(next)
    return next
  })
  const titleName = (id: string) => config.titles.find(t => t.id === id)?.name ?? '—'
  const maxLevel = Math.max(9, ...config.levels.map(l => l.rank))
  const levels = Array.from({ length: maxLevel }, (_, i) => String(i + 1))
  const unit = unitOf(f.name)
  const pv = useMemo(() => previewGroups(groups, config.people, config.today), [groups, config.people, config.today])
  const code = f.code.trim().toUpperCase()
  const flags = derivedFlags(code, f.name, cur)
  const beside = (
    <>
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--ds-border)' }}>
        <div style={LBL}>Preview</div>
        <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{pv.count}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {pv.groups.map(pg => (
          <div key={pg.n} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Group {pg.n}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ds-ink-3)' }}>{pg.count}</span>
            </div>
            {pg.rows.map(r => (
              <div key={r.person.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--ds-border)' }}>
                <Avatar name={r.person.name} size={26} radius={6} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.person.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ds-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                </span>
                <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 14 }}>{r.days}</span>
              </div>
            ))}
            {pg.rows.length === 0 ? <span style={{ fontSize: 12, color: 'var(--ds-ink-3)', padding: '6px 0' }}>Nobody matches this group</span> : null}
          </div>
        ))}
        {pv.uncovered.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgb(var(--tone-clay-deep))' }}>Not covered · {pv.uncovered.length}</span>
            {pv.uncovered.map(r => (
              <div key={r.person.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--ds-border)', opacity: 0.75 }}>
                <Avatar name={r.person.name} size={26} radius={6} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.person.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ds-ink-3)' }}>{r.sub}</span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ds-ink-3)' }}>0</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
  return (
    <Shell
      props={props}
      kind="leave"
      title={cur?.name ?? ''}
      canDelete
      beside={beside}
      blocked={!f.name.trim() || !/^[A-Z]{2}$/.test(code)}
      save={() => saveSetting('leave', sm.id, { code, name: f.name.trim(), groups, rules: f.rules.trim(), route: f.route, counts: flags.counts, accrues: flags.accrues, unpaid: flags.unpaid, drawsFrom: flags.drawsFrom })}
      body={
        <>
          <div style={two}>
            <Field label="Name"><TextField value={f.name} onChange={v => set('name', v)} placeholder="e.g. Study leave" /></Field>
            <Field label="Code"><TextField value={f.code} onChange={v => set('code', v.toUpperCase().slice(0, 2))} placeholder="2 letters" /></Field>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={LBL}>Entitlement</span>
              <span style={{ fontSize: 11.5, color: 'var(--ds-ink-3)' }}>First matching group wins</span>
            </div>
            {groups.map((g, gi) => {
              const open = dd === gi
              const titleTxt = g.titles.includes('all') ? 'All titles' : g.titles.length <= 2 ? g.titles.map(titleName).join(', ') : `${g.titles.length} titles · ${g.titles.slice(0, 2).map(titleName).join(', ')}…`
              const sortedSteps = g.steps
              return (
                <div key={gi} style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--ds-surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>Group {gi + 1}</span>
                      <span style={{ fontSize: 12, color: 'var(--ds-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{groupSummary([g], false, titleName)}</span>
                    </div>
                    {groups.length > 1 ? <button type="button" onClick={() => setG(a => a.splice(gi, 1))} style={{ border: 0, background: 'none', fontFamily: 'inherit', fontSize: 12, color: 'var(--ds-ink-3)', cursor: 'pointer' }}>Remove</button> : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
                    <span style={LBL}>Titles</span>
                    <button type="button" onClick={() => setDd(open ? null : gi)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', border: `1px solid ${open ? 'var(--hr-accent, rgb(233 154 83))' : 'var(--ds-border)'}`, borderRadius: 8, background: 'var(--ds-surface)', fontFamily: 'inherit', fontSize: 13, color: 'var(--ds-ink)', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleTxt}</span>
                      <span style={{ flex: 'none', fontSize: 11, color: 'var(--ds-ink-3)' }}>▾</span>
                    </button>
                    {open ? (
                      <div style={{ position: 'absolute', left: 0, right: 0, top: 62, zIndex: 5, maxHeight: 240, overflow: 'auto', padding: 6, border: '1px solid var(--ds-border)', borderRadius: 10, background: 'var(--ds-surface)', boxShadow: '0 12px 30px rgb(51 36 27 / .16)', display: 'flex', flexDirection: 'column' }}>
                        {[{ id: 'all', name: 'All titles' }, ...config.titles].map(t => {
                          const on = g.titles.includes(t.id)
                          return (
                            <HoverButton key={t.id} onClick={() => setG(a => { a[gi].titles = t.id === 'all' ? ['all'] : toggleAll(a[gi].titles, t.id) })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', border: 0, borderRadius: 6, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--ds-ink)', cursor: 'pointer', textAlign: 'left' }}>
                              <span style={{ width: 16, height: 16, flex: 'none', boxSizing: 'border-box', borderRadius: 4, border: `1.5px solid ${on ? 'var(--hr-accent, rgb(233 154 83))' : 'var(--ds-border)'}`, background: on ? 'var(--hr-accent, rgb(233 154 83))' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>{on ? '✓' : ''}</span>
                              <span style={{ fontWeight: on ? 600 : 400 }}>{t.name}</span>
                            </HoverButton>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={LBL}>Levels</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setG(a => { a[gi].levels = ['all'] })} style={chip(g.levels.includes('all'))}>All levels</button>
                      {levels.map(l => (
                        <button key={l} type="button" title={config.levels.find(x => String(x.rank) === l)?.name} onClick={() => setG(a => { a[gi].levels = toggleAll(a[gi].levels, l) })} style={chip(g.levels.includes(l))}>L{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--ds-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 90px auto', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500 }}>From day one</span>
                      <TextField type="number" min="0" value={String(g.base)} onChange={v => setG(a => { a[gi].base = Math.max(0, Number(v) || 0) })} ariaLabel="From day one" />
                      <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{unit}</span>
                    </div>
                    {sortedSteps.map((st, si) => (
                      <div key={si} style={{ display: 'grid', gridTemplateColumns: '150px 90px auto 24px', gap: 8, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>After</span>
                          <div style={{ width: 64 }}><TextField type="number" min="1" value={String(st.yrs)} onChange={v => setG(a => { a[gi].steps[si].yrs = Math.max(1, Number(v) || 1) })} ariaLabel="Years" /></div>
                          <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>yrs</span>
                        </div>
                        <TextField type="number" min="0" value={String(st.days)} onChange={v => setG(a => { a[gi].steps[si].days = Math.max(0, Number(v) || 0) })} ariaLabel="Days" />
                        <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{unit}</span>
                        <button type="button" aria-label="Remove step" onClick={() => setG(a => a[gi].steps.splice(si, 1))} style={{ border: 0, background: 'none', fontSize: 16, color: 'var(--ds-ink-3)', cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setG(a => { const s0 = a[gi].steps, last = s0[s0.length - 1]; s0.push({ yrs: last ? last.yrs + 1 : 2, days: (last ? last.days : a[gi].base) + 2 }) })} style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: '2px 0', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: 'rgb(var(--tone-clay-deep))', cursor: 'pointer' }}>+ Service step</button>
                  </div>
                </div>
              )
            })}
            <HoverButton onClick={() => setG(a => a.push({ titles: config.titles[0] ? [config.titles[0].id] : ['all'], levels: ['all'], base: a[0] ? a[0].base : 0, steps: [] }))} style={{ border: '1.5px dashed var(--ds-border)', borderRadius: 12, background: 'none', padding: 12, fontFamily: 'inherit', fontSize: 13, color: 'var(--ds-ink-2)', cursor: 'pointer' }} hover={{ borderColor: 'var(--hr-accent, rgb(233 154 83))', color: 'rgb(var(--tone-clay-deep))' }}>
              + Group with different titles or levels
            </HoverButton>
          </div>
          <Field label="Rules"><Textarea value={f.rules} onChange={v => set('rules', v)} rows={2} placeholder="Notice, documents, carry-forward" /></Field>
          <Field label="Approval route"><DsSelect value={f.route} onChange={v => set('route', v)} options={[{ value: 'upline_only', label: 'Upline only' }, { value: 'hr_only', label: 'HR only' }, { value: 'upline_then_hr', label: 'Upline → HR' }]} ariaLabel="Approval route" /></Field>
        </>
      }
    />
  )
}

// ── OT rate ─────────────────────────────────────────────────────────────────

function OtWindow(props: Props) {
  const { sm, config } = props
  const k = sm.seed?.dayType ?? 'off'
  const r = config.otRates.find(x => x.dayType === k)
  const min = r?.minimum ?? 1.5
  const [mult, setMult] = useState(String(r?.multiplier ?? min))
  const opts = multipliersFrom(min)
  return (
    <Shell
      props={props}
      kind="ot"
      title={OT_DAY[k]}
      blocked={!opts.includes(mult)}
      save={() => saveSetting('ot', null, { dayType: k, multiplier: Number(mult) })}
      body={
        <Field label="Beyond normal hours · times HRP">
          <SegmentedControl block value={opts.includes(mult) ? mult : null} onChange={setMult} options={opts.map(v => ({ value: v, label: v + '×' }))} />
        </Field>
      }
    />
  )
}

// ── Approval route ──────────────────────────────────────────────────────────

const KINDS: Array<{ value: string; label: string }> = [{ value: 'OT', label: 'Overtime' }, { value: 'CR', label: 'Correction' }, { value: 'PF', label: 'Profile change' }, { value: '*', label: 'Everything' }]

function RouteWindow(props: Props) {
  const { sm, config } = props
  const cur = config.routes.find(r => r.id === sm.id)
  const [f, setF] = useState({ scope: cur?.scope ?? 'company', titleId: cur?.titleId ?? '', route: cur?.route ?? 'upline_then_hr', why: cur?.why ?? '' })
  const [kinds, setKinds] = useState<string[]>(cur?.kinds ?? [])
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }))
  const all = [...config.leaveTypes.map(t => ({ value: t.code, label: t.name })), ...KINDS]
  const name = (v: string) => all.find(x => x.value === v)?.label ?? v
  const title = config.titles.find(t => t.id === f.titleId)?.name
  const label = kinds.includes('*') ? `${title ?? 'Everyone'} · everything` : `${f.scope === 'title' && title ? `${title} · ` : ''}${kinds.map(name).join(' · ')}`
  return (
    <Shell
      props={props}
      kind="route"
      title={cur?.label ?? ''}
      canDelete
      blocked={!kinds.length || (f.scope === 'title' && !f.titleId)}
      save={() => saveSetting('route', sm.id, { scope: f.scope, kinds, label, titleId: f.scope === 'title' ? f.titleId : null, route: f.route, why: f.why.trim() })}
      body={
        <>
          <Field label="Applies to">
            <SegmentedControl block value={f.scope} onChange={v => set('scope', v)} options={[{ value: 'company', label: 'Company' }, { value: 'title', label: 'Title override' }]} />
          </Field>
          {f.scope === 'title' ? (
            <Field label="Title"><DsSelect value={f.titleId} onChange={v => set('titleId', v)} options={[{ value: '', label: 'Choose a title…' }, ...config.titles.map(t => ({ value: t.id, label: t.name }))]} ariaLabel="Title" /></Field>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={LBL}>Requests</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {all.map(k => (
                <button key={k.value} type="button" onClick={() => setKinds(ks => (k.value === '*' ? (ks.includes('*') ? [] : ['*']) : ks.includes(k.value) ? ks.filter(x => x !== k.value) : [...ks.filter(x => x !== '*'), k.value]))} style={chip(kinds.includes(k.value))}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div style={two}>
            <Field label="Route"><DsSelect value={f.route} onChange={v => set('route', v)} options={[{ value: 'upline_then_hr', label: 'Upline → HR' }, { value: 'hr_only', label: 'HR only' }, { value: 'upline_only', label: 'Upline only' }]} ariaLabel="Route" /></Field>
            <Field label="Why" optional><TextField value={f.why} onChange={v => set('why', v)} placeholder="e.g. Money" /></Field>
          </div>
        </>
      }
    />
  )
}
