'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ds/Button'
import { DsSelect, Field, TextField, Textarea } from '@/components/ds/Field'
import { CenterWindow } from '@/components/ds/Overlay'
import { createRequestOnBehalf } from '@/lib/attendance/actions'
import { leaveDaysFor } from '@/lib/attendance/engine'
import type { AttConfig } from '@/lib/attendance/types'
import { RangeCalendar } from './BalanceCalendar'

/**
 * Requests › + On someone's behalf (the handoff flashes "Opens the request
 * form · sent as HR on their behalf"; drawn here in Settings' window): a
 * person, what they ask for (a leave type or overtime), the days, the reason.
 * It takes the request's own route — the upline first where there is one.
 * The days follow the person's schedule, never the weekday: a leave counts the
 * days it works less the holidays, an overtime is paid as its day is on the
 * schedule — nobody picks it (2026-10-17, the user: "everythings go with this
 * schedule").
 */
export function RequestOnBehalf({ config, onClose, onSent, onError }: { config: AttConfig; onClose: () => void; onSent: (m: string) => void; onError: (m: string) => void }) {
  const [staffId, setStaffId] = useState(config.people[0]?.id ?? '')
  const [kind, setKind] = useState(config.leaveTypes[0]?.code ?? 'OT')
  const [range, setRange] = useState({ from: '', to: '' })
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')
  const [busy, start] = useTransition()
  const ot = kind === 'OT'
  const person = config.people.find(p => p.id === staffId)
  const calendarDays = config.leaveTypes.find(t => t.code === kind)?.counts === 'calendar'
  const days = person ? leaveDaysFor(person, range.from, range.to || range.from, config, { calendar: calendarDays }) : 0
  const blocked = busy || !staffId || !range.from || !reason.trim() || (ot ? !(Number(hours) > 0) : days === 0)

  const send = () =>
    start(async () => {
      const r = await createRequestOnBehalf(
        ot
          ? { staffId, kind: 'ot', from: range.from, to: range.from, hours: Number(hours), detail: {}, reason: reason.trim() }
          : { staffId, kind: 'leave', leaveCode: kind, from: range.from, to: range.to || range.from, days, reason: reason.trim() },
      )
      if (!r.ok) return onError(r.reason)
      onSent(`${r.data.ref} sent for ${person?.name ?? 'them'} · it takes its route`)
    })

  return (
    <CenterWindow open onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid var(--ds-border)' }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>Requests · on someone&apos;s behalf</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4 }}>New request</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 22, lineHeight: 1, color: 'var(--ds-ink-3)', cursor: 'pointer', padding: 0 }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          <Field label="Person">
            <DsSelect value={staffId} onChange={setStaffId} options={config.people.map(p => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Request">
            <DsSelect value={kind} onChange={setKind} options={[...config.leaveTypes.map(t => ({ value: t.code, label: `${t.code} · ${t.name}` })), { value: 'OT', label: 'Overtime' }]} />
          </Field>
        </div>
        <RangeCalendar from={range.from} to={ot ? '' : range.to} today={config.today} onChange={r => setRange(ot ? { from: r.from || r.to, to: '' } : r)} />
        {ot ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <Field label="Hours">
              <TextField type="number" step="0.5" min="0" value={hours} onChange={setHours} />
            </Field>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'var(--ds-surface-2)', fontSize: 12.5 }}>
            <span style={{ color: 'var(--ds-ink-2)' }}>{calendarDays ? 'Calendar days' : 'Work days · days off and holidays skipped'}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{days}</span>
          </div>
        )}
        <Field label="Reason" hint="Required. The person sees it.">
          <Textarea value={reason} onChange={setReason} rows={2} />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--ds-border)' }}>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={blocked} onClick={send}>Send</Button>
      </div>
    </CenterWindow>
  )
}
