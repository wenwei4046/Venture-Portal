'use client'

import { Button } from '@/components/ds/Button'
import { SegmentedControl } from '@/components/ds/Controls'
import { DsSelect, Field, Textarea } from '@/components/ds/Field'
import { fairOptions, fairRange, mpRoute, MP_ROLES, spanDays, type MpRole } from '@/lib/me/forms'
import type { MeData } from '@/lib/me/types'
import { BottomSheet, NUM, Stepper } from './kit'
import { RangeCalendar } from './RangeCalendar'

export interface MpDraft {
  event: string
  month: string
  from: string
  to: string
  role: MpRole
  count: number
  reason: string
}

/**
 * Extra manpower (2026-10-17, the handoff's manpower sheet): which fair, its days, promoters, helpers or drivers, how
 * many a day (1–6), the person-days that makes, who decides — and HR books them once approved.
 */
export function MpSheet({ open, data, form, set, busy, onClose, onSend }: {
  open: boolean
  data: MeData
  form: MpDraft
  set: (patch: Partial<MpDraft>) => void
  busy: boolean
  onClose: () => void
  onSend: () => void
}) {
  const options = fairOptions(data.fairs)
  const len = form.from ? spanDays(form.from, form.to || form.from) : 0
  const blocked = len < 1 || !form.reason.trim() || !form.event
  return (
    <BottomSheet open={open} onClose={onClose} eyebrow="Submit request" title="Extra manpower" description="HR books the people once approved"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={blocked || busy} onClick={onSend}>Send request</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="For">
          <DsSelect value={form.event} options={options.map(o => ({ value: o.value, label: o.label }))} onChange={v => {
            const o = options.find(x => x.value === v)
            const r = o ? fairRange(o, data.workDay) : { from: '', to: '' }
            set({ event: v, ...(r.from ? { ...r, month: r.from.slice(0, 7) } : {}) })
          }} />
        </Field>
        <RangeCalendar month={form.month} setMonth={m => set({ month: m })} from={form.from} to={form.to} onChange={r => set(r)} min={data.workDay} today={data.workDay} />
        <SegmentedControl options={MP_ROLES} value={form.role} onChange={v => set({ role: v as MpRole })} block />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>People needed</div>
            <div style={{ fontSize: 12, color: 'var(--ds-ink-3)', marginTop: 2 }}>Per day · up to 6</div>
          </div>
          <Stepper value={form.count} minWidth={40} onMinus={() => set({ count: Math.max(1, form.count - 1) })} onPlus={() => set({ count: Math.min(6, form.count + 1) })} />
        </div>
        <div style={{ border: '1px solid var(--ds-border)', background: 'var(--ds-surface-2)', borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ds-ink-2)' }}>Person-days</span>
            <span style={NUM}>{len > 0 ? `${len} d × ${form.count} = ${len * form.count}` : '—'}</span>
          </div>
          <div>{mpRoute(data)}</div>
        </div>
        <Field label="Reason"><Textarea value={form.reason} onChange={v => set({ reason: v })} rows={2} placeholder="e.g. Two booths this weekend, one promoter on leave" /></Field>
      </div>
    </BottomSheet>
  )
}
