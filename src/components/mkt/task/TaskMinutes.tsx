'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { fillMktTaskMinutes, signMktTaskMinutes } from '@/lib/marketing/actions'
import { fillPatch, type MinutesDoc, type MinutesEdit, type MinutesValue } from '@/lib/marketing/project'
import { nameOf, type MktTaskPage, type TaskViewer } from '@/lib/marketing/task'
import { minutesState } from '@/lib/marketing/task-minutes'
import MinutesForm from '../project/MinutesForm'
import s from './task.module.css'

// A task's meeting minutes on its page (②a-3 — the user's answers 52–55): its requirements, from the template it was written
// with on New Project — each field as written, the attendees' signatures (each signs here; the last one completes them), the
// meeting notes. Its owner, or a manager, writes them on while they are not locked, saved as typed (only what changed, on the
// minutes the page last saw — never over another's save); everybody else reads them. A run reads its series'.

type SaveState = { state: 'saved' | 'saving' } | { state: 'error'; reason: string; stale: boolean }

const editOf = (doc: MinutesDoc): MinutesEdit => ({ vals: doc.vals, notes: doc.notes, pic: '', whatsapp: '', pic2: '', whatsapp2: '' })

export default function TaskMinutes({ page, doc, can, source, onPage, say }: {
  page: MktTaskPage
  doc: MinutesDoc
  can: TaskViewer
  /** Where the requirements come from — the template and whose. */
  source: string
  onPage: (next: MktTaskPage | null) => void
  say: (words: string) => void
}) {
  const p = page.project
  const [pending, start] = useTransition()
  const writes = (can.manage || (can.edit && !!page.me && p.owner === page.me)) && !doc.locked && p.status !== 'done' && p.status !== 'cancelled'

  // What is typed, kept over a fresh page until it is saved; taken from the page again when its minutes move on (signed,
  // completed, locked).
  const docKey = `${doc.id}:${doc.status}:${doc.locked}`
  const [editFor, setEditFor] = useState(docKey)
  const [edit, setEdit] = useState<MinutesEdit>(() => editOf(doc))
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const editRef = useRef(edit)
  const savedRef = useRef(edit)
  const revRef = useRef(doc.rev)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  if (editFor !== docKey) {
    setEditFor(docKey)
    const next = editOf(doc)
    setEdit(next)
    editRef.current = next
    savedRef.current = next
    revRef.current = doc.rev
  }

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const now = editRef.current
      const patch = fillPatch(savedRef.current, now, false)
      if (!patch) {
        setSave(x => (x.state === 'error' ? x : { state: 'saved' }))
        return true
      }
      setSave({ state: 'saving' })
      const r = await fillMktTaskMinutes(doc.id, p.id, revRef.current, patch)
      if (!r.ok) {
        setSave({ state: 'error', reason: r.reason, stale: /since you opened them/.test(r.reason) })
        return false
      }
      revRef.current = r.rev
      savedRef.current = now
      if (editRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [doc.id, p.id])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || fillPatch(savedRef.current, editRef.current, false)) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
    }
  }, [flush])

  const change = (next: MinutesEdit) => {
    editRef.current = next
    setEdit(next)
    if (save.state === 'error' && save.stale) return
    setSave({ state: 'saving' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }
  const setVal = (name: string, v: MinutesValue | undefined) => {
    const vals = { ...editRef.current.vals }
    if (v === undefined) delete vals[name]
    else vals[name] = v
    change({ ...editRef.current, vals })
  }

  // Signed — what is typed kept first; the last signature completes them.
  const sign = () =>
    start(async () => {
      if (!(await flush())) return say('Not saved — reload before signing')
      const r = await signMktTaskMinutes(doc.id, p.id)
      if (!r.ok) return say(r.reason)
      onPage(r.page)
      say(r.page?.minutes?.status === 'completed' ? 'Signed · the minutes are complete' : 'Signed')
    })

  const stale = save.state === 'error' && save.stale
  const readOnly = !writes || pending || stale
  const state = minutesState({ ...doc, vals: edit.vals }, id => nameOf(page.team, id))

  return (
    <div>
      <div className={s.secHead}>
        <span className={s.secIcon} aria-hidden="true">📋</span>
        <span className={s.secTitle}>Requirements</span>
        {doc.locked ? <span className={s.tag}>🔒 Locked</span> : null}
        <span className={`${s.pill} ${state.done ? s.done : s.waiting}`}><span className={s.pillDot} aria-hidden="true" />{state.label}</span>
        {writes || stale ? (
          save.state === 'error' ? (
            <span className={s.minutesNotSaved} role="alert">
              Not saved · {save.reason}
              {save.stale ? <button type="button" className={s.minutesReload} onClick={() => window.location.reload()}>Reload</button> : null}
            </span>
          ) : <span className={s.minutesSaved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
        ) : null}
      </div>
      <div className={`${s.req} ${s.reqMinutes}`}>
        <div className={s.reqSource}>{source}</div>
        <MinutesForm doc={doc} vals={edit.vals} track={p.trackId} title={p.title} team={page.team} me={can.edit ? page.me : null}
          readOnly={readOnly} onVal={setVal} onSign={sign} signing={pending} />
        {writes || edit.notes.trim() ? (
          <label className={s.minutesNotes}>
            <span className={s.minutesNotesLabel}>Meeting notes <span title="Internal only — the PIC never sees it">🔒</span></span>
            {writes ? (
              <textarea className={s.minutesNotesBox} rows={3} value={edit.notes} maxLength={4000} readOnly={readOnly} aria-label="Meeting notes"
                onChange={e => change({ ...editRef.current, notes: e.target.value })} />
            ) : <span className={s.reqText}>{edit.notes}</span>}
          </label>
        ) : null}
      </div>
    </div>
  )
}
