'use client'

import { useState, useTransition } from 'react'
import { pauseMktProduct, setMktRunDay } from '@/lib/marketing/actions'
import { resumedWords, runsLine, type ProductProjectPage } from '@/lib/marketing/project'
import { ordinal } from '@/lib/marketing/task'
import p from './project.module.css'
import t from '../task/task.module.css'

// A recurring product project's months (②b-2f — the user's answer 12: a recurring product picks its run day): its line —
// every month on its run day, the next one, or the month it ended — and, the manager's, the day moved for the months not
// made yet; Pause (②b-2g — no month's work while it is paused, the work made carries on, still billed: answer 51),
// asked first, and Resume (from this month — a month whose run day came while it was paused left out).

export const RUN_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

export default function RunDay({ page, manage, onPage, say }: {
  page: ProductProjectPage
  manage: boolean
  onPage: (page: ProductProjectPage) => void
  say: (words: string) => void
}) {
  const runs = page.project.runs
  const status = page.project.status
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState(runs?.day ?? 1)
  const [pausing, setPausing] = useState(false)
  const [pending, start] = useTransition()
  if (!runs) return null
  // Running or paused, not stopped: its months are the manager's to move, pause and resume.
  const open = manage && !runs.until && (status === 'active' || status === 'paused')
  const save = () =>
    start(async () => {
      const r = await setMktRunDay(page.project.id, day)
      if (!r.ok) return say(r.reason)
      if (r.page) onPage(r.page)
      setEditing(false)
      say(`Every month on the ${ordinal(day)}`)
    })
  const pause = (to: boolean) =>
    start(async () => {
      const r = await pauseMktProduct(page.project.id, to)
      if (!r.ok) return say(r.reason)
      if (r.page) onPage(r.page)
      setPausing(false)
      say(to ? 'Paused · no month’s work until it is resumed' : resumedWords(runs, r.page?.project.runs ?? null))
    })
  return (
    <div className={p.runLine} aria-label="Monthly run">
      <span className={p.wait}>{runsLine(runs, status === 'paused')}</span>
      {open && !editing ? (
        <button type="button" className={p.textBtn} onClick={() => { setDay(runs.day); setEditing(true) }}>Change day</button>
      ) : null}
      {open && !editing ? (
        status === 'paused'
          ? <button type="button" className={p.textBtn} disabled={pending} onClick={() => pause(false)}>{pending ? 'Resuming…' : 'Resume'}</button>
          : <button type="button" className={p.textBtn} disabled={pending} onClick={() => setPausing(true)}>Pause…</button>
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

      {pausing ? (
        <div className={t.scrim} onClick={() => !pending && setPausing(false)}>
          <div className={t.dialog} role="dialog" aria-modal="true" aria-label={`Pause ${page.project.title}`} onClick={e => e.stopPropagation()}>
            <div>
              <div className={t.dialogTitle}>Pause {page.project.title}?</div>
              <div className={t.dialogSub}>No month’s work is made while it is paused · work under way carries on · still billed every month</div>
            </div>
            <div className={t.dialogBtns}>
              <button type="button" className={t.dialogBtn} onClick={() => setPausing(false)} disabled={pending}>Cancel</button>
              <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending} onClick={() => pause(true)}>{pending ? 'Pausing…' : 'Pause'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
