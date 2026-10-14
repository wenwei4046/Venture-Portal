'use client'

import { useMemo, useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Button } from '@/components/ds/Button'
import { DsSelect, TextField } from '@/components/ds/Field'
import { Toast, useFlash } from '@/components/ds/Overlay'
import { assignmentFor, dayInfo, fromMin, indexMonth, policyOn, scheduleDay, shortDay, toMin, type Ctx, type DayInfo } from '@/lib/attendance/engine'
import type { AttConfig, AttLedger, AttMonth, AttPerson } from '@/lib/attendance/types'
import { Avatar, HoverButton } from './bits'
import { downloadCsv } from './codes'
import PersonCalendar from './PersonCalendar'

/**
 * HR › Attendance › Today (the handoff's `isToday`, lanes layout): four lanes —
 * Clocked in, Late, Not in yet, On leave — of the people who clock today, by
 * department and a search; a name opens their month (the person calendar).
 */
export default function TodayView({ config, month, ledger }: { config: AttConfig; month: AttMonth; ledger: AttLedger | null }) {
  const today = config.today
  const ctx: Ctx = useMemo(() => ({ config, month, today, now: config.now }), [config, month, today])
  const idx = useMemo(() => indexMonth(month), [month])
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('all')
  const [calPerson, setCalPerson] = useState<AttPerson | null>(null)
  const [toast, flash] = useFlash()

  const q = query.trim().toLowerCase()
  const clocking = config.people.filter(p => assignmentFor(p, today, config.assignments)?.mode === 'clock')
  const tp = clocking
    .filter(p => (dept === 'all' || p.departmentId === dept) && (!q || `${p.name}${p.title ?? ''}`.toLowerCase().includes(q)))
    .map(p => ({ p, d: dayInfo(p, today, ctx, idx) }))
  const total = tp.length

  // The company default's schedule names the day: "Office 9–6, 5 min grace".
  const company = config.assignments.filter(a => a.level === 'company' && a.from <= today).sort((a, b) => (a.from < b.from ? 1 : -1))[0]
  const companySchedule = company?.scheduleId ? config.schedules.find(s => s.id === company.scheduleId) ?? null : null
  const sd = scheduleDay(companySchedule, today)
  const grace = policyOn(today, config.policies)?.graceMin ?? 5
  const by = sd?.start ? fromMin(toMin(sd.start) + grace) : null
  const status = [shortDay(today), `as of ${config.now}`, companySchedule ? `${companySchedule.name}, ${grace} min grace` : null].filter(Boolean).join(' · ')

  const leaveName = (code: string) => config.leaveTypes.find(t => t.code === code)?.name ?? code
  const span = (p: AttPerson) => {
    const l = month.leave.find(x => x.staffId === p.id && x.status === 'approved' && x.from <= today && x.to >= today)
    if (!l) return ''
    const a = l.from.split('-').map(Number)
    const b = l.to.split('-').map(Number)
    const mon = shortDay(l.to).split(' ')[2]
    return l.from === l.to ? `${a[2]} ${mon}` : `${a[2]}–${b[2]} ${mon}`
  }
  const startOf = (d: DayInfo) => d.sday?.start ?? null

  type Row = { p: AttPerson; right: string; rightColor: string; sub: string }
  const lanes: Array<{ label: string; bar: string; note: string; rows: Row[] }> = [
    {
      label: 'Clocked in',
      bar: 'var(--ds-success)',
      note: by ? `On time, by ${by}` : 'On time',
      rows: tp.filter(x => x.d.code === 'P' || x.d.code === 'I').map(x => ({ p: x.p, right: x.d.in ?? '—', rightColor: 'var(--ds-ink)', sub: x.d.place ?? '—' })),
    },
    {
      label: 'Late',
      bar: 'var(--ds-warning)',
      note: by ? `In after ${by}` : 'In late',
      rows: tp.filter(x => x.d.code === 'L').map(x => ({ p: x.p, right: x.d.in ?? '—', rightColor: 'var(--ds-warning)', sub: [`${x.d.lateMin} min after ${startOf(x.d) ?? ''}`.trim(), x.p.title].filter(Boolean).join(' · ') })),
    },
    {
      label: 'Not in yet',
      bar: 'var(--ds-danger)',
      note: 'No punch, no leave',
      rows: tp.filter(x => x.d.code === '·' || x.d.code === 'A').map(x => ({ p: x.p, right: '—', rightColor: 'var(--ds-ink-3)', sub: [x.p.title, startOf(x.d) ? `starts ${startOf(x.d)}` : null].filter(Boolean).join(' · ') })),
    },
    {
      label: 'On leave',
      bar: 'rgb(var(--tone-slate-deep))',
      note: 'Approved',
      rows: tp.filter(x => config.leaveTypes.some(t => t.code === x.d.code)).map(x => ({ p: x.p, right: x.d.code, rightColor: 'var(--ds-ink-2)', sub: [leaveName(x.d.code), span(x.p)].filter(Boolean).join(' · ') })),
    },
  ]

  const exportCsv = () =>
    downloadCsv(`Attendance_${today}.csv`, [
      ['Name', 'Code', 'Department', 'Status', 'IN', 'Place'],
      ...lanes.flatMap(l => l.rows.map(r => [r.p.name, r.p.code, r.p.department, l.label, r.right, r.sub])),
    ])

  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Today" right={<div style={{ marginBottom: -9 }}><Button variant="secondary" onClick={exportCsv}>Export</Button></div>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
            <TextField value={query} onChange={setQuery} placeholder="Search name or title…" ariaLabel="Search name or title" />
          </div>
          <div style={{ width: 190 }}>
            <DsSelect value={dept} onChange={setDept} ariaLabel="Department" options={[{ value: 'all', label: 'All departments' }, ...config.departments.map(d => ({ value: d.id, label: d.name }))]} />
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{status}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, alignItems: 'start' }}>
          {lanes.map(l => (
            <div key={l.label} style={{ border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', boxShadow: '0 3px 12px rgb(90 62 43 / .055)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ width: 23, height: 3, borderRadius: 2, background: l.bar }} />
                <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', marginTop: 4 }}>{l.label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, lineHeight: 1 }}>{l.rows.length}</span>
                  <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>of {total}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--ds-ink-2)' }}>{l.note}</span>
              </div>
              {l.rows.map(r => (
                <HoverButton
                  key={r.p.id}
                  onClick={() => setCalPerson(r.p)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', border: 0, borderTop: '1px solid var(--ds-border)', background: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer', lineHeight: 'normal' }}
                >
                  <Avatar name={r.p.name} size={28} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.p.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--ds-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: r.rightColor }}>{r.right}</span>
                </HoverButton>
              ))}
              {l.rows.length === 0 ? <div style={{ padding: '12px 16px', borderTop: '1px solid var(--ds-border)', fontSize: 12.5, color: 'var(--ds-ink-3)' }}>Nobody</div> : null}
            </div>
          ))}
        </div>
      </div>
      <PersonCalendar ctx={ctx} ledger={ledger} person={calPerson} startDay={Number(today.slice(8, 10))} onClose={() => setCalPerson(null)} flash={flash} />
      <Toast message={toast} />
    </HvPage>
  )
}
