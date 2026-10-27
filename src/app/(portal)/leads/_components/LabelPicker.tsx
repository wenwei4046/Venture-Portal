'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadLabels, setLeadLabels } from '@/lib/leads/actions'
import { LABEL_TONES, type LabelTone, type LeadContact, type LeadLabel } from '@/lib/leads/types'
import s from './inbox.module.css'

/**
 * A customer's labels on the customer card (2026-10-27 — the user: "是否可以label 客户？比方说待考量之类的", showing Meta's
 * lead stages; mig 20261027190000). Lead View · Edit ticks them on and off (any number, saved at each tick); Lead View
 * · Manage also edits the list — names, colours, order, delete — saved whole.
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
    <div className={s.block} style={{ gap: 6 }}>
      <span className={s.caps}>LABELS</span>
      <div className={s.labelRow}>
        {on.map(l => <span key={l.id} className={s.label} data-tone={l.tone}>{l.name}</span>)}
        {!on.length ? <span className={s.sub}>No labels</span> : null}
        {canEdit && labels.length ? (
          <span className={s.nowWrap}>
            <button type="button" className={s.textLink} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} disabled={busy}>+ Label</button>
            {open ? (
              <>
                <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
                <div className={s.menu} role="menu" aria-label="Labels" style={{ left: 0, right: 'auto', top: 24 }}>
                  {labels.map(l => {
                    const ticked = on.some(x => x.id === l.id)
                    return (
                      <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={ticked} className={s.menuItem} onClick={() => toggle(l.id)} disabled={busy}>
                        <span className={s.label} data-tone={l.tone}>{l.name}</span>
                        <span style={{ flex: 1 }} />
                        <span className={s.menuTick}>{ticked ? '✓' : ''}</span>
                      </button>
                    )
                  })}
                  {canManage ? (
                    <button type="button" className={s.menuItem} onClick={() => { setOpen(false); setEditing(true) }}>Edit labels…</button>
                  ) : null}
                </div>
              </>
            ) : null}
          </span>
        ) : canManage ? (
          <button type="button" className={s.textLink} onClick={() => setEditing(true)}>Edit labels…</button>
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
    <>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <div className={s.labelEditor} role="dialog" aria-label="Edit labels">
        <div className={s.menuKicker}>EDIT LABELS</div>
        {rows.map((x, i) => (
          <div key={x.id ?? `new-${i}`} className={s.labelEditRow}>
            <input className={s.input} value={x.name} maxLength={40} onChange={e => put(i, { name: e.target.value })} aria-label="Label name" />
            <select className={s.input} value={x.tone} onChange={e => put(i, { tone: e.target.value as LabelTone })} aria-label="Colour">
              {LABEL_TONES.map(t => <option key={t} value={t}>{TONE_NAME[t]}</option>)}
            </select>
            <span className={s.label} data-tone={x.tone}>{x.name || '…'}</span>
            <button type="button" className={s.iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
            <button type="button" className={s.iconBtn} onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">↓</button>
            <button type="button" className={s.iconBtn} onClick={() => drop(i)} aria-label="Delete">×</button>
          </div>
        ))}
        <button type="button" className={s.textLink} onClick={() => setRows(r => [...r, { name: '', tone: 'grey', used: 0 }])} disabled={rows.length >= 30}>+ Add label</button>
        {error ? <span className={s.error} role="alert">{error}</span> : null}
        <div className={s.labelEditFoot}>
          <button type="button" className={s.btn} data-quiet="" onClick={onClose}>Cancel</button>
          <button type="button" className={s.btn} data-strong="" onClick={save} disabled={busy || rows.some(x => !x.name.trim())}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </>
  )
}
