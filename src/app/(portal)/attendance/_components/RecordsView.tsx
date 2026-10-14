'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Button } from '@/components/ds/Button'
import { DsSelect, Field, TextField } from '@/components/ds/Field'
import { Toast, useFlash } from '@/components/ds/Overlay'
import { setDayOverride, setDays } from '@/lib/attendance/actions'
import { isoOf, monAbbr, monthGrid, monthLabel, wd3, type Ctx } from '@/lib/attendance/engine'
import type { AttConfig, AttLedger, AttMonth, AttPerson } from '@/lib/attendance/types'
import { Avatar } from './bits'
import { HATCH, SET_CODES, downloadCsv, lookOf } from './codes'
import PersonCalendar from './PersonCalendar'

/**
 * HR › Attendance › Records (the handoff's `isRecords`): the month as a
 * matrix, one row per person who clocks, each day washed by its status. Drag
 * across date headers (whole days, everyone) or cells (people × days);
 * right-click or double-click opens a window at the pointer — a whole day's
 * kind for everyone, or the cells' status, punch times and a required reason.
 * A name opens the person's calendar. ‹ › walk the months.
 */

type Sel = { kind: 'cols'; d0: number; d1: number } | { kind: 'cells'; r0: number; r1: number; d0: number; d1: number }

const COLMAP: Record<string, 'H' | 'CH' | 'SO' | 'WD'> = { 'Public holiday': 'H', 'Company holiday': 'CH', 'Special off': 'SO', 'Working day': 'WD' }

const LEGEND: Array<[string, string, string, string]> = [
  // code, label, background, letters
  ['P', 'Present', 'var(--ds-success-bg)', 'var(--ds-success)'],
  ['L', 'Late', 'var(--ds-warning-bg)', 'var(--ds-warning)'],
  ['A', 'Absent', 'var(--ds-danger-bg)', 'var(--ds-danger)'],
  ['I', 'Incomplete', 'var(--ds-danger-bg)', 'var(--ds-danger)'],
  ['AL', 'Annual leave', 'rgb(var(--tone-slate))', 'rgb(var(--tone-slate-deep))'],
  ['AL?', 'Leave waiting', 'var(--ds-surface-2)', 'rgb(var(--tone-slate-deep))'],
  ['SL', 'Sick leave', 'var(--ds-info-bg)', 'var(--ds-info)'],
  ['H', 'Public holiday', 'rgb(var(--tone-gold))', 'rgb(var(--tone-gold-deep))'],
  ['CH', 'Company holiday', 'rgb(var(--tone-walnut))', 'rgb(var(--tone-walnut-deep))'],
  ['SO', 'Special off', 'rgb(var(--tone-olive))', 'rgb(var(--tone-olive-deep))'],
  ['W', 'Weekend', HATCH, 'var(--ds-ink-3)'],
]

const HEAD: CSSProperties = { background: 'rgb(235 231 224)', padding: '10px 4px', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', textAlign: 'center', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }

export default function RecordsView({ config, month, ledger }: { config: AttConfig; month: AttMonth; ledger: AttLedger | null }) {
  const router = useRouter()
  const today = config.today
  const ctx: Ctx = useMemo(() => ({ config, month, today, now: config.now }), [config, month, today])
  const grid = useMemo(() => monthGrid(ctx), [ctx])
  const [dept, setDept] = useState('all')
  const rows = grid.rows.filter(r => dept === 'all' || r.person.departmentId === dept)
  const [y, m] = month.month.split('-').map(Number)
  const mm = monAbbr(month.month)
  const mDays = grid.days.length
  const todayD = today.slice(0, 7) === month.month.slice(0, 7) ? Number(today.slice(8, 10)) : 0

  const recRef = useRef<HTMLDivElement | null>(null)
  const [ms, setMs] = useState<Sel | null>(null)
  const [mdrag, setMdrag] = useState(false)
  const [bar, setBar] = useState<'cols' | 'cells' | null>(null)
  const [pop, setPop] = useState({ x: 0, y: 0 })
  const [colChoice, setColChoice] = useState('Public holiday')
  const [colName, setColName] = useState('')
  const [bk, setBk] = useState({ code: 'P', leave: config.leaveTypes[0]?.code ?? '', in: '09:00', out: '18:00', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calPerson, setCalPerson] = useState<AttPerson | null>(null)
  const [toast, flash] = useFlash()

  useEffect(() => {
    const up = () => setMdrag(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const popAt = (e: MouseEvent) => {
    const el = recRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    let x = e.clientX - r.left + 6
    const yy = e.clientY - r.top + 6
    if (x > el.clientWidth - 350) x = Math.max(0, el.clientWidth - 350)
    return { x, y: yy }
  }
  const colSel = (d: number) => !!ms && ms.kind === 'cols' && d >= Math.min(ms.d0, ms.d1) && d <= Math.max(ms.d0, ms.d1)
  const cellSel = (ri: number, d: number) => !!ms && ms.kind === 'cells' && ri >= Math.min(ms.r0, ms.r1) && ri <= Math.max(ms.r0, ms.r1) && d >= Math.min(ms.d0, ms.d1) && d <= Math.max(ms.d0, ms.d1)
  const mLo = ms ? Math.min(ms.d0, ms.d1) : 0
  const mHi = ms ? Math.max(ms.d0, ms.d1) : 0
  const msN = ms ? (ms.kind === 'cols' ? mHi - mLo + 1 : (Math.abs(ms.r1 - ms.r0) + 1) * (mHi - mLo + 1)) : 0
  const rangeTxt = mLo === mHi ? `${mLo} ${mm}` : `${mLo}–${mHi} ${mm}`
  const popTitle = bar === 'cols' ? `${rangeTxt} · ${msN} day${msN > 1 ? 's' : ''} · everyone`
    : ms && ms.kind === 'cells' ? (msN > 1 ? `${Math.abs(ms.r1 - ms.r0) + 1} people × ${mHi - mLo + 1} days · ${rangeTxt}` : `${rows[ms.r0]?.person.name ?? ''} · ${rangeTxt}`) : ''
  const iso = (d: number) => isoOf(y, m, d)
  const leaveCodes = grid.leaveCodes
  const closeBar = () => {
    setBar(null)
    setMs(null)
    setError(null)
  }

  const go = (delta: number) => {
    const t = new Date(Date.UTC(y, m - 1 + delta, 1))
    router.push(`/attendance/records?m=${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  const colApply = async (code: 'H' | 'CH' | 'SO' | 'WD' | null) => {
    if (!ms) return
    setBusy(true)
    const r = await setDayOverride(iso(mLo), iso(mHi), code, code ? colName.trim() : '')
    setBusy(false)
    if (!r.ok) return setError(r.reason)
    closeBar()
    flash(code ? `${rangeTxt} set to ${colChoice.toLowerCase()} for everyone · audited` : `${rangeTxt} back to the normal schedule`)
  }
  const bkCode = bk.code === 'LV' ? bk.leave : bk.code
  const bkApply = async () => {
    if (!ms || ms.kind !== 'cells' || !bk.note.trim() || !bkCode) return
    const staff = rows.slice(Math.min(ms.r0, ms.r1), Math.max(ms.r0, ms.r1) + 1).map(r => r.person.id)
    setBusy(true)
    const r = await setDays(staff, iso(mLo), iso(mHi), bkCode, ['P', 'L', 'I'].includes(bkCode) ? bk.in : '', ['P', 'L'].includes(bkCode) ? bk.out : '', bk.note.trim())
    setBusy(false)
    if (!r.ok) return setError(r.reason)
    closeBar()
    setBk(b => ({ ...b, note: '' }))
    flash(`${msN} cells set to ${bkCode} · reason saved to the audit log`)
  }

  const exportCsv = () =>
    downloadCsv(`Records_${month.month.slice(0, 7)}.csv`, [
      ['Code', 'Name', 'In', 'Late', 'Leave', ...grid.days.map(d => d.slice(8, 10))],
      ...rows.map(r => [r.person.code, r.person.name, r.t.inD, r.t.late, r.t.leave, ...r.cells.map(c => c.code)]),
    ])

  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Records" right={<div style={{ marginBottom: -9 }}><Button variant="secondary" onClick={exportCsv}>Export</Button></div>} />
      <div ref={recRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button variant="secondary" size="sm" onClick={() => go(-1)} title="Previous month">‹</Button>
            <span style={{ minWidth: 130, textAlign: 'center', fontSize: 15, fontWeight: 500 }}>{monthLabel(month.month)}</span>
            <Button variant="secondary" size="sm" onClick={() => go(1)} title="Next month">›</Button>
          </div>
          <div style={{ width: 190 }}>
            <DsSelect value={dept} onChange={setDept} ariaLabel="Department" options={[{ value: 'all', label: 'All departments' }, ...config.departments.map(d => ({ value: d.id, label: d.name }))]} />
          </div>
        </div>
        <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, overflow: 'auto', background: 'var(--ds-surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `200px 52px 44px 50px repeat(${mDays},36px)`, width: 'max-content', minWidth: '100%' }}>
            <div style={{ position: 'sticky', left: 0, zIndex: 2, background: 'rgb(235 231 224)', padding: '10px 14px', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', display: 'flex', alignItems: 'flex-end' }}>Employee</div>
            <div style={HEAD}>In</div>
            <div style={HEAD}>Late</div>
            <div style={{ ...HEAD, borderRight: '1px solid var(--ds-border-strong)' }}>Leave</div>
            {grid.days.map((day, i) => {
              const d = i + 1
              const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
              const we = wd === 0 || wd === 6
              const ov = month.overrides.find(o => o.day === day)
              const cs2 = colSel(d)
              return (
                <div
                  key={day}
                  title={ov ? `${ov.name || { H: 'Public holiday', CH: 'Company holiday', SO: 'Special off', WD: 'Working day' }[ov.code]} · right-click to change` : 'Right-click to set a holiday or off day'}
                  onMouseDown={e => {
                    if (e.button !== 0) return
                    setMs({ kind: 'cols', d0: d, d1: d })
                    setMdrag(true)
                    setBar(null)
                  }}
                  onMouseEnter={() => {
                    if (mdrag && ms?.kind === 'cols') setMs({ ...ms, d1: d })
                  }}
                  onContextMenu={e => {
                    e.preventDefault()
                    const pos = popAt(e)
                    if (!cs2) setMs({ kind: 'cols', d0: d, d1: d })
                    setBar('cols')
                    setPop(pos)
                    setColName(ov ? ov.name : '')
                    setError(null)
                  }}
                  onDoubleClick={e => {
                    e.preventDefault()
                    const pos = popAt(e)
                    if (!cs2) setMs({ kind: 'cols', d0: d, d1: d })
                    setBar('cols')
                    setPop(pos)
                    setColName(ov ? ov.name : '')
                  }}
                  style={{ position: 'relative', userSelect: 'none', cursor: 'pointer', background: we ? 'rgb(229 226 219)' : 'rgb(235 231 224)', padding: '7px 0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, boxShadow: cs2 ? 'inset 0 0 0 2px var(--ds-ink)' : d === todayD ? 'inset 0 -2px 0 var(--ds-accent)' : 'none' }}
                >
                  <span style={{ position: 'absolute', top: 3, right: 4, width: 4, height: 4, borderRadius: '50%', background: ov ? 'rgb(var(--tone-gold-deep))' : 'transparent' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: d === todayD ? 700 : 400 }}>{String(d).padStart(2, '0')}</span>
                  <span style={{ fontSize: 9.5, color: 'var(--ds-ink-3)' }}>{wd3(day)}</span>
                </div>
              )
            })}
            {rows.map((r, ri) => (
              <div key={r.person.id} style={{ display: 'contents' }}>
                <NameCell person={r.person} on={calPerson?.id === r.person.id} onOpen={() => setCalPerson(r.person)} />
                <div style={{ borderTop: '1px solid var(--ds-border)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.t.inD}</div>
                <div style={{ borderTop: '1px solid var(--ds-border)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: r.t.late ? 'var(--ds-warning)' : 'var(--ds-ink-3)' }}>{r.t.late || '—'}</div>
                <div style={{ borderTop: '1px solid var(--ds-border)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 12.5, borderRight: '1px solid var(--ds-border-strong)' }}>{r.t.leave || '—'}</div>
                {r.cells.map((c, i) => {
                  const d = i + 1
                  const look = lookOf(c.code, config)
                  const sl = cellSel(ri, d) || colSel(d)
                  const line = look.wash ? 'transparent' : c.code === 'P' ? 'var(--ds-success)' : 'transparent'
                  const open = (e: MouseEvent) => {
                    e.preventDefault()
                    const pos = popAt(e)
                    const inside = cellSel(ri, d)
                    const isLv = leaveCodes.has(c.code)
                    if (!inside) setMs({ kind: 'cells', r0: ri, r1: ri, d0: d, d1: d })
                    const several = inside && ms?.kind === 'cells' && (ms.r0 !== ms.r1 || ms.d0 !== ms.d1)
                    if (!several) setBk({ code: isLv ? 'LV' : ['P', 'L', 'A', 'I', 'H', 'SO', 'W'].includes(c.code) ? c.code : 'P', leave: isLv ? c.code : config.leaveTypes[0]?.code ?? '', in: c.in ?? '09:00', out: c.out ?? '18:00', note: '' })
                    setBar('cells')
                    setPop(pos)
                    setError(null)
                  }
                  return (
                    <div
                      key={i}
                      title={`${d} ${mm} · ${look.label || '—'}`}
                      onMouseDown={e => {
                        if (e.button !== 0) return
                        setMs({ kind: 'cells', r0: ri, r1: ri, d0: d, d1: d })
                        setMdrag(true)
                        setBar(null)
                      }}
                      onMouseEnter={() => {
                        if (mdrag && ms?.kind === 'cells') setMs({ ...ms, r1: ri, d1: d })
                      }}
                      onContextMenu={open}
                      onDoubleClick={open}
                      style={{
                        position: 'relative',
                        userSelect: 'none',
                        borderTop: '1px solid var(--ds-border)',
                        height: 42,
                        boxSizing: 'content-box',
                        cursor: 'cell',
                        display: 'grid',
                        placeItems: 'center',
                        background: c.code === 'W' ? HATCH : look.wash ? look.wash[0] : 'transparent',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        color: look.ink,
                        boxShadow: sl ? 'inset 0 0 0 2px var(--ds-ink)' : d === todayD ? 'inset 1px 0 0 var(--ds-ink), inset -1px 0 0 var(--ds-ink)' : 'none',
                      }}
                    >
                      <span style={{ minWidth: 26, padding: '3px 0', borderRadius: 5, textAlign: 'center', fontWeight: look.wash ? 600 : 400, background: 'transparent', color: look.wash ? look.wash[1] : look.ink }}>{c.code}</span>
                      <span style={{ position: 'absolute', left: 7, right: 7, bottom: 7, height: 2, borderRadius: 1, background: line }} />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', fontSize: 12, color: 'var(--ds-ink-2)' }}>
          {LEGEND.map(([code, label, bg, fg]) => (
            <span key={code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, minWidth: 26, textAlign: 'center', padding: '3px 2px', borderRadius: 5, background: bg, color: fg }}>{code}</span>
              {label}
            </span>
          ))}
        </div>
        {bar && ms ? (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{ position: 'absolute', left: pop.x, top: pop.y, zIndex: 30, width: 340, boxSizing: 'border-box', padding: 14, border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', boxShadow: '0 14px 36px rgb(51 36 27 / .18), 0 2px 6px rgb(51 36 27 / .06)', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{popTitle}</span>
              <button type="button" onClick={closeBar} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 18, lineHeight: 1, color: 'var(--ds-ink-3)', cursor: 'pointer', padding: '1px 6px', fontFamily: 'Arial, sans-serif' }}>×</button>
            </div>
            {bar === 'cols' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Set as">
                  <DsSelect value={colChoice} onChange={setColChoice} options={Object.keys(COLMAP)} />
                </Field>
                <Field label="Name" optional error={error}>
                  <TextField value={colName} onChange={setColName} placeholder="e.g. Deepavali" />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Button variant="secondary" size="sm" disabled={busy || !config.canEdit} onClick={() => colApply(null)}>Back to normal</Button>
                  <Button size="sm" disabled={busy || !config.canEdit} onClick={() => colApply(COLMAP[colChoice])}>Apply</Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Status">
                  <DsSelect value={bk.code} onChange={v => setBk(b => ({ ...b, code: v }))} options={SET_CODES} />
                </Field>
                {bk.code === 'LV' ? (
                  <Field label="Leave type">
                    <DsSelect value={bk.leave} onChange={v => setBk(b => ({ ...b, leave: v }))} options={config.leaveTypes.map(t => ({ value: t.code, label: `${t.code} · ${t.name}` }))} />
                  </Field>
                ) : null}
                {['P', 'L', 'I'].includes(bk.code) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                    <Field label="Punch in"><TextField type="time" value={bk.in} onChange={v => setBk(b => ({ ...b, in: v }))} /></Field>
                    <Field label="Punch out"><TextField type="time" value={bk.out} onChange={v => setBk(b => ({ ...b, out: v }))} /></Field>
                  </div>
                ) : null}
                <Field label="Reason" hint="Required. Saved to the audit log." error={error}>
                  <TextField value={bk.note} onChange={v => setBk(b => ({ ...b, note: v }))} placeholder="e.g. Punch machine offline" />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button variant="secondary" size="sm" onClick={closeBar}>Cancel</Button>
                  <Button size="sm" disabled={!bk.note.trim() || !bkCode || busy || !config.canEdit} onClick={bkApply}>Apply</Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
      <PersonCalendar ctx={ctx} ledger={ledger} person={calPerson} startDay={todayD || 1} onClose={() => setCalPerson(null)} flash={flash} />
      <Toast message={toast} />
    </HvPage>
  )
}

function NameCell({ person, on, onOpen }: { person: AttPerson; on: boolean; onOpen: () => void }) {
  const [h, setH] = useState(false)
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ position: 'sticky', left: 0, zIndex: 1, background: h || on ? 'rgb(255 245 233)' : 'var(--ds-surface)', border: 0, borderTop: '1px solid var(--ds-border)', padding: '0 14px', height: 42, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer', lineHeight: 'normal' }}
    >
      <Avatar name={person.name} size={24} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ds-ink-3)', width: 54, flex: 'none', whiteSpace: 'nowrap' }}>{person.code ?? ''}</span>
      <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</span>
    </button>
  )
}

