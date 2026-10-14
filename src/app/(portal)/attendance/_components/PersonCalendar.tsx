'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ds/Button'
import { DescriptionList, StatusChip } from '@/components/ds/Data'
import { DsSelect, Field, TextField, Textarea } from '@/components/ds/Field'
import { Sheet } from '@/components/ds/Overlay'
import { setDays } from '@/lib/attendance/actions'
import {
  balanceOf,
  dayInfo,
  daysInMonth,
  indexMonth,
  isoOf,
  longDay,
  monAbbr,
  monthLabel,
  tally,
  weekday,
  type Ctx,
} from '@/lib/attendance/engine'
import type { AttLedger, AttPerson } from '@/lib/attendance/types'
import { HATCH, SET_CODES, downloadCsv, lookOf, toneOf } from './codes'

/**
 * A person's month (the handoff's `dIsCal`): the four totals, the month as
 * fixed 56×54 day cells — click one, drag across several, right-click (or
 * double-click) to edit — the picked day's IN / OUT / Worked / Place and its
 * two punch tiles, and HR's correction (status, leave type with what is left,
 * punch times, a required reason). Today and Records open it.
 */
export default function PersonCalendar({
  ctx,
  ledger,
  person,
  startDay,
  onClose,
  flash,
}: {
  ctx: Ctx
  ledger: AttLedger | null
  person: AttPerson | null
  startDay: number
  onClose: () => void
  flash: (m: string) => void
}) {
  const open = !!person
  const [kept, setKept] = useState<AttPerson | null>(person)
  useEffect(() => {
    if (person) setKept(person)
  }, [person])
  const p = person ?? kept
  const month = ctx.month.month
  const [y, m] = month.split('-').map(Number)
  const len = daysInMonth(month)
  const [calDay, setCalDay] = useState(startDay)
  const [sel, setSel] = useState<[number, number]>([startDay, startDay])
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [ed, setEd] = useState({ code: 'P', leave: '', in: '09:00', out: '18:00', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (person) {
      setCalDay(startDay)
      setSel([startDay, startDay])
      setEditing(false)
      setError(null)
    }
  }, [person, startDay])
  useEffect(() => {
    const up = () => setDragging(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const idx = useMemo(() => indexMonth(ctx.month), [ctx.month])
  const days = useMemo(() => (p ? Array.from({ length: len }, (_, i) => dayInfo(p, isoOf(y, m, i + 1), ctx, idx)) : []), [p, len, y, m, ctx, idx])
  const leaveCodes = useMemo(() => new Set(ctx.config.leaveTypes.map(t => t.code)), [ctx.config.leaveTypes])
  const t = tally(days.map(d => d.code), leaveCodes)
  const lo = Math.min(...sel)
  const hi = Math.max(...sel)
  const multi = hi > lo
  const mm = monAbbr(month)
  const lead = (weekday(isoOf(y, m, 1)) + 6) % 7

  const balances = useMemo(() => {
    if (!p || !ledger) return new Map<string, number | null>()
    return new Map(ctx.config.leaveTypes.map(lt => [lt.code, balanceOf(p, lt, ctx.config, ledger, ctx.today).left]))
  }, [p, ledger, ctx.config, ctx.today])

  if (!p) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const openEditor = (a: number, b: number) => {
    const info = days[a - 1]
    const isLv = leaveCodes.has(info?.code ?? '')
    setCalDay(a)
    setSel([a, b])
    setDragging(false)
    setEditing(true)
    setError(null)
    setEd({
      code: isLv ? 'LV' : ['P', 'L', 'A', 'I', 'H', 'W'].includes(info?.code ?? '') ? info.code : 'P',
      leave: isLv ? info.code : ctx.config.leaveTypes[0]?.code ?? '',
      in: info?.in ?? days[a - 1]?.sday?.start ?? '09:00',
      out: info?.out ?? days[a - 1]?.sday?.end ?? '18:00',
      note: '',
    })
  }

  const day = days[calDay - 1]
  const dayIso = isoOf(y, m, calDay)
  const dl = lookOf(day?.code ?? '', ctx.config)
  const worked = day?.workedMin != null ? `${Math.floor(day.workedMin / 60)} h ${day.workedMin % 60} m` : '—'
  const n = hi - lo + 1
  const lt = ctx.config.leaveTypes.find(x => x.code === ed.leave)
  const left = lt ? (lt.unpaid ? null : balances.get(lt.code) ?? null) : null
  const leaveNote = !lt ? '' : lt.unpaid || left == null ? `${n} day${n > 1 ? 's' : ''} unpaid · goes to payroll`
    : left - n < 0 ? `Only ${left} left — ${n} days asked. Saving goes negative; HR can still save.` : `Uses ${n} day${n > 1 ? 's' : ''} · ${left - n} left after`
  const code = ed.code === 'LV' ? ed.leave : ed.code

  const save = async () => {
    if (!ed.note.trim() || !code) return
    setBusy(true)
    setError(null)
    const r = await setDays([p.id], isoOf(y, m, lo), isoOf(y, m, hi), code, ['P', 'L', 'I'].includes(ed.code) ? ed.in : '', ['P', 'L'].includes(ed.code) ? ed.out : '', ed.note.trim())
    setBusy(false)
    if (!r.ok) return setError(r.reason)
    setEditing(false)
    flash(`${p.name} · ${n} day${n > 1 ? 's' : ''} set to ${code} · reason saved to the audit log`)
  }

  const exportCsv = () =>
    downloadCsv(`${p.name.replace(/\s+/g, '_')}_${month.slice(0, 7)}.csv`, [
      ['Date', 'Status', 'IN', 'OUT', 'Worked (min)'],
      ...days.map((d, i) => [isoOf(y, m, i + 1), d.code, d.in, d.out, d.workedMin]),
    ])

  const label9: CSSProperties = { fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }
  // The calendar names the fence, not the distance (the handoff: 'HQ · inside fence').
  const fence = !day?.place ? null : day.flags.includes('Outside fence') ? day.place : `${day.place.split(' · ')[0]} · inside fence`
  const facts = [
    { label: 'IN', value: day?.in ?? '—', mono: true },
    { label: 'OUT', value: day?.out ?? '—', mono: true },
    { label: 'Worked', value: worked, mono: true },
    { label: 'Place', value: fence ?? '—' },
  ]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      // The prototype hands its Sheet width="460" as a string, which CSS refuses: the panel takes its content's width, 567.56px.
      width={567.56}
      eyebrow={`Attendance · ${monthLabel(month)}`}
      title={p.name}
      description={[p.title, p.department, day?.schedule?.name].filter(Boolean).join(' · ')}
      footer={
        <>
          <Button variant="secondary" onClick={exportCsv}>Export</Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', border: '1px solid var(--ds-border)', borderRadius: 10 }}>
          {[['Days in', t.inD], ['Late', t.late], ['Leave', t.leave], ['Absent', t.abs]].map(([label, value], i) => (
            <div key={String(label)} style={{ padding: '10px 12px', borderLeft: i ? '1px solid var(--ds-border)' : 0 }}>
              <div style={label9}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,56px)', justifyContent: 'center', gap: 4 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => (
            <span key={w} style={{ ...label9, textAlign: 'center' }}>{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} style={{ width: 56, height: 54, visibility: 'hidden' }} />)}
          {days.map((c, i) => {
            const d = i + 1
            const look = lookOf(c.code, ctx.config)
            const inSel = d >= lo && d <= hi
            const shown = c.code === 'W' || c.code === '' ? '' : c.code
            return (
              <button
                key={d}
                type="button"
                onMouseDown={e => {
                  if (e.button !== 0) return
                  setSel([d, d])
                  setCalDay(d)
                  setDragging(true)
                  setEditing(false)
                }}
                onMouseEnter={() => {
                  if (dragging) setSel(s => [s[0], d])
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  if (d >= lo && d <= hi) openEditor(lo, hi)
                  else openEditor(d, d)
                }}
                onDoubleClick={e => {
                  e.preventDefault()
                  if (d >= lo && d <= hi) openEditor(lo, hi)
                  else openEditor(d, d)
                }}
                style={{
                  position: 'relative',
                  userSelect: 'none',
                  width: 56,
                  height: 54,
                  boxSizing: 'border-box',
                  padding: '5px 5px 4px',
                  borderRadius: 8,
                  border: '1px solid var(--ds-border)',
                  boxShadow: inSel ? '0 0 0 2px var(--ds-ink)' : 'none',
                  background: c.code === 'W' ? HATCH : look.wash ? look.wash[0] : 'var(--ds-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  fontFamily: 'inherit',
                  color: 'var(--ds-ink)',
                  cursor: 'pointer',
                  lineHeight: 'normal',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: c.code === 'W' ? 'var(--ds-ink-3)' : 'var(--ds-ink-2)' }}>{d}</span>
                <span style={{ position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: '50%', background: c.edited ? 'var(--ds-accent)' : 'transparent' }} />
                <span style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: look.wash ? look.wash[1] : look.ink, background: 'transparent', padding: '1px 4px', borderRadius: 4 }}>{shown}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ds-ink-3)' }}>{c.in ?? ''}</span>
                </span>
              </button>
            )
          })}
        </div>
        {!editing ? (
          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>
                {multi ? `${lo}–${hi} ${mm} · ${n} days selected` : `${longDay(dayIso)}${day?.edited ? ' · edited by HR' : ''}`}
              </span>
              {multi ? (
                <Button size="sm" onClick={() => openEditor(lo, hi)}>Edit days</Button>
              ) : (
                <StatusChip tone={toneOf(day?.code ?? '', ctx.config)}>{dl.label || (day?.code === '' ? 'Not yet' : '—')}</StatusChip>
              )}
            </div>
            {!multi ? <DescriptionList items={facts} layout="stacked" columns={4} /> : null}
            {!multi && day?.in ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, paddingTop: 4 }}>
                {([['IN', day.in], ['OUT', day.out]] as const).map(([label, time]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', background: time ? 'repeating-linear-gradient(135deg,var(--ds-surface-2) 0 8px,var(--ds-surface-3) 8px 9px)' : 'var(--ds-surface-2)', border: '1px solid var(--ds-border)', display: 'grid', placeItems: 'center' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--ds-ink-3)' }}>{time ? 'Selfie at punch' : 'No punch yet'}</span>
                      <span style={{ position: 'absolute', left: 6, top: 6, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'rgb(255 255 255 / .92)', color: 'var(--ds-ink)' }}>{`${label} · ${time ?? '—'}`}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>{time ? `Front camera · ${fence ?? '—'}` : '—'}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ border: '1.5px solid var(--ds-ink)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{multi ? `Edit ${lo}–${hi} ${mm} · ${n} days` : `Edit ${lo} ${mm}`}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ds-ink-3)' }}>HR correction · audited</span>
            </div>
            <Field label="Status">
              <DsSelect value={ed.code} onChange={v => setEd(e => ({ ...e, code: v }))} options={SET_CODES.filter(c => c.value !== 'SO')} />
            </Field>
            {ed.code === 'LV' ? (
              <Field label="Leave type · balance" hint={leaveNote}>
                <DsSelect
                  value={ed.leave}
                  onChange={v => setEd(e => ({ ...e, leave: v }))}
                  options={ctx.config.leaveTypes.map(x => {
                    const b = x.unpaid ? null : balances.get(x.code) ?? null
                    return { value: x.code, label: `${x.code} · ${x.name} · ${b == null ? 'no balance' : `${b} left`}` }
                  })}
                />
              </Field>
            ) : null}
            {['P', 'L', 'I'].includes(ed.code) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                <Field label="Punch in"><TextField type="time" value={ed.in} onChange={v => setEd(e => ({ ...e, in: v }))} /></Field>
                <Field label="Punch out"><TextField type="time" value={ed.out} onChange={v => setEd(e => ({ ...e, out: v }))} /></Field>
              </div>
            ) : null}
            <Field label="Reason" hint="Required. Saved to the audit log; the person sees it." error={error}>
              <Textarea rows={2} value={ed.note} onChange={v => setEd(e => ({ ...e, note: v }))} placeholder="e.g. Punch machine offline at HQ, confirmed with upline" />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" disabled={!ed.note.trim() || !code || busy || !ctx.config.canEdit} onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

