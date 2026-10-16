'use client'

import { Button } from '@/components/ds/Button'
import { SegmentedControl } from '@/components/ds/Controls'
import { Field, TextField, Textarea } from '@/components/ds/Field'
import { correctionRoute, quotaOf } from '@/lib/me/forms'
import type { MeData } from '@/lib/me/types'
import { BottomSheet, DateField } from './kit'

export interface CrDraft {
  date: string
  dir: 'IN' | 'OUT'
  time: string
  reason: string
}

/**
 * Correct a punch (2026-10-17, the handoff's correction sheet): the month's corrections left (a blue quota card with
 * its three segments), the day, the time, IN or OUT, the reason, who decides. Send waits for a reason, and for a
 * correction left.
 */
export function CrSheet({ open, data, form, set, busy, onClose, onSend }: {
  open: boolean
  data: MeData
  form: CrDraft
  set: (patch: Partial<CrDraft>) => void
  busy: boolean
  onClose: () => void
  onSend: () => void
}) {
  const q = quotaOf(data, form.date || data.workDay)
  const none = q.quota > 0 && q.left === 0
  return (
    <BottomSheet open={open} onClose={onClose} eyebrow="Submit request" title="Correct a punch" description="For a missed or wrong IN or OUT"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!form.reason.trim() || none || busy} onClick={onSend}>Send request</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14, background: 'var(--me-tile-2-bg)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgb(255 255 255)', color: 'var(--me-tile-2)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-quota-ink)' }}>Corrections · {q.month}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-quota-ink)', fontVariantNumeric: 'tabular-nums' }}>{q.left} of {q.quota} left</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, q.quota)},minmax(0,1fr))`, gap: 4 }}>
              {Array.from({ length: Math.max(1, q.quota) }, (_, i) => (
                <span key={i} style={{ height: 5, borderRadius: 3, background: i < q.used ? 'var(--me-tile-2)' : 'var(--me-quota-open)' }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          <Field label="Date"><DateField value={form.date} max={data.workDay} onChange={v => set({ date: v })} /></Field>
          <Field label="Time"><TextField type="time" value={form.time} onChange={v => set({ time: v })} /></Field>
        </div>
        <SegmentedControl options={['IN', 'OUT']} value={form.dir} onChange={v => set({ dir: v as 'IN' | 'OUT' })} block />
        <Field label="Reason"><Textarea value={form.reason} onChange={v => set({ reason: v })} rows={2} placeholder="e.g. Phone battery died" /></Field>
        {none ? <div style={{ fontSize: 12.5, color: 'var(--ds-danger)' }}>No corrections left for {q.month}.</div> : null}
        <div style={{ fontSize: 12.5 }}>{correctionRoute(data)}</div>
      </div>
    </BottomSheet>
  )
}
