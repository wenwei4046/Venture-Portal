'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { filterProjects, scopeFor, type ProjectRow, type ProjectScope } from '@/lib/marketing/projects'
import type { MktSub } from '@/lib/marketing/board'
import u from '../ui/page.module.css'

// Projects (the sidebar's 📁): every project, Quick Task and recurring run — Open, Done or All; a subsidiary's own (its
// sidebar row, `?sub=`), or a Track ID / words (`?q=`, the top bar's search). A row opens the project.

const TONE: Record<ProjectRow['tone'], [string, string]> = {
  red: [u.red, u.dotRed],
  waiting: [u.waiting, u.dotWaiting],
  done: [u.done, u.dotDone],
  draft: [u.draft, u.dotDraft],
}
const COLS = 'minmax(0,2.2fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,0.9fr) 70px minmax(0,1.4fr)'

export default function ProjectsList({ rows, subs, sub, q: q0 }: { rows: ProjectRow[]; subs: MktSub[]; sub: string | null; q: string }) {
  const [scope, setScope] = useState<ProjectScope>(() => scopeFor(q0))
  const [q, setQ] = useState(q0)
  const shown = useMemo(() => filterProjects(rows, { scope, sub, q }), [rows, scope, sub, q])
  const picked = sub ? subs.find(s => s.code === sub) : null
  const scoped = (s: ProjectScope) => filterProjects(rows, { scope: s, sub, q }).length
  return (
    <div className={u.page}>
      <div className={u.head}>
        <div className={u.headLeft}>
          <span className={u.title}>{picked ? `${picked.emoji} ${picked.name}` : 'Projects'}</span>
        </div>
        <div className={u.grow} />
        <label className={u.search}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input className={u.searchInput} value={q} onChange={e => setQ(e.target.value)} placeholder="Track ID or title" aria-label="Find a project" />
        </label>
        <div className={u.seg} role="radiogroup" aria-label="Which projects">
          {(['open', 'done', 'all'] as const).map(k => (
            <button key={k} type="button" role="radio" aria-checked={scope === k} className={`${u.segBtn}${scope === k ? ` ${u.segOn}` : ''}`} onClick={() => setScope(k)}>
              {k === 'open' ? 'Open' : k === 'done' ? 'Done' : 'All'} · {scoped(k)}
            </button>
          ))}
        </div>
      </div>
      <div className={u.bar}>
        <Link href={q ? `/marketing/projects?q=${encodeURIComponent(q)}` : '/marketing/projects'} className={`${u.chip}${!sub ? ` ${u.chipOn}` : ''}`}>
          All subsidiaries
        </Link>
        {subs.map(s => (
          <Link key={s.id} href={`/marketing/projects?sub=${encodeURIComponent(s.code)}`} className={`${u.chip}${sub === s.code ? ` ${u.chipOn}` : ''}`}>
            <span className={u.chipDot} style={{ background: s.dot }} aria-hidden="true" />
            <span>{s.name}</span>
          </Link>
        ))}
      </div>
      <div className={u.table} role="table" aria-label="Projects">
        <div className={u.thead} style={{ gridTemplateColumns: COLS }} role="row">
          <span role="columnheader">Project</span>
          <span role="columnheader">Subsidiary</span>
          <span role="columnheader">Stage</span>
          <span role="columnheader">Now with</span>
          <span role="columnheader">Due</span>
          <span role="columnheader">Status</span>
        </div>
        {shown.length ? (
          shown.map(r => (
            <Link key={r.id} href={`/marketing/projects/${r.id}`} className={`${u.trow}${r.tone === 'red' ? ` ${u.trowRed}` : ''}`} style={{ gridTemplateColumns: COLS }} role="row">
              <div className={u.cellMain} role="cell">
                <div className={u.cellTitle}>{r.title}</div>
                <div className={u.mono}>{r.trackId} · {r.kindLabel}</div>
              </div>
              <span className={u.cellSub} role="cell">
                <span className={u.dot} style={{ background: r.sub?.dot }} aria-hidden="true" />
                {r.sub?.name ?? '—'}
              </span>
              <span className={u.cell} role="cell">{r.stage}</span>
              <span className={u.cell} role="cell">{r.who}</span>
              <span className={u.cell} role="cell">{r.dueLabel}</span>
              <span role="cell" style={{ display: 'flex', minWidth: 0 }}>
                <span className={`${u.pill} ${TONE[r.tone][0]}`}>
                  <span className={`${u.pillDot} ${TONE[r.tone][1]}`} aria-hidden="true" />
                  {r.label}
                </span>
              </span>
            </Link>
          ))
        ) : (
          <div className={u.empty}>{rows.length ? 'Nothing matches.' : 'No projects yet.'}</div>
        )}
      </div>
    </div>
  )
}
