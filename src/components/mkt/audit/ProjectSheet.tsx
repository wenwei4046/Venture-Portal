'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ProjectLog } from '@/lib/marketing/audit'
import { productMap } from '@/lib/marketing/productmap'
import type { ProductProjectPage } from '@/lib/marketing/project'
import type { MktTaskPage } from '@/lib/marketing/task'
import { taskMap } from '@/lib/marketing/taskmap'
import TaskMap from '../map/TaskMap'
import AuditLog from './AuditLog'
import { readProjectLog } from './read'
import s from './audit.module.css'

// A project's Map and Audit trail (the handoff's tabs of the product task page, `Task Map.dc.html` and
// `Audit Trail.dc.html`), opened from the trail's head on its page — over the page until the product task page comes
// with the Assignment plan (②b-2). A task's Map and Replay are drawn from its stages and trail; a product project's
// (④-4d — answers 22, 23) from its intake and its deliverables, its trail the formal log's — read when the sheet
// opens, as the formal log is.

type Tab = 'map' | 'audit'

export default function ProjectSheet({ project, track, title, page, product = null, tab, manage = false, onClose }: {
  project: string
  track: string
  title: string
  /** The task page — its stages and trail draw the Map and Replay; null for a product project. */
  page: MktTaskPage | null
  /** A product project's page — its intake and deliverables draw its Map and Replay. */
  product?: ProductProjectPage | null
  tab: Tab
  /** Marketing · Manage: a record of the formal log may be corrected (④-3b). */
  manage?: boolean
  onClose: () => void
}) {
  // undefined: not read yet / reading; null: could not be read.
  const [log, setLog] = useState<ProjectLog | null | undefined>(undefined)
  // A product project's map from its page's trail, then from the formal log's every record once it is read.
  const map = useMemo(() => (page && page.stages.length ? taskMap(page) : product ? productMap(product, log?.rows) : null), [page, product, log])
  const [on, setOn] = useState<Tab>(map ? tab : 'audit')
  const [mode, setMode] = useState<'replay' | 'log'>('log')
  const wantLog = !!product || (on === 'audit' && (mode === 'log' || !map))
  useEffect(() => {
    if (!wantLog || log !== undefined) return
    let live = true
    void readProjectLog(project).then(l => { if (live) setLog(l) })
    return () => { live = false }
  }, [wantLog, log, project])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={on === 'map' ? 'Task map' : 'Audit trail'} onClick={e => e.stopPropagation()}>
        <div className={s.head}>
          <span className={s.title}>{title}</span>
          <span className={s.track}>{track}</span>
          <span className={s.grow} />
          <button type="button" className={s.close} aria-label="Close" onClick={onClose} autoFocus>×</button>
        </div>
        <div className={s.tabs} role="tablist" aria-label={track}>
          {map ? (
            <button type="button" role="tab" aria-selected={on === 'map'} className={`${s.tab}${on === 'map' ? ` ${s.tabOn}` : ''}`} onClick={() => setOn('map')}>Map</button>
          ) : null}
          <button type="button" role="tab" aria-selected={on === 'audit'} className={`${s.tab}${on === 'audit' ? ` ${s.tabOn}` : ''}`} onClick={() => setOn('audit')}>Audit trail</button>
        </div>
        <div className={s.body}>
          {/* Drawn again from the full log once it is read: its Replay from the first record. */}
          {on === 'map' && map ? <TaskMap key={product && log ? 'log' : 'page'} map={map} track={track} /> : null}
          {on === 'audit' ? (
            <>
              {map ? (
                <div className={s.modes} role="tablist" aria-label="Audit trail">
                  {(['replay', 'log'] as const).map(m => (
                    <button key={m} type="button" role="tab" aria-selected={mode === m} className={`${s.mode}${mode === m ? ` ${s.modeOn}` : ''}`} onClick={() => setMode(m)}>
                      {m === 'replay' ? '▶ Replay' : 'Formal log'}
                    </button>
                  ))}
                </div>
              ) : null}
              {map && mode === 'replay' ? <TaskMap key={product && log ? 'log' : 'page'} map={map} mode="replay" track={track} />
                : log === undefined ? <div className={s.wait}>Reading the log…</div>
                : log === null ? <div className={s.wait}>Could not read the log</div>
                : <AuditLog log={log} project={project} manage={manage} onLog={setLog} />}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
