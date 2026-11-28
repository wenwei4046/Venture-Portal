'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { sameAnswer, togglePick, type OptionLists } from '@/lib/marketing/options'
import type { MktTaskPage } from '@/lib/marketing/task'
import { flowFromPage } from '@/lib/marketing/task-flow-page'
import type { FlowValue } from '@/lib/marketing/task-flow-view'
import type { AppMay } from '@/lib/mkt-app/model'
import { readOptionListsNow, readTaskNow } from '@/lib/mkt-app/read'
import { labelOf, missingWords, taskScreenView, workValue, type FieldView } from '@/lib/mkt-app/task-view'
import { Pill } from '../kit'
import s from '../mkt-app.module.css'

// The task page, pushed over the tabs (`Marketing App iOS + Android.dc.html` › Task): read from the browser when it is
// opened (the person's own move — lib/mkt-app/read.ts), drawn by lib/mkt-app/task-view.ts, every step the desktop task
// page's own Server Action (lib/marketing/actions.ts): a field saved as it is left (only what changed), Submit for
// approval or Complete stage, Approve / Request changes, a delivery reviewed, 🔔 Nudge.

export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }
type PageDone = Done<{ page: MktTaskPage | null }>

export interface TaskActions {
  saveWork: (project: string, work: { vals: Record<string, string | boolean | string[] | null> }) => Promise<Done<{ missing: string[] }>>
  submit: (project: string, pick?: string | null) => Promise<PageDone>
  decide: (project: string, approve: boolean, reason?: string) => Promise<PageDone>
  review: (project: string, subtask: string, approve: boolean, reason?: string) => Promise<PageDone>
  nudge: (project: string) => Promise<Done<{ who: string; already: boolean }>>
}

export interface TaskScreenProps {
  taskKey: string
  may: AppMay
  actions: TaskActions
  say: (text: string) => void
  /** A step taken: back to the list, read again (the prototype's afterAct). */
  onDone: () => void
  onBack: () => void
  /** The Request changes sheet: who it goes back to; answers the refusal in words, or null once sent. */
  askReason: (to: string, send: (reason: string) => Promise<string | null>) => void
  /** The 🔓 handoff's picker: who takes the next stage. */
  askPick: (stage: string, people: { id: string; name: string; role: string }[], pick: (id: string) => void) => void
}

const empty = (t: string): FlowValue => (t === 'Multi-select' ? [] : t === 'Checkbox' ? false : '')
const firstOf = (name: string) => name.split(/\s+/)[0] || name

export default function TaskScreen(p: TaskScreenProps) {
  const [page, setPage] = useState<MktTaskPage | null | undefined>(undefined)
  const [lists, setLists] = useState<OptionLists>({})
  const [typed, setTyped] = useState<Record<string, FlowValue>>({})
  const [bad, setBad] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [nudged, setNudged] = useState(false)
  // The moment the page was read: what is late, and by how much, as of then.
  const [now, setNow] = useState(() => new Date())
  const saved = useRef<Record<string, FlowValue>>({})
  const saving = useRef<Promise<unknown>[]>([])

  useEffect(() => {
    let live = true
    void readTaskNow(p.taskKey).then(pg => {
      if (!live) return
      setPage(pg)
      setNow(new Date())
      // A choice naming a shared list (③d-2) offers that list's options.
      if (pg?.stages.some(st => st.form.some(f => f.list))) void readOptionListsNow().then(l => { if (live && l) setLists(l) })
    })
    return () => { live = false }
  }, [p.taskKey])

  // What the stage holds as saved — the baseline a change is sent against.
  const baseline = useMemo(() => (page ? flowFromPage(page).values : {}), [page])
  useEffect(() => { saved.current = { ...baseline } }, [baseline])

  const v = useMemo(() => (page ? taskScreenView(page, p.may, now, typed, lists) : null), [page, p.may, now, typed, lists])

  if (page === undefined) return <Shell title="Task" onBack={p.onBack}><div className={s.loading}>…</div></Shell>
  if (page === null || !v) return <Shell title="Task" onBack={p.onBack}><div className={s.emptyTall}>This task is not there any more.</div></Shell>

  const project = v.projectId
  const set = (f: FieldView, value: FlowValue) => {
    setTyped(t => ({ ...t, [f.id]: value }))
    setBad(b => b.filter(x => x !== f.id))
  }
  /** A field left: sent when it differs from what is saved — only that one (a cleared one as null). */
  const save = (f: FieldView, value: FlowValue = typed[f.id] ?? f.value) => {
    if (sameAnswer(value, saved.current[f.id] ?? empty(f.type))) return
    const job = p.actions.saveWork(project, { vals: { [labelOf(f.id)]: workValue(value) } }).then(r => {
      if (r.ok) saved.current[f.id] = value
      else p.say(r.reason)
    })
    saving.current.push(job)
    void job.finally(() => { saving.current = saving.current.filter(j => j !== job) })
  }
  const flush = async () => {
    for (const f of v.fields) if (f.edit && f.id in typed) save(f, typed[f.id])
    await Promise.all(saving.current)
  }

  const finish = (r: PageDone, words: string) => {
    setBusy(false)
    if (!r.ok) return p.say(r.reason)
    p.say(words)
    p.onDone()
  }

  const submit = async () => {
    if (busy) return
    await flush()
    const miss = missingWords(page, typed)
    if (miss) {
      setBad(miss.ids)
      return p.say(miss.text)
    }
    const send = (pick: string | null) => {
      setBusy(true)
      const levels = page.stages[page.project.cur]?.levels ?? []
      const product = page.project.kind === 'deliverable' || page.project.kind === 'product'
      void p.actions.submit(project, pick).then(r => finish(r, levels.length
        ? `Submitted · ${v.approvers.join(' or ') || 'the approver'} is told`
        : `Stage complete · +${product ? 20 : 10} XP · +1 snack`))
    }
    if (v.pick) return p.askPick(v.pick.stage, v.pick.people, id => send(id))
    send(null)
  }

  const doerName = v.doer || 'them'
  const decide = (approve: boolean) => {
    if (busy) return
    if (approve) {
      setBusy(true)
      void p.actions.decide(project, true).then(r => finish(r, `Approved · ${doerName} is told`))
      return
    }
    p.askReason(`Back to ${doerName} · ${v.title}`, async reason => {
      const r = await p.actions.decide(project, false, reason)
      if (!r.ok) return r.reason
      p.say(`Changes requested · back to ${doerName}`)
      p.onDone()
      return null
    })
  }

  const review = (approve: boolean) => {
    const d = v.delivery
    if (!d || busy) return
    if (approve) {
      setBusy(true)
      void p.actions.review(project, d.id, true).then(r => finish(r, `Approved · ${firstOf(d.who)} is told`))
      return
    }
    p.askReason(`Back to ${firstOf(d.who)} · ${d.title}`, async reason => {
      const r = await p.actions.review(project, d.id, false, reason)
      if (!r.ok) return r.reason
      p.say(`Sent back to ${firstOf(d.who)}`)
      p.onDone()
      return null
    })
  }

  const nudge = () => {
    if (nudged || busy || !v.nudge) return
    setBusy(true)
    void p.actions.nudge(project).then(r => {
      setBusy(false)
      if (!r.ok) return p.say(r.reason)
      setNudged(true)
      p.say(r.already ? `${r.who} was nudged within the hour` : `Nudged ${r.who}`)
    })
  }

  const bar = !v.done && (v.submit || v.decide || v.delivery || v.nudge)
  return (
    <Shell title="Task" onBack={p.onBack}>
      <div className={s.scroll}>
        <div className={s.taskBody}>
          <div className={s.taskTop}>
            <div className={s.taskTrack}>
              <span className={s.trackId}>{v.trackId}</span>
              <Pill tone={v.status.tone} text={v.status.label} size="task" />
            </div>
            <h2 className={s.taskTitle}>{v.title}</h2>
          </div>
          <div className={s.facts}>
            {v.facts.map(f => (
              <div key={f.k}>
                <div className={s.factK}>{f.k}</div>
                <div className={s.factV} data-red={f.red ? 'true' : 'false'}>{f.v}</div>
              </div>
            ))}
          </div>
          <div className={s.banner} data-tone={v.banner.tone}>
            <span className={s.bannerIcon}>{v.banner.icon}</span>
            <div className={s.grow}>
              <div className={s.bannerTitle}>{v.banner.title}</div>
              {v.banner.text ? <div className={s.bannerText}>{v.banner.text}</div> : null}
            </div>
          </div>
          {v.strip.length ? (
            <div style={{ flex: 'none' }}>
              <div className={`${s.label} ${s.label10} ${s.stripHead}`}>{v.stripHead}</div>
              <div className={s.strip}>
                {v.strip.map(k => (
                  <div key={k.idx} className={s.stage} data-state={k.state} data-at={k.state === 'cur' || k.state === 'late' ? 'true' : 'false'}>
                    <div className={s.stageBar} />
                    <div className={s.stageIn}>
                      <div className={s.stageTop}>
                        <span className={s.stageNum}>{k.mark}</span>
                        <span className={s.stageName}>{k.name}</span>
                      </div>
                      <div className={s.stageWho}>{k.who}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {v.stage && v.fields.length ? (
            <div className={s.fields} data-mine={v.mine ? 'true' : 'false'}>
              <div className={s.fieldsHead}>
                <span className={s.fieldsTitle}>{v.stage}</span>
                {v.fill ? <span className={s.fieldsFill} data-done={v.fill.done ? 'true' : 'false'}>{v.fill.text}</span> : null}
              </div>
              {v.fields.map(f => (
                <div key={f.id}>
                  <div className={s.fLabel}>{f.label}{f.req ? <span className={s.req}> *</span> : null}</div>
                  {f.edit ? (
                    <FieldInput f={f} bad={bad.includes(f.id)} onSet={value => set(f, value)} onSave={value => save(f, value)} />
                  ) : (
                    <div className={s.roText} data-empty={f.filled ? 'false' : 'true'}>{f.filled ? f.display : 'Not filled in yet'}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {bar ? (
        <div className={s.bar}>
          {v.nextLine ? <div className={s.barLine}>{v.nextLine}</div> : null}
          <div className={s.barRow}>
            {v.delivery ? (
              <>
                <button type="button" className={s.btn} disabled={busy} onClick={() => review(false)}>Request changes</button>
                <button type="button" className={s.btn} data-kind="primary" disabled={busy} onClick={() => review(true)}>Approve</button>
              </>
            ) : null}
            {!v.delivery && v.decide ? (
              <>
                <button type="button" className={s.btn} disabled={busy} onClick={() => decide(false)}>Request changes</button>
                <button type="button" className={s.btn} data-kind="primary" disabled={busy} onClick={() => decide(true)}>Approve</button>
              </>
            ) : null}
            {v.submit ? (
              <button type="button" className={s.btn} data-kind="primary" data-busy={busy ? 'true' : 'false'} disabled={busy} onClick={() => void submit()}>{v.submit}</button>
            ) : null}
            {v.nudge && !v.decide && !v.submit && !v.delivery ? (
              <button type="button" className={s.btn} data-off={nudged ? 'true' : 'false'} disabled={busy} onClick={nudge}>{nudged ? `Nudged ${v.nudge}` : `🔔 Nudge ${v.nudge}`}</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Shell>
  )
}

/** A field the doer fills in: words, a number, a day, a choice or several, a tick. Saved as it is left. */
function FieldInput({ f, bad, onSet, onSave }: { f: FieldView; bad: boolean; onSet: (v: FlowValue) => void; onSave: (v: FlowValue) => void }) {
  if (f.type === 'Checkbox') {
    const on = f.value === true
    return (
      <button type="button" className={s.checkRow} aria-pressed={on} onClick={() => { onSet(!on); onSave(!on) }}>
        <span className={s.checkBox} data-on={on ? 'true' : 'false'}>{on ? '✓' : ''}</span>
        <span>{on ? 'Yes' : 'No'}</span>
      </button>
    )
  }
  if (f.type === 'Multi-select') {
    const picks = Array.isArray(f.value) ? f.value : []
    return (
      <div className={s.chips} data-bad={bad ? 'true' : 'false'}>
        {f.options.map(o => (
          <button key={o} type="button" className={s.chip} data-on={picks.includes(o) ? 'true' : 'false'}
            onClick={() => { const next = togglePick(picks, o, f.options); onSet(next); onSave(next) }}>{o}</button>
        ))}
        {f.options.length ? null : <span className={s.roText} data-empty="true">No options yet</span>}
      </div>
    )
  }
  if (f.type === 'Select') {
    const value = typeof f.value === 'string' ? f.value : ''
    return (
      <select className={s.input} data-bad={bad ? 'true' : 'false'} value={value} aria-label={f.label}
        onChange={e => { onSet(e.target.value); onSave(e.target.value) }}>
        <option value="">Choose…</option>
        {f.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  const value = typeof f.value === 'string' ? f.value : ''
  const type = f.type === 'Number' ? 'number' : f.type === 'Date' ? 'date' : 'text'
  return (
    <input className={`${s.input}${f.type === 'Number' ? ` ${s.inputMono}` : ''}`} data-bad={bad ? 'true' : 'false'} type={type} value={value}
      inputMode={f.type === 'Number' ? 'decimal' : undefined} aria-label={f.label}
      placeholder={f.type === 'Date' ? undefined : f.type === 'Number' ? '0.00' : 'Type here or paste a link'}
      onChange={e => onSet(e.target.value)} onBlur={e => onSave(e.target.value)} />
  )
}

/** A pushed screen's head — ‹ back, its title, a line at its right — and its body. */
export function Shell({ title, sub, onBack, children }: { title: string; sub?: string; onBack: () => void; children: ReactNode }) {
  return (
    <>
      <div className={s.pushHead}>
        <button type="button" className={s.back} onClick={onBack} aria-label="Back">‹</button>
        <span className={s.pushTitle}>{title}</span>
        {sub ? <span className={s.pushSub}>{sub}</span> : null}
      </div>
      <div className={s.pushBody}>{children}</div>
    </>
  )
}
