'use client'

import { Button } from '@/components/ds/Button'
import { Field, Textarea } from '@/components/ds/Field'
import { checkOt, type OtForm } from '@/lib/me/forms'
import type { MeData } from '@/lib/me/types'
import { Banner, BottomSheet, DateField, Stepper } from './kit'

export interface OtDraft extends OtForm {
  /** Claiming after the fact: what the punches say ("13 Oct · punched out 19:42 · 1 h 42 m past 18:00."). */
  claim: string | null
}

/**
 * Overtime (2026-10-17, the handoff's OT sheet): ask before you work it, or claim it after the fact from a day's
 * punches; the hours in 30-minute steps; the day's rate and who decides; the reason.
 */
export function OtSheet({ open, data, form, set, busy, onClose, onSend }: {
  open: boolean
  data: MeData
  form: OtDraft
  set: (patch: Partial<OtDraft>) => void
  busy: boolean
  onClose: () => void
  onSend: () => void
}) {
  const c = checkOt(data, form)
  return (
    <BottomSheet open={open} onClose={onClose} eyebrow="Submit request" title={form.after ? 'Claim overtime' : 'Ask for overtime'}
      description={form.after ? 'Paid only once approved' : 'Ask before you work it'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!c.error || busy} onClick={onSend}>Send request</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {form.after && form.claim ? <Banner tone="info" title="Claiming after the fact">{form.claim}</Banner> : null}
        <Field label="Date"><DateField value={form.date} onChange={v => set({ date: v })} /></Field>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{form.after ? 'Hours to claim' : 'Planned hours'}</div>
            <div style={{ fontSize: 12, color: 'var(--ds-ink-3)', marginTop: 2 }}>After {c.after} · in 30-minute steps</div>
          </div>
          <Stepper value={`${form.hours} h`} minWidth={56} onMinus={() => set({ hours: Math.max(0.5, form.hours - 0.5) })} onPlus={() => set({ hours: form.hours + 0.5 })} />
        </div>
        <div style={{ border: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, lineHeight: 1.45 }}>
          <div>{c.rate}</div>
          <div style={{ color: 'var(--ds-ink-2)' }}>{c.paid}</div>
          <div>{c.route}</div>
        </div>
        <Field label="Reason"><Textarea value={form.reason} onChange={v => set({ reason: v })} rows={2} placeholder="What needs the extra time" /></Field>
        {c.shown ? <div style={{ fontSize: 12.5, color: 'var(--ds-danger)' }}>{c.shown}</div> : null}
      </div>
    </BottomSheet>
  )
}
