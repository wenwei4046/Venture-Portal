import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requirePage } from '@/lib/auth'
import { projectRows, stageRows } from '@/lib/marketing/projects'
import { readBoard } from '@/lib/marketing/server'
import u from '@/components/mkt/ui/page.module.css'

export const dynamic = 'force-dynamic'

const TONE = { red: [u.red, u.dotRed], waiting: [u.waiting, u.dotWaiting], done: [u.done, u.dotDone], draft: [u.draft, u.dotDraft] } as const
const COLS = '40px minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.4fr) 70px minmax(0,1.3fr)'

/** A project, by its id or its Track ID: where it stands and its stages. The task page's work comes with its module. */
export default async function MarketingProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('/marketing/projects/[id]')
  const [{ id }, board] = await Promise.all([params, readBoard()])
  const key = decodeURIComponent(id)
  const project = board.projects.find(p => p.id === key || p.trackId === key.toUpperCase())
  if (!project) notFound()
  const row = projectRows(board).find(r => r.id === project.id)
  const stages = stageRows(board, project.id)
  return (
    <div className={u.page}>
      <div style={{ fontSize: '.92em' }}>
        <Link href="/marketing/projects" className={u.chip} style={{ display: 'inline-flex' }}>← Projects</Link>
      </div>
      <div className={u.head} style={{ marginTop: 18 }}>
        <div style={{ minWidth: 0 }}>
          <div className={u.mono} style={{ fontSize: 11 }}>{project.trackId} · {row?.kindLabel}</div>
          <div className={u.title} style={{ marginTop: 6, whiteSpace: 'normal' }}>{project.title}</div>
        </div>
        <div className={u.grow} />
        {row ? (
          <span className={`${u.pill} ${TONE[row.tone][0]}`}>
            <span className={`${u.pillDot} ${TONE[row.tone][1]}`} aria-hidden="true" />
            {row.label}
          </span>
        ) : null}
      </div>
      <div className={u.bar}>
        {row?.sub ? (
          <span className={`${u.chip} ${u.chipOn}`}>
            <span className={u.chipDot} style={{ background: row.sub.dot }} aria-hidden="true" />
            {row.sub.name}
          </span>
        ) : null}
        {project.workflow ? <span className={u.chip}>{project.workflow}</span> : null}
        {project.pic ? <span className={u.chip}>PIC · {project.pic}</span> : null}
      </div>
      <div className={u.table} role="table" aria-label="Stages">
        <div className={u.thead} style={{ gridTemplateColumns: COLS }} role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Stage</span>
          <span role="columnheader">Who</span>
          <span role="columnheader">Approval</span>
          <span role="columnheader">Due</span>
          <span role="columnheader">Status</span>
        </div>
        {stages.length ? (
          stages.map(s => (
            <div key={s.idx} className={`${u.trow}${s.tone === 'red' ? ` ${u.trowRed}` : ''}`} style={{ gridTemplateColumns: COLS, cursor: 'default' }} role="row">
              <span className={u.cell} role="cell">{s.idx + 1}</span>
              <span className={u.cellTitle} role="cell" style={{ fontWeight: s.current ? 600 : 500 }}>{s.name}</span>
              <span className={u.cell} role="cell">{s.owner}</span>
              <span className={u.cell} role="cell">{s.approval}</span>
              <span className={u.cell} role="cell">{s.due}</span>
              <span role="cell" style={{ display: 'flex', minWidth: 0 }}>
                <span className={`${u.pill} ${TONE[s.tone][0]}`}>
                  <span className={`${u.pillDot} ${TONE[s.tone][1]}`} aria-hidden="true" />
                  {s.label}
                </span>
              </span>
            </div>
          ))
        ) : (
          <div className={u.empty}>No stages yet.</div>
        )}
      </div>
    </div>
  )
}
