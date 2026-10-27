'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Window } from '@/components/hrv/overlay'
import { listViewablePeople, setViewAsPerson, type ViewablePerson } from './view-as-actions'
import s from './view-as-person.module.css'

/**
 * View as a person — the picker (2026-10-11, the user: "can set a function is
 * view as a user, same like in revenue app, i can view as a member"). Everybody
 * who signs in to the portal, by department; picking one draws the portal as
 * they see it, read-only, until Stop viewing. `z`: the scrim's layer — above
 * the phone apps' own layers where they open it (2026-10-27: every switcher).
 */
export default function ViewAsPersonPicker({ open, onClose, z = 40 }: { open: boolean; onClose: () => void; z?: number }) {
  const [people, setPeople] = useState<ViewablePerson[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || people) return
    let live = true
    void listViewablePeople().then(result => {
      if (!live) return
      if (result.ok) setPeople(result.people)
      else setError(result.reason)
    })
    return () => {
      live = false
    }
  }, [open, people])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const shown = (people ?? []).filter(p =>
      !q || [p.name, p.email, p.title ?? '', p.department ?? ''].some(v => v.toLowerCase().includes(q)))
    const by = new Map<string, ViewablePerson[]>()
    for (const p of shown) {
      const key = p.department ?? 'No department'
      by.set(key, [...(by.get(key) ?? []), p])
    }
    return [...by]
  }, [people, query])

  function view(person: ViewablePerson) {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('person', person.id)
      const result = await setViewAsPerson(fd)
      if (result && !result.ok) setError(result.reason)
    })
  }

  return (
    <Window open={open} onClose={onClose} width={480} scrim={0.22} z={z} label="View as a person" style={{ padding: 22, borderRadius: 14 }}>
      <div className={s.picker}>
        <h2 className={s.title}>View as a person</h2>
        <p className={s.lede}>See the portal exactly as they do — their pages, menus and buttons. Read-only: nothing you press is saved.</p>
        <input
          className={s.search}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a name, title or department"
          aria-label="Search people"
          autoFocus
        />
        {error ? <p className={s.error} role="alert">{error}</p> : null}
        <div className={s.list}>
          {people === null && !error ? <p className={s.note}>Loading…</p> : null}
          {people !== null && groups.length === 0 ? <p className={s.note}>Nobody matches.</p> : null}
          {groups.map(([department, list]) => (
            <div key={department}>
              <div className={s.band}>{department}</div>
              {list.map(p => (
                <button key={p.id} type="button" className={s.row} disabled={pending} onClick={() => view(p)}>
                  <span className={s.name}>{p.name}</span>
                  <span className={s.meta}>{[p.title, p.email].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Window>
  )
}
