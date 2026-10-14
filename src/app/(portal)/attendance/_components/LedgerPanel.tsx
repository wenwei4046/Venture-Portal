'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ds/Button'
import { Field, TextField, Textarea } from '@/components/ds/Field'
import { PanelHead, SidePanel } from '@/components/ds/Overlay'
import { addLedger, bookLeave } from '@/lib/attendance/actions'
import { dayMon, type Balance, type LedgerRow } from '@/lib/attendance/engine'
import { atLabel, officeDateOf } from '@/lib/attendance/requests'
import type { AttConfig, AttLeaveType, AttLedger, AttPerson } from '@/lib/attendance/types'
import { RangeCalendar, workingDaysIn } from './BalanceCalendar'

/**
 * Leave balances' right-hand panel (the handoff's `ledOpen`, lines 295–383,
 * and `ledPanel`, 1036–1077): 460px over the whole window. A history row opens
 * it on its facts and audit trail; Edit days opens it on the balance to
 * change (an adjustment row, reason required); Use leave on the range
 * calendar, the working-day count and the reason — booked by HR, approved on
 * the spot, deducted straight away.
 */

export type LedgerPick = { mode: 'view' | 'edit' | 'use'; row: LedgerRow | null }

const fmt = (n: number) => String(Math.round(n * 100) / 100)
const dotAt = (iso: string | null | undefined) => atLabel(iso).replace(', ', ' · ')
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`

type Trail = Array<{ what: string; who: string; at: string; current?: boolean }>

function rowStory(row: LedgerRow, person: AttPerson, type: AttLeaveType, ledger: AttLedger): { facts: Array<{ k: string; v: string }>; trail: Trail } {
  const left = row.left == null ? '—' : fmt(row.left)
  if (row.source === 'request') {
    const r = ledger.leave.find(x => x.id === row.id)
    if (!r) return { facts: [], trail: [] }
    const booked = r.onBehalf && r.steps.length === 1 && r.steps[0].onBehalf && r.steps[0].role === 'hr'
    const approved = r.steps.filter(s => s.state === 'approved')
    const trail: Trail = []
    if (booked) {
      trail.push({ what: 'Booked by HR on behalf', who: `${r.steps[0].decidedBy ?? r.by} · “${r.reason}”`, at: dotAt(r.steps[0].decidedAt) })
    } else {
      trail.push({ what: 'Submitted', who: r.onBehalf ? `${person.name} · by ${r.by}` : person.name, at: dotAt(r.sentAt) })
      for (const s of r.steps) {
        const role = s.role === 'hr' ? 'HR' : 'upline'
        if (s.state === 'approved') trail.push({ what: `Approved by ${role}`, who: `${s.decidedBy ?? s.approver}${s.onBehalf ? ' · on behalf' : ''}`, at: dotAt(s.decidedAt) })
        if (s.state === 'waiting') trail.push({ what: `Waiting for ${role}`, who: s.approver, at: s.arrivedAt ? `since ${dayMon(officeDateOf(s.arrivedAt))}` : '', current: true })
      }
    }
    if (r.status === 'approved') trail.push({ what: 'Posted to ledger', who: `System · −${fmt(Math.abs(row.days))} ${r.code}`, at: dotAt(r.decidedAt) })
    return {
      facts: [
        { k: 'Approved by', v: r.status === 'pending' ? 'Not yet' : booked ? `${r.steps[0].decidedBy ?? r.by} (HR)` : approved.map(s => s.decidedBy ?? s.approver).join(' → ') || '—' },
        { k: 'Balance after', v: left },
        { k: 'Source', v: booked ? 'HR on behalf' : 'Leave request' },
      ],
      trail,
    }
  }
  if (row.source === 'ledger') {
    const e = ledger.entries.find(x => x.id === row.id)
    if (!e) return { facts: [], trail: [] }
    const was = e.detail.was, now = e.detail.now
    return {
      facts: [
        { k: 'Changed by', v: `${e.by} (HR)` },
        { k: e.kind === 'opening' ? 'Days' : 'Was → now', v: e.kind === 'opening' ? signed(e.days) : was != null && now != null ? `${was} → ${now}` : signed(e.days) },
        { k: 'Source', v: e.kind === 'opening' ? 'Opening balance' : 'HR adjustment' },
      ],
      trail: [
        ...e.events.map(ev => ({ what: ev.what, who: `${ev.who}${ev.note ? ` · “${ev.note}”` : ''}`, at: dotAt(ev.at) })),
        { what: 'Posted to ledger', who: `System · ${signed(e.days)} ${e.code}`, at: dotAt(e.at) },
      ],
    }
  }
  if (row.source === 'mark') {
    const m = ledger.marks.find(x => `mark:${x.day}` === row.id && x.staffId === person.id)
    return {
      facts: [
        { k: 'Set by', v: m ? `${m.by} (HR)` : '—' },
        { k: 'Balance after', v: left },
        { k: 'Source', v: 'Records' },
      ],
      trail: m
        ? [
            { what: 'Set in Records', who: `${m.by} · “${m.note}”`, at: dotAt(m.at) },
            { what: 'Posted to ledger', who: `System · −1 ${type.drawsFrom ?? type.code}`, at: dotAt(m.at) },
          ]
        : [],
    }
  }
  return {
    facts: [
      { k: 'Approved by', v: 'System' },
      { k: 'Balance after', v: left },
      { k: 'Source', v: 'Automatic' },
    ],
    trail: [{ what: 'Posted to ledger', who: 'System · scheduled job', at: `${row.dateLabel.split(' – ').pop()} · 00:05` }],
  }
}

export function LedgerPanel({
  pick,
  person,
  type,
  bal,
  config,
  ledger,
  onClose,
  onDone,
  onError,
}: {
  pick: LedgerPick | null
  person: AttPerson
  type: AttLeaveType
  bal: Balance
  config: AttConfig
  ledger: AttLedger
  onMode: (mode: LedgerPick['mode']) => void
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const left = bal.left ?? 0
  const [note, setNote] = useState('')
  const [days, setDays] = useState(fmt(left))
  const [range, setRange] = useState({ from: '', to: '' })
  const [pending, start] = useTransition()
  const key = pick ? `${pick.mode}:${pick.row?.id ?? ''}` : ''
  useEffect(() => {
    setNote('')
    setDays(fmt(left))
    setRange({ from: '', to: '' })
  }, [key, left])
  if (!pick) return null
  const mode = pick.mode
  const act = !pick.row
  const unpaid = bal.left == null
  const lower = type.name.toLowerCase()

  let ref = person.name, title = '', sub = ''
  let story: ReturnType<typeof rowStory> | null = null
  if (act) {
    title = mode === 'use' ? `Use ${lower}` : `Edit ${lower} balance`
    sub = unpaid ? 'No balance · goes to payroll' : `${fmt(left)} day${left === 1 ? '' : 's'} left now`
  } else {
    const row = pick.row!
    story = rowStory(row, person, type, ledger)
    ref = row.ref ?? 'Ledger entry'
    title = `${type.name} · ${row.entry}`
    const n = row.pending ? `(${fmt(Math.abs(row.days))})` : signed(row.days)
    sub = `${row.dateLabel} · ${n} day${Math.abs(row.days) === 1 ? '' : 's'}`
  }

  const nv0 = parseFloat(days)
  const nv = Number.isNaN(nv0) ? NaN : Math.max(0, nv0)
  const delta = Number.isNaN(nv) ? 0 : Math.round((nv - left) * 100) / 100
  const editHint = Number.isNaN(nv) || nv === left ? 'Enter the corrected days left.' : `Adds an adjustment of ${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))} · ${type.name} becomes ${fmt(left + delta)} left`
  const count = workingDaysIn(range.from, range.to)
  const after = Math.round((left - count) * 100) / 100
  const balLine = unpaid ? 'Unpaid · goes to payroll' : !count ? `${fmt(left)} left now` : after < 0 ? `Only ${fmt(left)} left · this goes ${fmt(after)}` : `${fmt(left)} left now · ${fmt(after)} left after`
  const code = type.drawsFrom ?? type.code

  const saveEdit = () =>
    start(async () => {
      const r = await addLedger(person.id, code, ledger.year, 'adjust', delta, note.trim(), { was: left, now: nv })
      if (!r.ok) return onError(r.reason)
      onDone(`${type.name} adjusted · reason saved to the audit trail`)
    })
  const saveUse = () =>
    start(async () => {
      const r = await bookLeave(person.id, type.code, range.from, range.to || range.from, count, note.trim())
      if (!r.ok) return onError(r.reason)
      onDone(`${count} day${count > 1 ? 's' : ''} of ${lower} booked for ${person.name}`)
    })

  const label = (t: string) => <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>{t}</span>
  return (
    <SidePanel open onClose={onClose} width={460}>
      <PanelHead eyebrow={ref} mono title={title} sub={sub} onClose={onClose} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {mode === 'view' && story ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
              {story.facts.map(x => (
                <div key={x.k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {label(x.k)}
                  <span style={{ fontSize: 13 }}>{x.v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', marginBottom: 10 }}>Audit trail</span>
              {story.trail.map((e, i, a) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: 10, alignItems: 'stretch' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, marginTop: 4, borderRadius: '50%', background: e.current ? 'rgb(233 154 83)' : 'var(--ds-success)', flex: 'none' }} />
                    <span style={{ flex: 1, width: 2, background: i === a.length - 1 ? 'transparent' : 'var(--ds-border)', minHeight: 22 }} />
                  </span>
                  <span style={{ paddingBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{e.what}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ds-ink-2)', marginTop: 1 }}>{e.who}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)', whiteSpace: 'nowrap' }}>{e.at}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {mode === 'edit' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, border: '1px solid var(--ds-border)', borderRadius: 10, background: 'var(--ds-surface-2)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>Balance now</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>{`${fmt(left)} day${left === 1 ? '' : 's'} left`}</span>
            </div>
            <Field label="Change to" hint={editHint}>
              <TextField type="number" step="0.5" min="0" value={days} onChange={setDays} />
            </Field>
            <Field label="Reason" hint="Required. Saved to the audit trail.">
              <Textarea value={note} onChange={setNote} rows={2} placeholder="e.g. Carry-forward confirmed by director" />
            </Field>
          </div>
        ) : null}
        {mode === 'use' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{`Booked by HR on ${person.name}'s behalf. It skips the upline and is deducted straight away.`}</div>
            <RangeCalendar from={range.from} to={range.to} today={config.today} onChange={setRange} />
            <div style={{ border: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>Working days · weekends skipped</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>{count}</span>
              </div>
              <div style={{ fontSize: 12.5, color: !unpaid && after < 0 ? 'var(--ds-danger)' : 'var(--ds-ink-2)' }}>{balLine}</div>
            </div>
            <Field label="Reason" hint="Required. Saved to the audit trail; the person sees it.">
              <Textarea value={note} onChange={setNote} rows={2} placeholder="e.g. Called in sick, no app access" />
            </Field>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--ds-border)' }}>
        {mode === 'view' ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%' }}>
            <Button variant="secondary" size="sm" onClick={onClose}>Back</Button>
            {mode === 'edit' ? (
              <Button size="sm" disabled={pending || !note.trim() || Number.isNaN(nv) || nv === left} onClick={saveEdit}>Save</Button>
            ) : (
              <Button size="sm" disabled={pending || !count || !note.trim()} onClick={saveUse}>{count ? `Use ${count} day${count > 1 ? 's' : ''}` : 'Use'}</Button>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  )
}
