'use client'

import type { MktSub } from '@/lib/marketing/board'
import { driveLevel, folderMeta, type DrivePath } from '@/lib/marketing/drive'
import type { ProjectRow, ProjectScope } from '@/lib/marketing/projects'
import { fileSub, itemsLine, kindGlyph, toneOf } from '@/lib/mkt-app/model'
import { Pill, Seg } from '../kit'
import s from '../mkt-app.module.css'

// Projects (the handoff's second tab — the desktop's Drive, lib/marketing/drive.ts): the crumbs as the title, a search,
// Open · Done · All counting the level shown. The root: the subsidiaries; a subsidiary: its product projects (folders)
// and its Quick / recurring tasks; a project: its tasks. A task opens its page.

export interface ProjectsTabProps {
  rows: ProjectRow[]
  subs: MktSub[]
  path: DrivePath
  scope: ProjectScope
  q: string
  onPath: (p: DrivePath) => void
  onScope: (s: ProjectScope) => void
  onQ: (q: string) => void
  onOpen: (trackId: string) => void
}

export default function ProjectsTab(p: ProjectsTabProps) {
  const level = driveLevel(p.rows, p.subs, p.path, p.scope, p.q)
  const crumbs: { label: string; on: boolean; go: () => void }[] = [
    { label: 'Projects', on: level.level === 'root', go: () => { p.onQ(''); p.onPath({ sub: null, project: null }) } },
  ]
  if (level.sub) crumbs.push({ label: level.sub.name, on: level.level === 'sub', go: () => p.onPath({ sub: level.sub!.code, project: null }) })
  if (level.project) crumbs.push({ label: level.project.title, on: true, go: () => {} })
  const placeholder = level.sub ? `Search in ${level.sub.name}` : 'Track ID, title or person'
  const files = level.files
  const filesLabel = level.searching ? `Results · ${level.folders.length + files.length}` : level.level === 'project' ? 'Tasks' : 'Quick tasks'
  const nothing = level.level !== 'root' && !level.folders.length && !files.length
  return (
    <div className={s.tabPage}>
      <div className={s.projHead}>
        <div className={s.crumbs}>
          {crumbs.map((c, i) => (
            <span key={c.label + i} style={{ display: 'contents' }}>
              {i ? <span className={s.crumbSep}>›</span> : null}
              <button type="button" className={s.crumb} data-on={c.on ? 'true' : 'false'} onClick={c.go}>{c.label}</button>
            </span>
          ))}
        </div>
        <input className={s.search} value={p.q} onChange={e => p.onQ(e.target.value)} placeholder={placeholder} aria-label="Search projects" type="search" />
        <Seg label="Scope" look="soft" value={p.scope} onPick={p.onScope} items={(['open', 'done', 'all'] as const).map(k => ({
          key: k, label: `${k === 'open' ? 'Open' : k === 'done' ? 'Done' : 'All'} · ${level.counts[k]}`,
        }))} />
      </div>
      <div className={s.scroll} style={{ background: 'rgb(var(--mk-white))' }}>
        <div className={s.projList}>
          {level.level === 'root' && !level.searching ? <div className={`${s.label} ${s.projLabel}`}>Subsidiaries</div> : null}
          {level.subFolders.map(f => (
            <button key={f.sub.id} type="button" className={s.folder} onClick={() => p.onPath({ sub: f.sub.code, project: null })}>
              <span className={s.tile36}>{f.sub.emoji}<span className={s.tileDot} style={{ background: f.sub.dot }} /></span>
              <span className={s.grow}>
                <span className={s.folderName} style={{ display: 'block' }}>{f.sub.name}</span>
                <span className={s.folderMeta}>{itemsLine(f.items)}</span>
              </span>
              {f.late ? <span className={s.redCount}>{f.late}</span> : null}
              <span className={s.chev}>›</span>
            </button>
          ))}
          {level.folders.length ? <div className={`${s.label} ${s.projLabel}`}>Projects</div> : null}
          {level.folders.map(f => (
            <button key={f.id} type="button" className={s.folder} onClick={() => p.onPath({ sub: f.sub?.code ?? level.path.sub, project: f.id })}>
              <span className={s.tile36}>📁</span>
              <span className={s.grow}>
                <span className={s.folderName} style={{ display: 'block' }}>{f.title}</span>
                <span className={s.folderMeta}>{folderMeta(p.rows, f)}</span>
              </span>
              <span className={s.chev}>›</span>
            </button>
          ))}
          {files.length ? <div className={`${s.label} ${s.projLabelFiles}`}>{filesLabel}</div> : null}
          {files.map(r => (
            <button key={r.id} type="button" className={s.file} onClick={() => p.onOpen(r.trackId)}>
              <span className={`${s.tile36} ${s.fileTile}`}>{kindGlyph(r)}</span>
              <span className={s.grow}>
                <span className={s.fileTitle} style={{ display: 'block' }}>{r.title}</span>
                <span className={s.fileSub} style={{ display: 'block' }}>{fileSub(r)}</span>
              </span>
              <Pill tone={toneOf(r.tone)} text={r.label} size="sm" />
            </button>
          ))}
          {nothing ? <div className={s.emptyTall}>{level.searching ? 'Nothing matches.' : 'Nothing here.'}</div> : null}
        </div>
      </div>
    </div>
  )
}
