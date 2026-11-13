'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { finishFromRow } from '@/lib/marketing/flow'
import {
  bannerView, celebTeam, focusKey, focusOf, focusSections, headerView, missingOf, missingToast, modalPeople, nextUpView,
  panelView, personName, stripView, type BannerAction, type FlowField, type FlowRow, type FlowTask, type FlowValue,
} from '@/lib/marketing/task-flow-view'
import { shortDay } from '@/lib/marketing/board'
import { officeTime } from '@/lib/office-time'
import TaskFlowBanner from './TaskFlowBanner'
import TaskFlowCelebration from './TaskFlowCelebration'
import TaskFlowHeader from './TaskFlowHeader'
import TaskFlowPanel from './TaskFlowPanel'
import TaskFlowPeople from './TaskFlowPeople'
import TaskFlowSection from './TaskFlowSection'
import TaskFlowSide from './TaskFlowSide'
import TaskFlowStrip from './TaskFlowStrip'
import s from './taskflow.module.css'

// The task page's top (Workflow Builder 2a handoff › 4. Task page — `Task Flow.dc.html`): the header, the role banner,
// the compact workflow strip, the focused stage (its panel, 📋 Requirements in one line, only the sections and fields
// it fills in), and the right column (Next up, Activity). The same component draws a running task (TaskPage) and the
// Builder's ▶ Preview (PreviewTab) — each passes the decisions' handlers. The focus starts on the viewer's own stage and
// goes back there when the viewer changes or the task moves on. The content keeps its height (~540px) so switching
// stages never jumps.

export interface TaskFlowHandlers {
  onValue: (f: FlowField, v: FlowValue, commit: boolean) => void
  onRows: (f: FlowField, rows: FlowRow[], commit: boolean) => void
  onAddCol?: (f: FlowField, name: string, type: string) => void
  onDropCol?: (f: FlowField, col: string) => void
  /** Submit the stage now — `pick` the person picked for a 🔓 next stage. */
  onSubmit: (pick: string | null) => void
  onApprove: () => void
  onChanges: () => void
  onReassign?: (stage: number, person: string, reason: string) => void
  onNudge?: () => void
}

export default function TaskFlow({ task, me, isManager, now, crumbs, requirements, busy = false, say, renderField, fileFilled, celebrate, gif, headExtra, ...h }: TaskFlowHandlers & {
  task: FlowTask
  me: string | null
  isManager: boolean
  now: Date
  crumbs: ReactNode
  /** Its one line, what it opens to, and whether it starts open (minutes that still wait for somebody). */
  requirements: { peek: string; body: ReactNode; open?: boolean }
  busy?: boolean
  /** A toast — the page's own, else this one's. */
  say?: (t: string) => void
  renderField?: (f: FlowField, editable: boolean, bad: boolean) => ReactNode | null
  /** Whether a File field holds a file of its own (a link is its value). */
  fileFilled?: (fieldId: string) => boolean
  /** A new number plays the celebration (the last approval passed). */
  celebrate?: number | null
  /** The template's own GIF, by the bucket's file route. */
  gif?: string | null
  headExtra?: ReactNode
}) {
  const key = focusKey(task, me)
  const [focus, setFocus] = useState<{ key: string; i: number } | null>(null)
  const f = focus && focus.key === key ? focus.i : focusOf(task, me)
  const [reqOpen, setReqOpen] = useState(!!requirements.open)
  const [bad, setBad] = useState<ReadonlySet<string>>(new Set())
  const [modal, setModal] = useState<{ kind: 'reassign' | 'pick'; i: number } | null>(null)
  const [celeb, setCeleb] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const flash = (t: string) => {
    if (say) return say(t)
    setToast(t)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2800)
  }
  // The celebration plays when the page says the last approval passed.
  const [seen, setSeen] = useState<number | null>(null)
  if ((celebrate ?? null) !== seen) {
    setSeen(celebrate ?? null)
    if (celebrate) setCeleb(celebrate)
  }
  // Red borders belong to the submit that found them missing — the stage moved on, they go.
  const [badFor, setBadFor] = useState(key)
  if (badFor !== key) {
    setBadFor(key)
    setBad(new Set())
  }

  const miss = missingOf(task, fileFilled)
  const header = headerView(task, now)
  const view = bannerView(task, me, isManager, now, miss.length)
  // A decision this page has no way to send yet is not offered.
  const banner = { ...view, actions: view.actions.filter(a => (a.key !== 'reassign' || !!h.onReassign) && (a.key !== 'nudge' || !!h.onNudge)) }
  const cards = stripView(task, me, f, now)
  const pv = panelView(task, f, isManager, now)
  const panel = { ...pv, canReassign: pv.canReassign && !!h.onReassign }
  const next = nextUpView(task, now)
  const secs = focusSections(task, f)
  const fin = finishFromRow(task.finish, task.category)
  const planned = task.stages.reduce((a, x) => a + x.sla, 0)
  const doneCount = task.at.done ? task.stages.length : task.at.cur

  const submit = () => {
    if (miss.length) {
      setBad(new Set(miss.map(m => m.id)))
      // The missing fields are the stage now's — show them.
      setFocus({ key, i: task.at.cur })
      return flash(missingToast(miss))
    }
    setBad(new Set())
    const nx = task.stages[task.at.cur + 1]
    if (nx && !nx.doer && nx.cands.length) return setModal({ kind: 'pick', i: task.at.cur + 1 })
    h.onSubmit(null)
  }
  const act = (a: BannerAction) => {
    if (a === 'submit') return submit()
    if (a === 'approve') return h.onApprove()
    if (a === 'changes') return h.onChanges()
    if (a === 'reassign') return setModal({ kind: 'reassign', i: task.at.cur })
    if (a === 'nudge') return h.onNudge?.()
    if (a === 'replay') return setCeleb(Date.now())
  }

  const mStage = modal ? task.stages[modal.i] : null
  return (
    <div className={s.root}>
      <TaskFlowHeader task={task} view={header} crumbs={crumbs} extra={headExtra} />
      <TaskFlowBanner view={banner} busy={busy} onAction={act} />
      <TaskFlowStrip cards={cards} doneCount={doneCount}
        meta={`${task.startOn ? `Started ${shortDay(task.startOn)} · ` : ''}planned ${planned} working days`}
        onFocus={i => setFocus({ key, i })} />
      <div className={s.body}>
        <div className={s.main}>
          <TaskFlowPanel view={panel} total={task.stages.length} onReassign={() => setModal({ kind: 'reassign', i: f })} />
          <div className={s.req}>
            <button type="button" className={s.reqHead} aria-expanded={reqOpen} onClick={() => setReqOpen(o => !o)}>
              <span className={s.reqIcon} aria-hidden="true">📋</span>
              <span className={s.reqTitle}>Requirements</span>
              <span className={s.reqPeek}>{reqOpen ? '' : requirements.peek}</span>
              <span className={s.caret} aria-hidden="true">{reqOpen ? '▲' : '▼'}</span>
            </button>
            {reqOpen ? <div className={s.reqBody}>{requirements.body}</div> : null}
          </div>
          {secs.length ? secs.map(sec => (
            <TaskFlowSection key={sec.id} task={task} sec={sec} me={me} bad={bad} onValue={h.onValue} onRows={h.onRows}
              onAddCol={h.onAddCol} onDropCol={h.onDropCol} renderField={renderField} />
          )) : <div className={s.nothing}>Nothing to fill in at {panel.name}.</div>}
        </div>
        <TaskFlowSide next={next} log={task.log} />
      </div>

      {modal && mStage ? (
        <TaskFlowPeople
          title={modal.kind === 'pick' ? `Who does ${mStage.name}?` : `Reassign Stage ${modal.i + 1} · ${mStage.name}`}
          sub={modal.kind === 'pick'
            ? 'You’re handing off. Pick from the shortlist — they’re notified right away.'
            : `${mStage.doer ? `Now with ${personName(task, mStage.doer)}. ` : ''}The new person is notified${mStage.doer ? `; ${personName(task, mStage.doer)} is told it moved` : ''}.`}
          people={modalPeople(task, modal.i, modal.kind)}
          onClose={() => setModal(null)}
          askReason={modal.kind === 'reassign'}
          onPick={(id, reason) => {
            const m = modal
            setModal(null)
            if (m.kind === 'pick') h.onSubmit(id)
            else if (id !== task.stages[m.i]?.doer) h.onReassign?.(m.i, id, reason)
          }}
        />
      ) : null}
      {celeb ? (
        <TaskFlowCelebration kind={fin.celebration} gif={gif ?? null} category={task.category}
          finished={task.doneAt ? officeTime(task.doneAt).format('D MMM') : null} team={celebTeam(task)} onClose={() => setCeleb(null)} />
      ) : null}
      {toast ? <div className={s.toast} role="status">{toast}</div> : null}
    </div>
  )
}
