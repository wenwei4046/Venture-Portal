'use client'

import { useState, useTransition } from 'react'
import { setMktRunDay } from '@/lib/marketing/actions'
import { runsLine, type ProductProjectPage } from '@/lib/marketing/project'
import { ordinal } from '@/lib/marketing/task'
import p from './project.module.css'

// A recurring product project's months (②b-2f — the user's answer 12: a recurring product picks its run day): its line —
// every month on its run day, the next one, or the month it ended — and, the manager's, the day moved for the months not
// made yet.

export const RUN_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

export default function RunDay({ page, manage, onPage, say }: {
  page: ProductProjectPage
  manage: boolean
  onPage: (page: ProductProjectPage) => void
  say: (words: string) => void
}) {
  const runs = page.project.runs
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState(runs?.day ?? 1)
  const [pending, start] = useTransition()
  if (!runs) return null
  const movable = manage && !runs.until && page.project.status === 'active'
  const save = () =>
    start(async () => {
      const r = await setMktRunDay(page.project.id, day)
      if (!r.ok) return say(r.reason)
      if (r.page) onPage(r.page)
      setEditing(false)
      say(`Every month on the ${ordinal(day)}`)
    })
  return (
    <div className={p.runLine} aria-label="Monthly run">
      <span className={p.wait}>{runsLine(runs)}</span>
      {movable && !editing ? (
        <button type="button" className={p.textBtn} onClick={() => { setDay(runs.day); setEditing(true) }}>Change day</button>
      ) : null}
      {editing ? (
        <span className={p.runEdit}>
          <select className={p.input} value={day} aria-label="Run day" onChange={e => setDay(Number(e.target.value))}>
            {RUN_DAYS.map(d => <option key={d} value={d}>{ordinal(d)}</option>)}
          </select>
          <button type="button" className={p.ghost} disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className={p.primary} disabled={pending || day === runs.day} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
        </span>
      ) : null}
    </div>
  )
}
