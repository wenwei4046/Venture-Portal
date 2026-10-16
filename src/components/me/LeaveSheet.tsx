'use client'

import { useRef } from 'react'
import { Button } from '@/components/ds/Button'
import { SegmentedControl } from '@/components/ds/Controls'
import { DsSelect, Field, Textarea } from '@/components/ds/Field'
import { addDays } from '@/lib/attendance/engine'
import { fmtN } from '@/lib/me/format'
import { BACK_DAYS, checkLeave, typeOptions, type LeaveForm } from '@/lib/me/leave'
import type { MeData } from '@/lib/me/types'
import { BottomSheet, NUM } from './kit'
import { RangeCalendar } from './RangeCalendar'

export interface LeaveDraft extends Omit<LeaveForm, 'file'> {
  month: string
  file: File | null
}

/**
 * Apply for leave (2026-10-17, the handoff's leave sheet): the type, the range calendar, half days on a single day,
 * the working days it takes against the balance, who decides, the certificate where one is needed, the reason — and
 * the first thing in the way, in red, with Send off until there is none.
 */
export function LeaveSheet({ open, data, form, set, busy, onClose, onSend }: {
  open: boolean
  data: MeData
  form: LeaveDraft
  set: (patch: Partial<LeaveDraft>) => void
  busy: boolean
  onClose: () => void
  onSend: () => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const c = checkLeave(data, { ...form, file: form.file ? { name: form.file.name } : null })
  return (
    <BottomSheet open={open} onClose={onClose} eyebrow="Leave · new" title="Apply for leave" description="Checked against your balance and notice as you fill it"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!c.error || busy} onClick={onSend}>Send request</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Leave type"><DsSelect value={form.code} onChange={v => set({ code: v, file: null })} options={typeOptions(data)} /></Field>
        <RangeCalendar month={form.month} setMonth={m => set({ month: m })} from={form.from} to={form.to} onChange={r => set(r)}
          min={addDays(data.workDay, -BACK_DAYS)} today={data.workDay} />
        {c.halfOk ? <SegmentedControl options={['Full day', 'Morning', 'Afternoon']} value={form.half} onChange={v => set({ half: v as LeaveForm['half'] })} block /> : null}
        <div style={{ border: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>Working days · weekends and holidays skipped</span>
            <span style={{ ...NUM, fontSize: 18 }}>{c.days > 0 ? fmtN(c.days) : '0'}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{c.balanceLine}</div>
          <div style={{ fontSize: 12.5 }}>{c.route}</div>
        </div>
        {c.certificate ? (
          <>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; if (f) set({ file: f }) }} />
            <button type="button" onClick={() => (form.file ? set({ file: null }) : fileRef.current?.click())} style={{
              border: '1.5px dashed var(--ds-border-strong)', borderRadius: 10, background: 'none', padding: 14, fontFamily: 'inherit', fontSize: 13, color: 'var(--ds-ink)', cursor: 'pointer', textAlign: 'left',
            }}>{form.file ? `✓ ${form.file.name} · tap to remove` : '+ Add the medical certificate (photo or PDF)'}</button>
          </>
        ) : null}
        <Field label="Reason" optional><Textarea value={form.reason} onChange={v => set({ reason: v })} rows={2} placeholder="Visible to your upline and HR" /></Field>
        {c.error && form.from ? <div style={{ fontSize: 12.5, color: 'var(--ds-danger)' }}>{c.error}</div> : null}
      </div>
    </BottomSheet>
  )
}
