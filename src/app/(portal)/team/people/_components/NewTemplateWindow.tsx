'use client'

import { useMemo, useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { SENSITIVE_FIELDS, type CellKey, type SensitiveField } from '@/lib/permission-matrix'
import { TAB_BY_ID, TAB_VIEWS, appOnly, heldTabs, tabsOfView, viewTicks, type TabView } from '@/lib/permission-tabs'
import { createTemplate } from '../permission-actions'
import s from './people.module.css'
import p from './permissions.module.css'

/**
 * "+ New template" (the user, 2026-10-11): a window that asks the new
 * template's name and which views it can see, and its sensitive fields — every
 * tab of the views picked starts with View ticked, and Create, Edit and
 * Approve are ticked afterwards in the table. Only the Revenue app picked: its
 * holders are Revenue app accounts (the database decides that from the ticks).
 * Before it is made, it says which of those tabs would not open yet, and why —
 * the same notes the table shows (`heldTabs`).
 */
export default function NewTemplateWindow({
  names,
  cellKeys,
  onClose,
  onCreated,
}: {
  /** The templates already there — a name is used once. */
  names: readonly string[]
  cellKeys: readonly CellKey[]
  onClose: () => void
  onCreated: (created: { id: string; name: string; views: TabView[] }) => void
}) {
  const [name, setName] = useState('')
  const [views, setViews] = useState<TabView[]>([])
  const [sensitive, setSensitive] = useState<SensitiveField[]>([])
  const [tried, setTried] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmed = name.trim()
  const taken = names.some(n => n.trim().toLowerCase() === trimmed.toLowerCase())
  const nameError = !tried ? '' : !trimmed ? 'Give it a name' : taken ? 'There is already a template called that' : ''
  const viewError = tried && views.length === 0 ? 'Pick at least one' : ''

  // What would not open yet, grouped by why: the table's own notes, ahead of time.
  const notes = useMemo(() => {
    const byWhy = new Map<string, string[]>()
    for (const [tabId, why] of heldTabs(viewTicks(views), sensitive, appOnly(views) ? 'revenue_member' : 'staff', cellKeys)) {
      byWhy.set(why, [...(byWhy.get(why) ?? []), TAB_BY_ID.get(tabId)?.label ?? tabId])
    }
    return [...byWhy.entries()]
  }, [views, sensitive, cellKeys])

  const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter(v => v !== value) : [...list, value])

  function create() {
    if (pending) return
    setTried(true)
    setRefusal(null)
    if (!trimmed || taken || views.length === 0) return
    // In the rail's order, whatever order they were ticked in.
    const picked = TAB_VIEWS.filter(v => views.includes(v.id)).map(v => v.id)
    startTransition(async () => {
      const result = await createTemplate({ name: trimmed, views: picked, sensitive })
      if (!result.ok) {
        setRefusal(result.reason)
        return
      }
      onCreated({ id: result.id, name: trimmed, views: picked })
    })
  }

  return (
    <Window
      open
      onClose={onClose}
      // Invite user's window: 420px of content, content-box, the 1px rim.
      width={466}
      scrim={0.22}
      z={32}
      label="New template"
      style={{ border: '1px solid rgb(var(--hv-hairline))', borderRadius: 14, boxShadow: '0 16px 48px rgb(43 31 23 / 0.2)', padding: 22 }}
    >
      <div className={s.inv}>
        <div>
          <h2 className={s.invTitle}>New template</h2>
          <div className={s.invSub}>
            Name it and pick the views it can see. Every tab of those views starts with View ticked — Create, Edit and Approve are ticked after, in the table.
          </div>
        </div>
        <label className={s.invField}>
          <span className={s.invLabel}>
            <span>Template name *</span>
            <span className={s.invErr}>{nameError}</span>
          </span>
          <input
            className={s.invInput}
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="e.g. Area Manager"
            onKeyDown={e => {
              if (e.key === 'Enter') create()
            }}
          />
        </label>
        <div className={s.invField} role="group" aria-labelledby="new-template-views">
          <span className={s.invLabel}>
            <span id="new-template-views">Views it can see *</span>
            <span className={s.invErr}>{viewError}</span>
          </span>
          <div className={p.ntList}>
            {TAB_VIEWS.map(v => (
              <label key={v.id} className={`${p.ntRow} ${views.includes(v.id) ? p.ntRowOn : ''}`}>
                <input type="checkbox" checked={views.includes(v.id)} onChange={() => setViews(list => toggle(list, v.id))} />
                <span className={p.ntName}>{v.label}</span>
                <span className={p.ntCount}>{tabsOfView(v.id).length} tabs</span>
              </label>
            ))}
          </div>
        </div>
        <div className={s.invField} role="group" aria-labelledby="new-template-sensitive">
          <span className={s.invLabel}>
            <span id="new-template-sensitive">Sensitive fields · hidden as •••• unless ticked</span>
          </span>
          <div className={p.ntList}>
            {SENSITIVE_FIELDS.map(f => (
              <label key={f.key} className={`${p.ntRow} ${sensitive.includes(f.key) ? p.ntRowOn : ''}`}>
                <input type="checkbox" checked={sensitive.includes(f.key)} onChange={() => setSensitive(list => toggle(list, f.key))} />
                <span>
                  <span className={p.ntName}>{f.label}</span>
                  <span className={p.ntNote}>{f.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {views.length > 0 ? (
          <div className={p.ntNotes} role="status">
            <div>{appOnly(views) ? 'Only the Revenue app: its holders sign in to the Revenue app.' : 'Its holders sign in to the portal.'}</div>
            {notes.map(([why, labels]) => (
              <div key={why} className={p.ntHeld}>
                <b>{labels.join(', ')}</b>: {why}
              </div>
            ))}
          </div>
        ) : null}
        <div className={s.invFoot}>
          {refusal ? (
            <span className={s.invRefusal} role="alert">
              {refusal}
            </span>
          ) : null}
          <button type="button" className={`${btn('outline')} ${s.invCancel}`} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${btn('primary')} ${s.invSend}`} onClick={create} disabled={pending}>
            {pending ? 'Creating…' : 'Create template'}
          </button>
        </div>
      </div>
    </Window>
  )
}
