'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteMktProject, restoreMktProject } from '@/lib/marketing/actions'
import type { MktSub } from '@/lib/marketing/board'
import {
  cleanPath, deleteNote, driveHref, driveLevel, fileLook, folderMeta, withoutDeleted, type DrivePath,
} from '@/lib/marketing/drive'
import { scopeFor, type ProjectRow, type ProjectScope } from '@/lib/marketing/projects'
import BuilderToast from '../workflows/BuilderToast'
import CtxMenu, { type CtxItem } from '../workflows/CtxMenu'
import u from '../ui/page.module.css'
import s from './projects.module.css'

// Projects as a Drive (2026-11-17 — docs/design_handoff_workflow_projects/ › 2): subsidiaries → their product projects
// (folders) and Quick / recurring tasks (files) → a project's tasks. Grid or list; a click selects (the details pane), a
// double click opens; the path is in the address (?sub=, ?p=). A manager deletes a project or a task — the hover ✕, the
// right-click menu or the pane's Delete, each asked twice — and has 6 seconds to Undo (soft, mig 20261117120000).

const TONE: Record<ProjectRow['tone'], [string, string]> = {
  red: [u.red, u.dotRed],
  waiting: [u.waiting, u.dotWaiting],
  done: [u.done, u.dotDone],
  draft: [u.draft, u.dotDraft],
}
const COLS = 'minmax(0,2.4fr) minmax(0,1.3fr) minmax(0,0.9fr) 70px minmax(0,1.2fr) 64px'
const MENU_W = 210
const MENU_H = 118

type View = 'grid' | 'list'
interface Ctx { id: string; x: number; y: number; confirm: boolean }
interface Toast { text: string; undo: (() => void) | null }

function Pill({ r }: { r: ProjectRow }) {
  return (
    <span className={`${u.pill} ${TONE[r.tone][0]}`}>
      <span className={`${u.pillDot} ${TONE[r.tone][1]}`} aria-hidden="true" />
      {r.label}
    </span>
  )
}

export default function ProjectsList({ rows: rows0, subs, sub, project, q: q0, canDelete }: {
  rows: ProjectRow[]
  subs: MktSub[]
  sub: string | null
  project: string | null
  q: string
  /** Marketing · Manage, not viewing as somebody: the ✕, the menu's Delete…, the pane's Delete. */
  canDelete: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = useState(rows0)
  const [path, setPath] = useState<DrivePath>(() => cleanPath(rows0, subs, sub, project))
  const [view, setView] = useState<View>('grid')
  const [scope, setScope] = useState<ProjectScope>(() => scopeFor(q0))
  const [q, setQ] = useState(q0)
  const [sel, setSel] = useState<string | null>(null)
  const [arm, setArm] = useState<string | null>(null)
  const [paneArm, setPaneArm] = useState(false)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setRows(rows0), [rows0])

  const lv = useMemo(() => driveLevel(rows, subs, path, scope, q), [rows, subs, path, scope, q])
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])
  const selected = sel ? byId.get(sel) ?? null : null

  // The path in the address: a level opened is a step back can undo; the browser's Back walks up again.
  const go = useCallback((next: DrivePath) => {
    setPath(next)
    setSel(null)
    setArm(null)
    setCtx(null)
    setPaneArm(false)
    setQ('')
    try { window.history.pushState(null, '', driveHref(next)) } catch { /* a test's window */ }
  }, [])
  useEffect(() => {
    const back = () => {
      const p = new URLSearchParams(window.location.search)
      setPath(cleanPath(rows, subs, p.get('sub'), p.get('p')))
      setSel(null)
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [rows, subs])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const say = (t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  // ── Delete (twice asked by whoever asks it) and Undo ───────────────────────────────────────────────────────────
  const remove = (r: ProjectRow) => {
    if (!canDelete || busy) return
    const before = rows
    setRows(withoutDeleted(rows, r.id))
    setSel(null)
    setArm(null)
    setCtx(null)
    setPaneArm(false)
    if (path.project === r.id) go({ sub: path.sub, project: null })
    setBusy(true)
    const sent = deleteMktProject(r.id)
    sent.then(res => {
      setBusy(false)
      if (!res.ok) {
        setRows(before)
        say({ text: res.reason, undo: null })
      }
    }, () => {
      setBusy(false)
      setRows(before)
      say({ text: 'It could not be deleted. Please try again.', undo: null })
    })
    say({
      text: `Deleted “${r.title}”`,
      undo: () => {
        setRows(before)
        setToast(null)
        void sent.then(async res => {
          if (!res.ok) return
          const back = await restoreMktProject(res.batch)
          if (!back.ok) {
            setRows(rs => withoutDeleted(rs, r.id))
            say({ text: back.reason, undo: null })
          }
        })
      },
    })
  }

  // ── Selecting, opening, the menu ───────────────────────────────────────────────────────────────────────────────
  const openRow = (r: ProjectRow) => {
    if (r.kind === 'product') go({ sub: r.sub?.code ?? path.sub, project: r.id })
    else router.push(`/marketing/projects/${r.id}`)
  }
  const pick = (r: ProjectRow) => {
    setSel(r.id)
    setPaneArm(false)
    setCtx(null)
  }
  const menu = (e: ReactMouseEvent, r: ProjectRow) => {
    e.preventDefault()
    e.stopPropagation()
    const box = rootRef.current?.getBoundingClientRect()
    const w = box?.width ?? 0
    const h = box?.height ?? 0
    const x = e.clientX - (box?.left ?? 0)
    const y = e.clientY - (box?.top ?? 0)
    // Right-click never selects: the pane does not open and shift the page under the cursor.
    setCtx({ id: r.id, x: Math.max(8, Math.min(x, w - MENU_W - 8)), y: Math.max(8, Math.min(y, h - MENU_H - 8)), confirm: false })
  }
  const key = (e: KeyboardEvent, r: ProjectRow) => {
    if (e.key === 'Enter') openRow(r)
    else if (e.key === ' ') { e.preventDefault(); pick(r) }
  }
  const xButton = (r: ProjectRow) => (canDelete ? (
    <button
      type="button"
      className={`${s.x}${arm === r.id ? ` ${s.armed}` : ''}`}
      aria-label={arm === r.id ? `Delete ${r.title} — click again` : `Delete ${r.title}`}
      title={arm === r.id ? undefined : 'Delete'}
      onClick={e => { e.stopPropagation(); if (arm === r.id) remove(r); else setArm(r.id) }}
      onDoubleClick={e => e.stopPropagation()}
    >
      {arm === r.id ? 'Delete?' : '✕'}
    </button>
  ) : null)
  const leave = (r: ProjectRow) => { if (arm === r.id) setArm(null) }

  const ctxRow = ctx ? byId.get(ctx.id) ?? null : null
  const ctxItems: CtxItem[] = ctxRow ? [
    { icon: '↗', label: ctxRow.kind === 'product' ? 'Open project' : 'Open task', onClick: () => { setCtx(null); openRow(ctxRow) } },
    ...(canDelete ? [{
      icon: '✕',
      label: ctx!.confirm ? (ctxRow.kind === 'product' ? 'Click to confirm · deletes its tasks' : 'Click to confirm') : 'Delete…',
      red: !ctx!.confirm,
      sep: true,
      className: ctx!.confirm ? s.ctxArmed : undefined,
      onClick: () => { if (ctx!.confirm) remove(ctxRow); else setCtx({ ...ctx!, confirm: true }) },
    }] : []),
  ] : []

  // ── The page ─────────────────────────────────────────────────────────────────────────────────────────────────
  const crumbs: { label: string; to: DrivePath | null }[] = [{ label: 'Projects', to: lv.sub ? { sub: null, project: null } : null }]
  if (lv.sub) crumbs.push({ label: lv.sub.name, to: lv.project ? { sub: lv.sub.code, project: null } : null })
  if (lv.project) crumbs.push({ label: lv.project.title, to: null })
  const nothing = !lv.subFolders.length && !lv.folders.length && !lv.files.length

  const folderTile = (r: ProjectRow) => (
    <div
      key={r.id}
      role="button"
      tabIndex={0}
      aria-pressed={sel === r.id}
      aria-label={`Project ${r.title}`}
      className={`${s.folder}${sel === r.id ? ` ${s.folderOn}` : ''}`}
      onClick={e => { e.stopPropagation(); pick(r) }}
      onDoubleClick={e => { e.stopPropagation(); openRow(r) }}
      onContextMenu={e => menu(e, r)}
      onKeyDown={e => key(e, r)}
      onMouseLeave={() => leave(r)}
    >
      <span className={s.tile} aria-hidden="true">📁</span>
      <span className={s.folderText}>
        <span className={s.folderName}>{r.title}</span>
        <span className={s.meta} style={{ display: 'block' }}>{folderMeta(rows, r)}</span>
      </span>
      {xButton(r)}
    </div>
  )

  const fileCard = (r: ProjectRow) => {
    const look = fileLook(r)
    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        aria-pressed={sel === r.id}
        aria-label={`${r.kindLabel} ${r.title}`}
        className={`${s.card}${sel === r.id ? ` ${s.cardOn}` : ''}`}
        onClick={e => { e.stopPropagation(); pick(r) }}
        onDoubleClick={e => { e.stopPropagation(); openRow(r) }}
        onContextMenu={e => menu(e, r)}
        onKeyDown={e => key(e, r)}
        onMouseLeave={() => leave(r)}
      >
        {xButton(r)}
        <div className={s.preview} aria-hidden="true">
          <span className={s.previewEmoji}>{look.emoji}</span>
          <span className={s.previewKind}>{look.kind}</span>
        </div>
        <div className={s.body}>
          <div className={s.cardTitle}>{r.title}</div>
          <div className={s.track}>{r.trackId}</div>
          <div className={s.cardFoot}>
            <Pill r={r} />
            <span className={s.whoDue}>{r.who} · {r.dueLabel}</span>
          </div>
        </div>
      </div>
    )
  }

  const listRows = (items: ProjectRow[]) => (
    <div className={u.table} role="table" aria-label="Projects">
      <div className={u.thead} style={{ gridTemplateColumns: COLS }} role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Stage</span>
        <span role="columnheader">Now with</span>
        <span role="columnheader">Due</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" aria-label="Delete" />
      </div>
      {items.map(r => (
        <div
          key={r.id}
          role="row"
          tabIndex={0}
          aria-selected={sel === r.id}
          className={`${u.trow} ${s.trow}${sel === r.id ? ` ${s.trowOn}` : ''}`}
          style={{ gridTemplateColumns: COLS, cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); pick(r) }}
          onDoubleClick={e => { e.stopPropagation(); openRow(r) }}
          onContextMenu={e => menu(e, r)}
          onKeyDown={e => key(e, r)}
          onMouseLeave={() => leave(r)}
        >
          <div className={s.nameCell} role="cell">
            <span className={s.icon28} aria-hidden="true">{r.kind === 'product' ? '📁' : fileLook(r).emoji}</span>
            <div className={u.cellMain}>
              <div className={u.cellTitle}>{r.title}</div>
              <div className={u.mono}>{r.trackId} · {r.kindLabel}</div>
            </div>
          </div>
          <span className={u.cell} role="cell">{r.stage}</span>
          <span className={u.cell} role="cell">{r.who}</span>
          <span className={u.cell} role="cell">{r.dueLabel}</span>
          <span role="cell" style={{ display: 'flex', minWidth: 0 }}><Pill r={r} /></span>
          <span role="cell" className={s.delCell}>{xButton(r)}</span>
        </div>
      ))}
    </div>
  )

  const filesBlock = (items: ProjectRow[]) => (view === 'grid'
    ? <div className={s.files}>{items.map(fileCard)}</div>
    : listRows(items))

  return (
    <div
      ref={rootRef}
      className={s.root}
      onContextMenu={e => e.preventDefault()}
      onClick={() => { setSel(null); setCtx(null); setArm(null); setPaneArm(false) }}
    >
      <div className={s.col}>
        <div className={s.head}>
          <nav className={s.crumbs} aria-label="Where you are">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 ? <span className={s.sep} aria-hidden="true">›</span> : null}
                {c.to
                  ? <button type="button" className={s.crumb} onClick={e => { e.stopPropagation(); go(c.to!) }}>{c.label}</button>
                  : <span className={s.crumb} aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className={s.grow} />
          <label className={`${u.search} ${s.search}`} onClick={e => e.stopPropagation()}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              className={u.searchInput}
              value={q}
              onChange={e => { setQ(e.target.value); setSel(null) }}
              placeholder={lv.sub ? `Search in ${lv.sub.name}` : 'Track ID, title or person'}
              aria-label="Find a project"
            />
          </label>
          <div className={u.seg} role="radiogroup" aria-label="Which projects" onClick={e => e.stopPropagation()}>
            {(['open', 'done', 'all'] as const).map(k => (
              <button key={k} type="button" role="radio" aria-checked={scope === k} className={`${u.segBtn}${scope === k ? ` ${u.segOn}` : ''}`} onClick={() => setScope(k)}>
                {k === 'open' ? 'Open' : k === 'done' ? 'Done' : 'All'} · {lv.counts[k]}
              </button>
            ))}
          </div>
          <div className={s.views} role="radiogroup" aria-label="View" onClick={e => e.stopPropagation()}>
            <button type="button" role="radio" aria-checked={view === 'grid'} aria-label="Grid" title="Grid" className={`${s.viewBtn}${view === 'grid' ? ` ${s.viewOn}` : ''}`} onClick={() => setView('grid')}>▦</button>
            <button type="button" role="radio" aria-checked={view === 'list'} aria-label="List" title="List" className={`${s.viewBtn}${view === 'list' ? ` ${s.viewOn}` : ''}`} onClick={() => setView('list')}>☰</button>
          </div>
        </div>

        {lv.searching ? (
          <>
            <div className={s.label}>Results · {lv.folders.length + lv.files.length}</div>
            {lv.folders.length ? <div className={s.folders} style={{ marginBottom: 10 }}>{lv.folders.map(folderTile)}</div> : null}
            {lv.files.length ? filesBlock(lv.files) : null}
            {nothing ? <div className={u.empty}>Nothing matches.</div> : null}
          </>
        ) : lv.level === 'root' ? (
          <>
            <div className={s.label}>Subsidiaries</div>
            <div className={s.folders}>
              {lv.subFolders.map(f => (
                <button
                  key={f.sub.id}
                  type="button"
                  className={s.folder}
                  onClick={e => { e.stopPropagation(); go({ sub: f.sub.code, project: null }) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
                >
                  <span className={s.tile} aria-hidden="true">
                    {f.sub.emoji || '🏢'}
                    <span className={s.tileDot} style={{ background: f.sub.dot }} />
                  </span>
                  <span className={s.folderText}>
                    <span className={s.folderName} style={{ display: 'block' }}>{f.sub.name}</span>
                    <span className={s.meta} style={{ display: 'block' }}>{f.items ? `${f.items} item${f.items === 1 ? '' : 's'}` : 'Empty'}</span>
                  </span>
                  {f.late ? <span className={s.late} title={`${f.late} late`}>{f.late}</span> : null}
                </button>
              ))}
            </div>
          </>
        ) : lv.level === 'sub' ? (
          <>
            {lv.folders.length ? (
              <>
                <div className={s.label}>Projects</div>
                <div className={s.folders}>{lv.folders.map(folderTile)}</div>
              </>
            ) : null}
            {lv.files.length ? (
              <>
                <div className={s.label}>Quick tasks</div>
                {filesBlock(lv.files)}
              </>
            ) : null}
            {nothing ? <div className={u.empty}>{lv.counts.all ? 'Nothing here.' : 'No projects yet.'}</div> : null}
          </>
        ) : lv.files.length ? (
          <>
            <div className={s.label}>Tasks</div>
            {filesBlock(lv.files)}
          </>
        ) : (
          <div className={s.emptyBox}>
            <span className={s.emptyIcon} aria-hidden="true">📭</span>
            <span className={s.emptyTitle}>No tasks yet</span>
            <span className={s.emptyText}>Tasks appear here once the minutes are turned into a plan.</span>
          </div>
        )}
      </div>

      {selected ? (
        <aside className={s.pane} aria-label="Details" onClick={e => e.stopPropagation()}>
          <div className={s.paneHead}>
            <span className={s.icon32} aria-hidden="true">{selected.kind === 'product' ? '📁' : fileLook(selected).emoji}</span>
            <div style={{ minWidth: 0 }}>
              <div className={s.paneTitle}>{selected.title}</div>
              <div className={s.track}>{selected.trackId}</div>
            </div>
            <button type="button" className={s.close} aria-label="Close details" onClick={() => setSel(null)}>×</button>
          </div>
          <div className={s.paneStatus}><Pill r={selected} /></div>
          <div className={s.facts}>
            {([
              ['Subsidiary', selected.sub?.name ?? '—'],
              ['Kind', selected.kind === 'product' ? 'Project' : selected.kindLabel],
              ['Stage', selected.stage],
              ['Now with', selected.who],
              ['Due', selected.dueLabel],
            ] as const).map(([k, v]) => (
              <div key={k} className={s.fact}>
                <span className={s.factKey}>{k}</span>
                <span className={s.factVal}>{v}</span>
              </div>
            ))}
          </div>
          {selected.kind === 'product'
            ? <button type="button" className={s.openBtn} onClick={() => openRow(selected)}>Open project</button>
            : <Link href={`/marketing/projects/${selected.id}`} className={s.openBtn}>Open task</Link>}
          {canDelete ? (
            <>
              <button
                type="button"
                className={`${s.delBtn}${paneArm ? ` ${s.armed}` : ''}`}
                disabled={busy}
                onClick={() => { if (paneArm) remove(selected); else setPaneArm(true) }}
              >
                {paneArm ? 'Click again to delete' : 'Delete'}
              </button>
              <div className={s.note}>{deleteNote(selected)}</div>
            </>
          ) : null}
        </aside>
      ) : null}

      {ctx && ctxRow ? <CtxMenu x={ctx.x} y={ctx.y} title={`${ctxRow.trackId} · ${ctxRow.kind === 'product' ? 'Project' : ctxRow.kindLabel}`} items={ctxItems} /> : null}
      {toast ? <BuilderToast text={toast.text} onUndo={toast.undo} /> : null}
    </div>
  )
}
