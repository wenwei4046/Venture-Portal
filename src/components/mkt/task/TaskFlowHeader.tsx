import type { ReactNode } from 'react'
import type { FlowTask, HeaderView } from '@/lib/marketing/task-flow-view'
import TaskFlowAvatar from './TaskFlowAvatar'
import s from './taskflow.module.css'

// The task page's header (Task Flow.dc.html): the breadcrumb and the template chip; the Task ID and its status pill;
// the title; Now with · In this stage (live, Chivo Mono) · Stage due · Deadline (red "· at risk").

const PILL = { ok: s.ok, wait: s.wait, red: s.red, done: s.done }

export default function TaskFlowHeader({ task, view, crumbs, extra }: { task: FlowTask; view: HeaderView; crumbs: ReactNode; extra?: ReactNode }) {
  return (
    <div className={s.head}>
      <div className={s.crumbs}>
        {crumbs}
        <span className={s.grow} />
        <span className={s.chip}>{task.tplChip}</span>
      </div>
      <div className={s.headRow}>
        <div className={s.headLeft}>
          <div className={s.idRow}>
            <span className={s.track}>{task.trackId}</span>
            <span className={`${s.pill} ${PILL[view.status.tone]}`} data-testid="tf-status"><span className={s.pillDot} aria-hidden="true" />{view.status.label}</span>
            {extra}
          </div>
          <span className={s.title}>{task.title}</span>
        </div>
        <div className={s.facts}>
          <div className={s.fact}>
            <span className={s.label}>Now with</span>
            <span className={s.factV}><TaskFlowAvatar init={view.nowWith.init} hue={view.nowWith.hue} size={22} done={view.nowWith.done} />{view.nowWith.name}</span>
          </div>
          <div className={s.fact}>
            <span className={s.label}>In this stage</span>
            <span className={`${s.factMono}${view.inStageRed ? ` ${s.factRed}` : ''}`}>{view.inStage}</span>
          </div>
          <div className={s.fact}>
            <span className={s.label}>Stage due</span>
            <span className={`${s.factV}${view.stageDueRed ? ` ${s.factRed}` : ''}`}>{view.stageDue}</span>
          </div>
          <div className={s.fact}>
            <span className={s.label}>Deadline</span>
            <span className={`${s.factV}${view.deadlineRed ? ` ${s.factRed}` : ''}`}>{view.deadline}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
