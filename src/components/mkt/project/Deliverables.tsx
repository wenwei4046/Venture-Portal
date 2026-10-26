'use client'

import Link from 'next/link'
import {
  deliverableGroups, deliverableProgress, deliverableRuns, deliverableState, type ProductDeliverable, type ProductProjectPage,
} from '@/lib/marketing/project'
import p from './project.module.css'
import t from '../task/task.module.css'

// A product project's deliverables (②b-2a — the user's answers 10 and 17): each action × its quantity its own sub-task,
// listed by category and action — where each stands, its stage now and whose — with deliverables done ÷ all. Each opens
// its task page; the manager plans each (the Assignment Plan: its start day, its people). A recurring one's by month,
// the latest first (②b-2f — a month made each run day).

const TONE = { red: t.red, waiting: t.waiting, done: t.done, draft: t.draft } as const

export const planHref = (track: string) => `/marketing/projects/${encodeURIComponent(track)}?plan=1`

export default function Deliverables({ page, manage }: { page: ProductProjectPage; manage: boolean }) {
  const list = page.deliverables
  if (!list.length) return null
  const { done, all } = deliverableProgress(list)
  const toPlan = list.filter(d => d.status === 'planning').length
  const runs = page.project.runs
  const months = runs ? deliverableRuns(list, runs) : [{ run: 0, month: '', list }]
  const rows = (items: ProductDeliverable[]) =>
    deliverableGroups(items).map(g => (
      <div key={g.group || '—'} className={p.delGroup}>
        {g.group ? <div className={p.delGroupName}>{g.group}</div> : null}
        {g.items.flatMap(it => it.rows).map(d => {
          const st = deliverableState(d, page.team, page.today)
          const suffix = d.trackId.slice(d.trackId.lastIndexOf('-') + 1)
          const open = d.status === 'planning' || d.status === 'active'
          return (
            <div key={d.id} className={p.delRow}>
              <Link href={`/marketing/projects/${encodeURIComponent(d.trackId)}`} className={p.delMain}>
                <span className={p.delTrack}>{suffix}</span>
                <span className={p.delTitle}>{d.title}</span>
                {d.workflow ? <span className={p.delWf}>{d.workflow}</span> : null}
              </Link>
              <span className={`${t.pill} ${TONE[st.tone]}`}><span className={t.pillDot} aria-hidden="true" />{st.label}</span>
              {manage && open ? (
                <Link href={planHref(d.trackId)} className={`${p.ghost} ${p.delPlan}`}>{d.status === 'planning' ? 'Plan' : 'Edit plan'}</Link>
              ) : null}
            </div>
          )
        })}
      </div>
    ))
  return (
    <section className={p.card} aria-label="Deliverables">
      <div className={p.cardHead}>
        <span className={p.cardTitle}>Deliverables</span>
        <span className={p.delCount}>{done}/{all} done</span>
        {manage && toPlan ? <span className={p.delToPlan}>{toPlan} to plan</span> : null}
      </div>
      <div className={p.delBody}>
        {months.map(m => (m.month ? (
          <div key={m.run} className={p.delMonth} aria-label={m.month}>
            <div className={p.delMonthName}>{m.month}</div>
            {rows(m.list)}
          </div>
        ) : rows(m.list)))}
      </div>
    </section>
  )
}
