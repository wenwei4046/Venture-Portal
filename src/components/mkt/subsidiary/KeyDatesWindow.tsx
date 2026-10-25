'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { deleteMktKeyDate, saveMktKeyDate } from '@/lib/marketing/actions'
import type { MktSub } from '@/lib/marketing/board'
import {
  blankKey, KEY_NAME_MAX, KEY_SHORT_MAX, keyDateRows, keyDraftOf, keyPatch, keyProblems, type KeyDraft, type MktKeyDate,
} from '@/lib/marketing/key-dates'
import p from '../project/project.module.css'
import t from '../task/task.module.css'
import s from './subsidiary.module.css'

// A subsidiary's own key dates (2026-10-25 — the user's answer 14, "each company's own"; and "Marketing 全员，可每年重复"):
// everybody with Marketing · Edit adds one — its day, its name, the words on its flag, once or every year — changes one
// (only what changed is sent) or deletes it. HR's holidays are not listed: they stay HR's. Opened from Key dates' Edit,
// or from a key date's own flag on the calendar.

export default function KeyDatesWindow({ sub, keys, today, open, onSaved, onClose }: {
  sub: MktSub
  keys: MktKeyDate[]
  today: string
  /** The key date to open in the form — else a new one. */
  open: string | null
  onSaved: (keys: MktKeyDate[]) => void
  onClose: () => void
}) {
  const first = keys.find(k => k.id === open) ?? null
  // The one in the form (null: a new one), what it was when opened, what it is now.
  const [editing, setEditing] = useState<string | null>(first?.id ?? null)
  const [was, setWas] = useState<KeyDraft | null>(first ? keyDraftOf(first) : null)
  const [now, setNow] = useState<KeyDraft>(first ? keyDraftOf(first) : blankKey(today))
  // The key date whose Delete is asking.
  const [asking, setAsking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const rows = keyDateRows(keys, today)
  const problems = keyProblems(now)
  const patch = keyPatch(was, now)
  // What stops it is said once something is typed — a new form is not wrong yet.
  const touched = editing ? !!patch : !!(now.name || now.short || now.yearly || now.day !== today)

  const fresh = () => {
    setEditing(null)
    setWas(null)
    setNow(blankKey(today))
  }
  const pick = (k: MktKeyDate) => {
    setError(null)
    setAsking(null)
    setEditing(k.id)
    setWas(keyDraftOf(k))
    setNow(keyDraftOf(k))
  }
  const set = (k: 'day' | 'name' | 'short') => (e: ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setNow(v => ({ ...v, [k]: e.target.value }))
  }
  const save = () =>
    start(async () => {
      if (!patch || problems.length) return
      const r = await saveMktKeyDate(sub.id, editing, patch)
      if (!r.ok) return setError(r.reason)
      onSaved(r.keys)
      fresh()
    })
  const remove = (id: string) =>
    start(async () => {
      setError(null)
      const r = await deleteMktKeyDate(sub.id, id)
      if (!r.ok) return setError(r.reason)
      onSaved(r.keys)
      setAsking(null)
      if (editing === id) fresh()
    })

  return (
    <div className={t.scrim} onClick={() => !pending && onClose()}>
      <div className={`${t.dialog} ${s.editWide}`} role="dialog" aria-modal="true" aria-label={`Key dates · ${sub.name}`} onClick={e => e.stopPropagation()}>
        <div className={t.dialogTitle}>⚑ Key dates · {sub.name}</div>
        <div className={s.keyList} role="list" aria-label="Key dates">
          {rows.length ? rows.map(r => (
            <div key={r.key.id} role="listitem" className={`${s.keyRow}${r.next ? '' : ` ${s.keyPast}`}${editing === r.key.id ? ` ${s.keyRowOn}` : ''}`}>
              <span className={s.flag} aria-hidden="true">⚑ {r.key.short ?? r.key.name}</span>
              <span className={s.keyText}>
                <span className={s.keyName}>{r.key.name}</span>
                <span className={s.keyWhen}>{r.when}{r.repeat ? ` · ${r.repeat}` : ''}</span>
              </span>
              {asking === r.key.id ? (
                <span className={s.keyAsk}>
                  <button type="button" className={s.keyAct} onClick={() => setAsking(null)} disabled={pending}>Keep</button>
                  <button type="button" className={`${s.keyAct} ${s.keyDel}`} onClick={() => remove(r.key.id)} disabled={pending}>
                    {pending ? 'Deleting…' : 'Delete'}
                  </button>
                </span>
              ) : (
                <span className={s.keyAsk}>
                  <button type="button" className={s.keyAct} onClick={() => pick(r.key)} disabled={pending} aria-label={`Change ${r.key.name}`}>Change</button>
                  <button type="button" className={s.keyAct} onClick={() => { setError(null); setAsking(r.key.id) }} disabled={pending} aria-label={`Delete ${r.key.name}`}>
                    Delete
                  </button>
                </span>
              )}
            </div>
          )) : <div className={s.keyNone}>No key dates yet</div>}
        </div>
        <div className={s.keyForm}>
          <div className={s.billHead}>{editing ? 'Change key date' : 'Add a key date'}</div>
          <div className={s.keyGrid}>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Day</span>
              <input className={p.input} type="date" value={now.day} min="2000-01-01" max="2100-12-31" onChange={set('day')} />
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Name</span>
              <input className={p.input} value={now.name} maxLength={KEY_NAME_MAX} placeholder="e.g. 11.11 sale day" onChange={set('name')} autoFocus />
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>On its flag</span>
              <input className={p.input} value={now.short} maxLength={KEY_SHORT_MAX} placeholder="e.g. 11.11" onChange={set('short')} />
            </label>
            <label className={s.keyCheck}>
              <input type="checkbox" checked={now.yearly} onChange={e => { setError(null); setNow(v => ({ ...v, yearly: e.target.checked })) }} />
              Every year
            </label>
          </div>
        </div>
        {error || (touched && problems.length) ? <div className={s.editError} role="alert">{error ?? problems[0]}</div> : null}
        <div className={t.dialogBtns}>
          {editing ? (
            <button type="button" className={`${t.dialogBtn} ${s.keyLeft}`} onClick={fresh} disabled={pending}>Cancel change</button>
          ) : null}
          <button type="button" className={t.dialogBtn} onClick={onClose} disabled={pending}>Done</button>
          <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending || !patch || problems.length > 0} onClick={save}>
            {pending ? 'Saving…' : editing ? 'Save' : 'Add key date'}
          </button>
        </div>
      </div>
    </div>
  )
}
