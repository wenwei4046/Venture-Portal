'use client'

import { useState, useTransition } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { submitHiringRequest } from '@/lib/hiring/actions'
import { missingAnswers } from '@/lib/hiring/view'
import type { HiringBoard, HiringField } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * "+ New request" (README §11, the 640px drawer): Requested by — anybody
 * working here today — then the fields Form settings asks, in its order, a
 * long answer across both columns, a range as From – To. Submit to HR files it
 * as Pending; a blank required field says which ("Fill in Headcount, …").
 */
export default function NewRequestDrawer({
  board,
  open,
  onClose,
  onSubmitted,
}: {
  board: HiringBoard
  open: boolean
  onClose: () => void
  onSubmitted: (id: string) => void
}) {
  const [by, setBy] = useState(board.me.staffId ?? '')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const set = (id: string, v: string) => {
    setAnswers(a => ({ ...a, [id]: v }))
    setErr('')
  }

  const submit = () => {
    const missing = missingAnswers(board.fields, answers)
    if (missing.length) return setErr('Fill in ' + missing.join(', ') + '.')
    if (!by) return setErr('Pick who is asking.')
    start(async () => {
      const out = await submitHiringRequest({ requestedBy: by, answers })
      if (!out.ok) return setErr(out.reason)
      flash(out.id + ' submitted to HR')
      setAnswers({})
      setErr('')
      onSubmitted(out.id)
    })
  }

  const field = (f: HiringField) => {
    const v = answers[f.id] ?? ''
    if (f.type === 'number') {
      return <input type="number" min={0} className={`${s.input} ${s.numberInput}`} value={v} onChange={e => set(f.id, e.target.value)} aria-label={f.label} />
    }
    if (f.type === 'longtext') {
      return <textarea rows={4} className={s.textarea} value={v} onChange={e => set(f.id, e.target.value)} aria-label={f.label} />
    }
    if (f.type === 'select') {
      return (
        <Select bare className={s.select} value={v} onChange={e => set(f.id, e.target.value)} aria-label={f.label}>
          <option value="">Choose…</option>
          {f.options
            .split(',')
            .map(o => o.trim())
            .filter(Boolean)
            .map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </Select>
      )
    }
    if (f.type === 'range') {
      const [min = '', max = ''] = v.split('–')
      return (
        <span className={s.range}>
          <input type="number" min={0} placeholder="From" className={`${s.input} ${s.rangeInput}`} value={min} onChange={e => set(f.id, e.target.value + '–' + max)} aria-label={`${f.label} from`} />
          <span className={s.rangeTo}>to</span>
          <input type="number" min={0} placeholder="To" className={`${s.input} ${s.rangeInput}`} value={max} onChange={e => set(f.id, min + '–' + e.target.value)} aria-label={`${f.label} to`} />
        </span>
      )
    }
    return <input className={s.input} value={v} onChange={e => set(f.id, e.target.value)} aria-label={f.label} />
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      headStyle={{ padding: '18px 22px' }}
      head={<div className={s.drawerTitle}>New hiring request</div>}
      headGrow
      bodyStyle={{ padding: '18px 22px' }}
    >
      <section className={s.newForm} aria-label="Request manpower">
        <div className={s.newHead}>
          <span className={s.newTitle}>Request manpower</span>
          <span className={s.newHint}>Fields come from Form settings</span>
        </div>
        <label className={s.label}>
          <span className={s.labelText}>Requested by</span>
          <Select bare className={s.select} style={{ maxWidth: 280 }} value={by} onChange={e => setBy(e.target.value)}>
            {board.me.staffId ? null : <option value="">Choose…</option>}
            {board.people.map(p => (
              <option key={p.id} value={p.id}>
                {p.name + (p.department ? ' · ' + p.department : '')}
              </option>
            ))}
          </Select>
        </label>
        <div className={s.newGrid}>
          {board.fields.map(f => (
            <label key={f.id} className={`${s.label}${f.type === 'longtext' ? ` ${s.full}` : ''}`}>
              <span className={s.labelText}>
                <span>{f.label}</span>
                {f.required ? <span className={s.req}> *</span> : null}
              </span>
              {field(f)}
            </label>
          ))}
        </div>
        <div className={s.newFoot}>
          <span className={`${s.err} ${s.grow}`}>{err}</span>
          <button type="button" className={s.btnOrange} style={{ padding: '8px 18px' }} onClick={submit} disabled={pending}>
            Submit to HR
          </button>
        </div>
      </section>
    </Drawer>
  )
}
