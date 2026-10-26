'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { fillMktTaskMinutes, overrideMktTask, resendMktTask, sendMktTaskMinutes, signMktTaskMinutes, type Done } from '@/lib/marketing/actions'
import { fillPatch, requiredTally, sendProblems, type MinutesDoc, type MinutesEdit, type MinutesValue } from '@/lib/marketing/project'
import { nameOf, picWaits, type MktTaskPage, type TaskPicMinutes, type TaskViewer } from '@/lib/marketing/task'
import { minutesState, picWho } from '@/lib/marketing/task-minutes'
import MinutesForm from '../project/MinutesForm'
import TaskPicCard from './TaskPicCard'
import s from './task.module.css'

// A task's meeting minutes on its page (②a-3 — the user's answers 52–55): its requirements, from the template it was written
// with on New Project — each field as written, the attendees' signatures (each signs here; the last one completes them), the
// meeting notes. Its owner, or a manager, writes them on while they are not locked, saved as typed (only what changed, on the
// minutes the page last saw — never over another's save); everybody else reads them. A run reads its series'. The PIC
// approving them (②a-4): their card above the minutes — the PICs saved with the minutes, sent, resent, started before.

type SaveState = { state: 'saved' | 'saving' } | { state: 'error'; reason: string; stale: boolean }

const editOf = (doc: MinutesDoc, pm: TaskPicMinutes | null): MinutesEdit => ({
  vals: doc.vals, notes: doc.notes, pic: pm?.pic ?? '', whatsapp: pm?.whatsapp ?? '', pic2: pm?.pic2 ?? '', whatsapp2: pm?.whatsapp2 ?? '',
})

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
  const pm = p.picMinutes
  const [pending, start] = useTransition()
  const mineToWrite = can.manage || (can.edit && !!page.me && p.owner === page.me)
  const writes = mineToWrite && !doc.locked && p.status !== 'done' && p.status !== 'cancelled'
  // The minutes' own project — a run's are its series' (the PIC's approval is the series').
  const holder = p.series ?? p.id

  // What is typed, kept over a fresh page until it is saved; taken from the page again when its minutes move on (signed,
  // completed, locked, sent to the PIC).
  const docKey = `${doc.id}:${doc.status}:${doc.locked}:${pm?.status ?? ''}`
  const [editFor, setEditFor] = useState(docKey)
  const [edit, setEdit] = useState<MinutesEdit>(() => editOf(doc, pm))
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const editRef = useRef(edit)
  const savedRef = useRef(edit)
  const revRef = useRef(doc.rev)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  if (editFor !== docKey) {
    setEditFor(docKey)
    const next = editOf(doc, pm)
    setEdit(next)
    editRef.current = next
    savedRef.current = next
    revRef.current = doc.rev
  }
  // Its PICs go with the minutes only when the PIC approves them.
  const withPic = !!pm
  // The page's own answers, as they last were — the save keeps one identity, so a pending one is not sent early.
  const hooks = useRef({ onPage, say })
  useEffect(() => {
    hooks.current = { onPage, say }
  })

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const now = editRef.current
      const patch = fillPatch(savedRef.current, now, withPic)
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
      // Back with the PIC because they see what changed — or the second PIC's link made or gone: the task as it stands.
      if (r.page) hooks.current.onPage(r.page)
      if (r.reapproval) hooks.current.say(`Changed after approval · back to ${picWho({ pic: now.pic, pic2: now.pic2 })}`)
      if (editRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [doc.id, p.id, withPic])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || fillPatch(savedRef.current, editRef.current, withPic)) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
    }
  }, [flush, withPic])

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

  // Each step saves what is typed first, then answers with the task as it now stands.
  const act = (run: () => Promise<Done<{ page: MktTaskPage | null }>>, done: (next: MktTaskPage | null) => string) =>
    new Promise<boolean>(resolve => start(async () => {
      if (!(await flush())) {
        say('Not saved — reload before going on')
        return resolve(false)
      }
      const r = await run()
      if (!r.ok) {
        say(r.reason)
        return resolve(false)
      }
      onPage(r.page)
      say(done(r.page))
      resolve(true)
    }))
  // Signed — what is typed kept first; the last signature completes them (unless the PIC approves them).
  const sign = () => void act(() => signMktTaskMinutes(doc.id, p.id), next => (next?.minutes?.status === 'completed' ? 'Signed · the minutes are complete' : 'Signed'))
  const who = picWho({ pic: edit.pic, pic2: edit.pic2 })
  const send = () => void act(() => sendMktTaskMinutes(doc.id, p.id, revRef.current), () => `Tracking link ready · share it with ${who}`)
  const resend = () => void act(() => resendMktTask(holder), () => `Resent to ${who}`)
  const override = (reason: string) => act(() => overrideMktTask(holder, reason), () => 'Started before approval · the work starts today')

  const stale = save.state === 'error' && save.stale
  const readOnly = !writes || pending || stale
  const live = { ...doc, vals: edit.vals }
  const state = minutesState(live, id => nameOf(page.team, id), pm)
  // To the PIC the WhatsApp is always asked: the task chose the PIC (mkt_minutes_send).
  const toPic = { ...live, template: { ...live.template, rules: { ...live.template.rules, pic: true } } }
  const pics = { name: edit.pic, whatsapp: edit.whatsapp, name2: edit.pic2, whatsapp2: edit.whatsapp2 }

  return (
    <div>
      <div className={s.secHead}>
        <span className={s.secIcon} aria-hidden="true">📋</span>
        <span className={s.secTitle}>Requirements</span>
        {doc.locked ? <span className={s.tag}>🔒 Locked</span> : null}
        <span className={`${s.pill} ${state.done ? s.done : state.red ? s.red : s.waiting}`}><span className={s.pillDot} aria-hidden="true" />{state.label}</span>
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
        {pm ? (
          <TaskPicCard page={page} pm={pm} edit={edit} readOnly={readOnly || !picWaits(pm)} sends={mineToWrite} manage={can.manage}
            problems={sendProblems(toPic, pics, page.team)} tally={requiredTally(toPic, edit.vals, pics)} pending={pending}
            onChange={next => change({ ...editRef.current, ...next })} onSend={send} onResend={resend} onOverride={override} say={say} />
        ) : null}
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
