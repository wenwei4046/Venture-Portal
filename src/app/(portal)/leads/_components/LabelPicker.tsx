'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadLabels, setLeadLabels } from '@/lib/leads/actions'
import { LABEL_TONES, type LabelTone, type LeadContact, type LeadLabel } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import Modal from './ui/Modal'
import Popover from './ui/Popover'
import s from './handoff.module.css'
import f from './inbox.module.css'

/**
 * A customer's labels on the customer card (2026-10-27 — the user: "是否可以label 客户？比方说待考量之类的", showing Meta's
 * lead stages; mig 20261027190000; v2 2026-11-02 — kept though not drawn, on the v2 popover and modal). Lead View ·
 * Edit ticks them on and off (any number, saved at each tick); Lead View · Manage also edits the list — names,
 * colours, order, delete — saved whole.
 */
export default function LabelPicker({ contact, labels, canEdit, canManage, onSaved }: {
  contact: LeadContact
  labels: LeadLabel[]
  canEdit: boolean
  canManage: boolean
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const on = contact.labels ?? []
  if (!labels.length && !on.length && !canManage) return null

  const toggle = (id: string) => start(async () => {
    setError(null)
    const next = on.some(l => l.id === id) ? on.filter(l => l.id !== id).map(l => l.id) : [...on.map(l => l.id), id]
    const r = await setLeadLabels(contact.id, next)
    if (!r.ok) { setError(r.reason); return }
    onSaved()
  })

  return (
    <div className={f.field} style={{ alignItems: 'start', padding: '10px 0' }}>
      <span className={f.fieldKey}><LeadIcon name="tag" size={15} />Labels</span>
      <div className={s.row}>
        {on.map(l => <span key={l.id} className={s.label} data-tone={l.tone}>{l.name}</span>)}
        {!on.length && !canEdit ? <span className={f.fieldValue} data-empty="">—</span> : null}
        {canEdit && (labels.length || canManage) ? (
          <span className={s.wrap}>
            <button type="button" className={s.add} onClick={() => (labels.length ? setOpen(o => !o) : setEditing(true))} aria-haspopup="menu" aria-expanded={open} disabled={busy}>+ Label</button>
            <Popover open={open} onClose={() => setOpen(false)} className={s.menu} label="Labels">
              {labels.map(l => {
                const ticked = on.some(x => x.id === l.id)
                return (
                  <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={ticked} className={s.item} onClick={() => toggle(l.id)} disabled={busy}>
                    <span className={s.label} data-tone={l.tone}>{l.name}</span><span /><span className={s.tick}>{ticked ? '✓' : ''}</span>
                  </button>
                )
              })}
              {canManage ? (
                <>
                  <div className={s.sep} role="separator" />
                  <button type="button" className={s.item} onClick={() => { setOpen(false); setEditing(true) }}><LeadIcon name="pencil" size={14} /><span>Edit labels…</span></button>
                </>
              ) : null}
            </Popover>
          </span>
        ) : null}
      </div>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
      {editing ? <LabelEditor labels={labels} onClose={() => setEditing(false)} onSaved={onSaved} /> : null}
    </div>
  )
}

const TONE_NAME: Readonly<Record<LabelTone, string>> = { grey: 'Grey', amber: 'Amber', green: 'Green', red: 'Red', clay: 'Clay', blue: 'Blue' }

/** The list of labels, edited and saved whole (Lead View · Manage). A label taken out comes off every customer. */
function LabelEditor({ labels, onClose, onSaved }: { labels: LeadLabel[]; onClose: () => void; onSaved: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<Array<{ id?: string; name: string; tone: LabelTone; used: number }>>(labels.map(l => ({ id: l.id, name: l.name, tone: l.tone, used: l.used })))
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const put = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, by: number) => setRows(r => {
    const j = i + by
    if (j < 0 || j >= r.length) return r
    const next = [...r]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const drop = (i: number) => {
    const row = rows[i]
    if (row.used && !window.confirm(`Delete “${row.name}”? It comes off ${row.used} customer${row.used === 1 ? '' : 's'}.`)) return
    setRows(r => r.filter((_, j) => j !== i))
  }
  const save = () => start(async () => {
    setError(null)
    const r = await saveLeadLabels(rows.map(x => ({ id: x.id, name: x.name.trim(), tone: x.tone })))
    if (!r.ok) { setError(r.reason); return }
    onSaved()
    router.refresh()
    onClose()
  })
  return (
    <Modal open onClose={onClose} title="Edit labels" width={520}
      foot={<>
        <button type="button" className={s.cancel} onClick={onClose}>Cancel</button>
        <button type="button" className={s.go} onClick={save} disabled={busy || rows.some(x => !x.name.trim())}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      {rows.map((x, i) => (
        <div key={x.id ?? `new-${i}`} className={s.editRow}>
          <input className={s.input} value={x.name} maxLength={40} onChange={e => put(i, { name: e.target.value })} aria-label="Label name" />
          <select className={s.input} value={x.tone} onChange={e => put(i, { tone: e.target.value as LabelTone })} aria-label="Colour">
            {LABEL_TONES.map(t => <option key={t} value={t}>{TONE_NAME[t]}</option>)}
          </select>
          <span className={s.label} data-tone={x.tone}>{x.name || '…'}</span>
          <button type="button" className={s.icon} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><LeadIcon name="arrow-up" size={14} /></button>
          <button type="button" className={s.icon} onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down"><LeadIcon name="arrow-down" size={14} /></button>
          <button type="button" className={s.icon} onClick={() => drop(i)} aria-label="Delete"><LeadIcon name="x" size={14} /></button>
        </div>
      ))}
      <button type="button" className={s.more} onClick={() => setRows(r => [...r, { name: '', tone: 'grey', used: 0 }])} disabled={rows.length >= 30}>+ Add label</button>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
    </Modal>
  )
}
