'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ProjectLog } from '@/lib/marketing/audit'
import type { MktTaskPage } from '@/lib/marketing/task'
import { taskMap } from '@/lib/marketing/taskmap'
import TaskMap from '../map/TaskMap'
import AuditLog from './AuditLog'
import { readProjectLog } from './read'
import s from './audit.module.css'

// A project's Map and Audit trail (the handoff's tabs of the product task page, `Task Map.dc.html` and
// `Audit Trail.dc.html`), opened from the trail's head on its page — over the page until the product task page comes
// with the Assignment plan (②b-2). The Map and Replay are drawn from the task's stages and trail; the formal log is
// read when it opens. A product project's intake has no stages to map: its log alone.

type Tab = 'map' | 'audit'

export default function ProjectSheet({ project, track, title, page, tab, manage = false, onClose }: {
  project: string
  track: string
  title: string
  /** The task page — its stages and trail draw the Map and Replay; null for a product project's intake. */
  page: MktTaskPage | null
  tab: Tab
  /** Marketing · Manage: a record of the formal log may be corrected (④-3b). */
  manage?: boolean
  onClose: () => void
}) {
  const map = useMemo(() => (page && page.stages.length ? taskMap(page) : null), [page])
  const [on, setOn] = useState<Tab>(map ? tab : 'audit')
  const [mode, setMode] = useState<'replay' | 'log'>('log')
  // undefined: not read yet / reading; null: could not be read.
  const [log, setLog] = useState<ProjectLog | null | undefined>(undefined)
  const wantLog = on === 'audit' && (mode === 'log' || !map)
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
          {on === 'map' && map ? <TaskMap map={map} track={track} /> : null}
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
              {map && mode === 'replay' ? <TaskMap map={map} mode="replay" track={track} />
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
