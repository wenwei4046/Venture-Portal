'use client'

import { useEffect, useState, useTransition } from 'react'
import { Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { saveCandidateFields } from '@/lib/hiring/actions'
import type { CandidateField, CandidateFieldType, HiringBoard } from '@/lib/hiring/types'
import { newFieldId } from './FormSettings'
import s from './hiring.module.css'

/**
 * Candidate fields (README §11 — a centred 620px window): what HR fills in for
 * each candidate beyond name, phone, status, note and résumé — each field's
 * name, type (Short text, Number, Date, Dropdown) and choices, ×, and "+ Add
 * field". Kept as the window closes.
 */
const TYPES: ReadonlyArray<{ v: CandidateFieldType; label: string }> = [
  { v: 'text', label: 'Short text' },
  { v: 'number', label: 'Number' },
  { v: 'date', label: 'Date' },
  { v: 'choice', label: 'Dropdown' },
]

export default function CandidateFieldsWindow({ board, open, onClose }: { board: HiringBoard; open: boolean; onClose: () => void }) {
  const [fields, setFields] = useState<CandidateField[]>(board.candidateFields)
  const [newField, setNewField] = useState('')
  const [, start] = useTransition()

  useEffect(() => {
    if (open) setFields(board.candidateFields)
    // Opened afresh each time from what the page last read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const update = (id: string, patch: Partial<CandidateField>) => setFields(fs => fs.map(f => (f.id === id ? { ...f, ...patch } : f)))
  const add = () => {
    const label = newField.trim()
    if (!label) return
    setFields(fs => [...fs, { id: newFieldId(), label, type: 'text', options: '' }])
    setNewField('')
  }
  const close = () => {
    const changed = JSON.stringify(fields) !== JSON.stringify(board.candidateFields)
    onClose()
    if (!changed) return
    const kept = fields.filter(f => f.label.trim())
    start(async () => {
      const out = await saveCandidateFields(kept)
      if (!out.ok) flash(out.reason)
    })
  }

  return (
    <Window open={open} onClose={close} width={620} scrim={0.22} label="Candidate fields">
      <div className={s.winHead}>
        <div className={s.winHeadMain}>
          <div className={s.winTitle}>Candidate fields</div>
          <div className={s.winSub}>What HR fills in for each candidate. Name, phone, status, note and résumé are always there.</div>
        </div>
        <button type="button" className={s.winClose} onClick={close} aria-label="Close">
          ×
        </button>
      </div>
      <div className={s.winBodyFields}>
        <div className={`${s.cfCols} ${s.cfHeadRow}`}>
          <span>Field</span>
          <span>Type</span>
          <span>Dropdown choices</span>
          <span />
        </div>
        {fields.map(f => (
          <div key={f.id} className={`${s.cfCols} ${s.cfRow}`}>
            <input className={`${s.input} ${s.fsInput}`} value={f.label} aria-label="Field" onChange={e => update(f.id, { label: e.target.value })} />
            <Select bare className={`${s.select} ${s.fsSelect}`} aria-label="Type" value={f.type} onChange={e => update(f.id, { type: e.target.value as CandidateFieldType })}>
              {TYPES.map(t => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </Select>
            {f.type === 'choice' ? (
              <input className={`${s.input} ${s.fsInput}`} value={f.options} placeholder="Comma-separated, e.g. Yes, No" aria-label="Dropdown choices" onChange={e => update(f.id, { options: e.target.value })} />
            ) : (
              <span className={s.cfDash}>—</span>
            )}
            <button type="button" className={s.remove} title="Remove" aria-label={`Remove ${f.label}`} onClick={() => setFields(fs => fs.filter(x => x.id !== f.id))}>
              ×
            </button>
          </div>
        ))}
        <div className={s.addRow}>
          <input
            className={`${s.input} ${s.cfAdd}`}
            value={newField}
            placeholder="New field, e.g. Languages"
            aria-label="New field"
            onChange={e => setNewField(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') add()
            }}
          />
          <button type="button" className={`${s.btnGhost} ${s.cfAddBtn}`} onClick={add}>
            + Add field
          </button>
        </div>
      </div>
      <div className={s.winFoot}>
        <button type="button" className={s.btnOrange} style={{ padding: '8px 18px' }} onClick={close}>
          Done
        </button>
      </div>
    </Window>
  )
}
