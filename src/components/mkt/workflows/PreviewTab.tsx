'use client'

import { useMemo, useState } from 'react'
import { PIC_ID, turnOf } from '@/lib/marketing/flow'
import { sampleStep, sampleTask, type PreviewDraft } from '@/lib/marketing/task-flow-sample'
import { celebTeam, flowStages, hueOf, picView, type FlowPerson, type FlowTask } from '@/lib/marketing/task-flow-view'
import TaskFlow from '../task/TaskFlow'
import TaskFlowAvatar from '../task/TaskFlowAvatar'
import TaskFlowCelebration from '../task/TaskFlowCelebration'
import TaskFlowPic from '../task/TaskFlowPic'
import s from '../task/taskflow.module.css'

// The Builder's ▶ Preview (Workflow Builder 2a handoff › "the ▶ Preview tab shows the Task page built from the current
// draft, without publishing"): the task page's top drawn from a SAMPLE task made from the draft — nothing is published,
// nothing saved. At the foot, view it as each person on it, as the manager, or as the PIC on the link; every decision is
// played with flow.ts's `step`, as the database decides. ⏩ +1 day moves the clock (late stages turn red), ▶ acts as
// whoever's turn it is, Reset starts the sample again.

const MM = 'preview-mm'
const DAY = 864e5

export interface PreviewPerson {
  id: string
  first: string
  /** Their group (a title) — shown as the role. */
  group?: string
  /** Tasks they have open now ("{n} active" in the reassign modal). */
  load?: number
}

export default function PreviewTab({ draft, people = [] }: { draft: PreviewDraft; people?: readonly PreviewPerson[] }) {
  const roster: FlowPerson[] = useMemo(() => people.map(p => ({ id: p.id, name: p.first, role: p.group ?? '', load: p.load ?? 0 })), [people])
  const sig = JSON.stringify([draft, roster.map(p => p.id)])
  const [state, setState] = useState(() => fresh(sig, draft, roster))
  const [celebrate, setCelebrate] = useState<number | null>(null)
  // The PIC's view has no task page under it: the celebration is drawn here.
  const [picCeleb, setPicCeleb] = useState<number | null>(null)
  // The draft changed: a new sample from it.
  if (state.sig !== sig) setState({ sig, offset: state.offset, task: sampleTask(draft, roster, new Date(Date.now() + state.offset)), viewer: state.viewer })
  const now = new Date(Date.now() + state.offset)
  const task = state.task
  const actors = turnActors(task)
  const viewer = state.viewer || actors[0] || task.stages[task.at.cur]?.doer || MM
  const isPic = viewer === PIC_ID
  const isMM = viewer === MM
  const me = isMM ? MM : viewer

  const put = (next: FlowTask) => {
    if (next.at.done && !task.at.done) (isPic ? setPicCeleb : setCelebrate)(Date.now())
    setState(st => ({ ...st, task: next }))
  }
  const decide = (what: 'submit' | 'approve' | 'changes', by: string, pick: string | null = null) => put(sampleStep(task, what, by, now, pick))

  const onTask = [...new Set(task.stages.flatMap(x => [x.doer, ...x.cands, ...x.levels.flatMap(l => l.ids)]).filter((x): x is string => !!x && x !== PIC_ID))]
  const viewers = [...onTask.slice(0, 6).map(id => ({ id, label: task.people.find(p => p.id === id)?.name ?? '—', init: (task.people.find(p => p.id === id)?.name ?? '?').charAt(0) })),
    { id: MM, label: 'MM', init: 'M' }, { id: PIC_ID, label: 'PIC link', init: '🔗' }]

  return (
    <div className={s.previewCard}>
      {isPic ? (
        <TaskFlowPic view={picView(task, now)} title={task.title} sub="Houzs Marketing · tracking link (sample)"
          answer={(
            <>
              <button type="button" className={s.picBtn} onClick={() => decide('changes', PIC_ID)}>Request changes</button>
              <button type="button" className={`${s.picBtn} ${s.picBtnPrimary}`} onClick={() => decide('approve', PIC_ID)}>Approve</button>
            </>
          )} />
      ) : (
        <TaskFlow
          task={task}
          me={me}
          isManager={isMM}
          now={now}
          crumbs={<><span>← My Space</span><span>/</span><span>Sample</span><span>/</span><span>{task.title}</span></>}
          requirements={{ peek: 'Red Truck Roadshow, 21–23 Nov · bright and playful', body: `Make a ${task.category.toLowerCase()} for the Red Truck Roadshow (21–23 Nov). Bright, playful, show the truck and the sofa range. Ends with the store address.` }}
          celebrate={celebrate}
          onValue={(f, v) => setState(st => ({ ...st, task: { ...st.task, values: { ...st.task.values, [f.id]: v } } }))}
          onRows={(f, rows) => setState(st => ({ ...st, task: { ...st.task, rows: { ...st.task.rows, [f.id]: rows } } }))}
          onAddCol={(f, name, type) => setState(st => ({ ...st, task: withCols(st.task, f.id, cols => [...cols, { id: `x${Date.now().toString(36)}`, name, type, stage: st.task.at.cur, req: false, pic: false, added: true }]) }))}
          onDropCol={(f, col) => setState(st => ({ ...st, task: withCols(st.task, f.id, cols => cols.filter(c => c.id !== col)) }))}
          onSubmit={pick => decide('submit', me, pick)}
          onApprove={() => decide('approve', me)}
          onChanges={() => decide('changes', me)}
          onReassign={(i, id) => setState(st => ({ ...st, task: { ...st.task, stages: st.task.stages.map((x, j) => (j === i ? { ...x, doer: id } : x)), log: [{ icon: '⇄', text: `MM reassigned ${st.task.stages[i].name} to ${st.task.people.find(p => p.id === id)?.name ?? '—'}`, at: now.toISOString() }, ...st.task.log] } }))}
          onNudge={() => setState(st => ({ ...st, task: { ...st.task, log: [{ icon: '🔔', text: `MM nudged ${actors.map(id => st.task.people.find(p => p.id === id)?.name ?? 'PIC').join(' & ')}`, at: now.toISOString() }, ...st.task.log] } }))}
        />
      )}
      {isPic && picCeleb ? (
        <TaskFlowCelebration kind={task.finish.celebration} gif={null} category={task.category} finished={null} team={celebTeam(task)} onClose={() => setPicCeleb(null)} />
      ) : null}
      <div className={s.viewers}>
        <span className={s.viewersK}>PREVIEW · VIEW AS</span>
        {viewers.map(v => (
          <button key={v.id} type="button" className={`${s.viewer}${v.id === viewer ? ` ${s.viewerOn}` : ''}`} aria-pressed={v.id === viewer}
            onClick={() => setState(st => ({ ...st, viewer: v.id }))}>
            <TaskFlowAvatar init={v.init} hue={hueOf(v.id)} size={22} />{v.label}
          </button>
        ))}
        <span className={s.grow} />
        <button type="button" className={s.tool} onClick={() => setState(st => ({ ...st, offset: st.offset + DAY }))}>⏩ +1 day</button>
        <button type="button" className={s.tool} onClick={() => {
          if (task.at.done) return
          const by = actors[0]
          if (!by) return
          setState(st => ({ ...st, viewer: by }))
          decide(task.at.level >= 0 ? 'approve' : 'submit', by, task.stages[task.at.cur + 1]?.doer ? null : task.stages[task.at.cur + 1]?.cands[0] ?? null)
        }}>▶ Act as whoever’s turn</button>
        <button type="button" className={s.tool} onClick={() => (isPic ? setPicCeleb : setCelebrate)(Date.now())}>🎉 Preview celebration</button>
        <button type="button" className={`${s.tool} ${s.toolQuiet}`} onClick={() => {
          setCelebrate(null)
          setState(fresh(sig, draft, roster))
        }}>Reset</button>
      </div>
    </div>
  )
}

/** A new sample, seen first as whoever's turn it is (the viewer then stays until another is picked). */
function fresh(sig: string, draft: PreviewDraft, roster: FlowPerson[]) {
  const task = sampleTask(draft, roster, new Date())
  return { sig, offset: 0, task, viewer: turnActors(task)[0] ?? task.stages[task.at.cur]?.doer ?? MM }
}

/** Who acts now on the sample: the doer, or those still to approve the level now. */
function turnActors(task: FlowTask): string[] {
  const fs = flowStages(task)
  return [...new Set([...task.stages.map(x => x.doer), ...task.stages.flatMap(x => x.levels.flatMap(l => l.ids))])]
    .filter((id): id is string => !!id && !!turnOf(fs, task.at, id))
}

/** A table field's columns changed on the sample. */
function withCols(task: FlowTask, fieldId: string, change: (cols: FlowTask['sections'][number]['fields'][number]['cols']) => FlowTask['sections'][number]['fields'][number]['cols']): FlowTask {
  return { ...task, sections: task.sections.map(sec => ({ ...sec, fields: sec.fields.map(f => (f.id === fieldId ? { ...f, cols: change(f.cols) } : f)) })) }
}
