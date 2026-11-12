'use client'

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import { folderTree, railItems, railStatus, type MinutesEdit, type MinutesFolder, type MinutesTemplate } from '@/lib/marketing/minutes'
import m from './minutes.module.css'

// The Minutes Builder's templates rail (v2): a search, the folders (nestable) and templates — each template a status
// dot with its tooltip, no meta line — drag a template onto a folder (or onto blank space, out of every folder), and a
// right-click menu for a template, a folder or the blank rail. Renaming is in place: Enter or leaving the box saves, Esc
// does not. What each choice does is the builder's (MinutesBuilder).

export type RailMenu = { kind: 'tpl' | 'folder' | 'root'; id: string | null; x: number; y: number; confirm: boolean }
export type Renaming = { kind: 'tpl' | 'folder'; id: string; draft: string } | null

export interface RailActions {
  open: (id: string) => void
  newTemplate: (folder: string | null) => void
  newFolder: (parent: string | null, moveTpl?: string) => void
  duplicate: (id: string) => void
  move: (id: string, folder: string | null) => void
  deleteTemplate: (id: string) => void
  deleteFolder: (id: string) => void
  rename: (kind: 'tpl' | 'folder', id: string, name: string) => void
}

const STATUS_DOT = { live: m.dotLive, changed: m.dotChanged, draft: m.dotDraft } as const

export default function MinutesRail({ templates, folders, selId, editOf, renaming, setRenaming, act }: {
  templates: MinutesTemplate[]
  folders: MinutesFolder[]
  selId: string | null
  /** A template as it stands on the page (the open one's edit, else as read). */
  editOf: (t: MinutesTemplate) => MinutesEdit
  renaming: Renaming
  setRenaming: (r: Renaming) => void
  act: RailActions
}) {
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<RailMenu | null>(null)
  const [dragT, setDragT] = useState<string | null>(null)
  const [dropF, setDropF] = useState<string | null>(null)
  const renameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menu) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [menu])

  const items = railItems(folders, templates, collapsed, q)
  const fname = (id: string | null) => folders.find(f => f.id === id)?.name ?? null

  const openMenu = (e: MouseEvent, kind: RailMenu['kind'], id: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ kind, id, confirm: false, x: Math.max(6, Math.min(e.clientX, window.innerWidth - 230)), y: Math.max(6, Math.min(e.clientY, window.innerHeight - 340)) })
  }
  const close = () => setMenu(null)
  const run = (fn: () => void) => () => {
    close()
    fn()
  }
  const commit = () => {
    if (!renaming) return
    const v = renaming.draft.trim()
    setRenaming(null)
    if (v) act.rename(renaming.kind, renaming.id, v)
  }
  const endDrag = () => {
    setDragT(null)
    setDropF(null)
  }
  const dropOn = (folder: string | null) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragT) act.move(dragT, folder)
    endDrag()
  }
  const overFolder = (id: string) => (e: DragEvent) => {
    if (!dragT) return
    e.preventDefault()
    e.stopPropagation()
    if (dropF !== id) setDropF(id)
  }

  const renameBox = (r: NonNullable<Renaming>) => (
    <input
      ref={renameRef}
      className={m.rename}
      autoFocus
      value={r.draft}
      maxLength={60}
      aria-label={r.kind === 'folder' ? 'Folder name' : 'Template name'}
      onChange={e => setRenaming({ ...r, draft: e.target.value })}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setRenaming(null)
        e.stopPropagation()
      }}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
    />
  )

  // The menu's lines.
  type Line = { sep: true } | { label: string } | { item: string; onClick: () => void; pad?: number; check?: boolean; red?: boolean; dis?: boolean; title?: string }
  let lines: Line[] = []
  if (menu?.kind === 'tpl') {
    const t = templates.find(x => x.id === menu.id)
    if (t) {
      const published = t.version > 0
      const last = templates.length < 2
      lines = [
        { item: 'Open', onClick: run(() => act.open(t.id)) },
        { item: 'Duplicate', onClick: run(() => act.duplicate(t.id)) },
        { item: 'Rename', onClick: run(() => setRenaming({ kind: 'tpl', id: t.id, draft: t.id === selId ? editOf(t).name : t.name })) },
        { sep: true },
        { label: 'Move to folder' },
        { item: 'No folder', pad: 28, check: !t.folder, onClick: run(() => act.move(t.id, null)) },
        ...folderTree(folders).map(({ folder, depth }) => ({ item: folder.name, pad: 28 + depth * 14, check: t.folder === folder.id, onClick: run(() => act.move(t.id, folder.id)) })),
        { item: '+ New folder…', pad: 28, onClick: run(() => act.newFolder(t.folder, t.id)) },
        { sep: true },
        // A template once published stays (the user's answer 8, kept for v2 on 2026-11-12): its versions are kept.
        {
          item: published ? 'Delete template' : menu.confirm ? 'Click again to delete' : 'Delete draft',
          red: true,
          dis: published || last,
          title: published ? 'A published template stays — its versions are kept' : last ? 'The last template stays' : undefined,
          onClick: () => (menu.confirm ? run(() => act.deleteTemplate(t.id))() : setMenu({ ...menu, confirm: true })),
        },
      ]
    }
  } else if (menu?.kind === 'folder') {
    const fo = folders.find(f => f.id === menu.id)
    if (fo) {
      lines = [
        { item: 'New template here', onClick: run(() => act.newTemplate(fo.id)) },
        { item: 'New folder inside', onClick: run(() => act.newFolder(fo.id)) },
        { item: 'Rename', onClick: run(() => setRenaming({ kind: 'folder', id: fo.id, draft: fo.name })) },
        { sep: true },
        { item: menu.confirm ? 'Click again to delete' : 'Delete folder', red: true, onClick: () => (menu.confirm ? run(() => act.deleteFolder(fo.id))() : setMenu({ ...menu, confirm: true })) },
        ...(menu.confirm ? [{ label: 'Templates inside move up a level' }] : []),
      ]
    }
  } else if (menu?.kind === 'root') {
    lines = [
      { item: 'New template', onClick: run(() => act.newTemplate(null)) },
      { item: 'New folder', onClick: run(() => act.newFolder(null)) },
    ]
  }

  return (
    <nav className={m.rail} aria-label="Minutes templates">
      <div className={m.railTop}>
        <div className={m.railHead}>
          <span className={m.railLabel}>Templates</span>
          <span className={m.railRight}>
            <span className={m.railCount}>{templates.length}</span>
            <button type="button" className={m.folderBtn} title="New folder" onClick={() => act.newFolder(null)}>+ Folder</button>
          </span>
        </div>
        <input className={m.search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" />
      </div>

      <div
        className={`${m.tree}${dropF === 'root' ? ` ${m.treeDrop}` : ''}`}
        onContextMenu={e => openMenu(e, 'root', null)}
        onDragOver={e => {
          if (!dragT) return
          e.preventDefault()
          if (dropF !== 'root') setDropF('root')
        }}
        onDragLeave={e => {
          if (e.currentTarget === e.target && dropF === 'root') setDropF(null)
        }}
        onDrop={dropOn(null)}
      >
        {items.map(it => {
          if (it.kind === 'folder') {
            const fo = it.folder
            const ren = renaming?.kind === 'folder' && renaming.id === fo.id ? renaming : null
            const cls = `${m.folder}${dropF === fo.id ? ` ${m.folderDrop}` : menu?.id === fo.id ? ` ${m.folderHot}` : ''}`
            return (
              <div
                key={`f${fo.id}`}
                role="button"
                tabIndex={0}
                aria-expanded={!it.collapsed}
                className={cls}
                style={{ '--pad': `${6 + it.depth * 16}px` } as CSSProperties}
                onClick={() => setCollapsed(c => ({ ...c, [fo.id]: !c[fo.id] }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setCollapsed(c => ({ ...c, [fo.id]: !c[fo.id] }))
                  }
                }}
                onContextMenu={e => openMenu(e, 'folder', fo.id)}
                onDragOver={overFolder(fo.id)}
                onDrop={dropOn(fo.id)}
              >
                <span className={m.caret} aria-hidden="true">{it.collapsed ? '▶' : '▼'}</span>
                <span className={m.folderIcon} aria-hidden="true">📁</span>
                {ren ? renameBox(ren) : <span className={m.folderName}>{fo.name}</span>}
                <span className={m.folderCount}>{it.count}</span>
              </div>
            )
          }
          const t = it.tpl
          const on = t.id === selId
          const st = railStatus(t, editOf(t), q.trim() ? fname(t.folder) : null)
          const ren = renaming?.kind === 'tpl' && renaming.id === t.id ? renaming : null
          const name = editOf(t).name || 'Untitled'
          return (
            <div
              key={`t${t.id}`}
              role="button"
              tabIndex={0}
              aria-current={on ? 'true' : undefined}
              title={st.title}
              draggable={!ren}
              className={`${m.tpl}${on ? ` ${m.tplOn}` : menu?.id === t.id ? ` ${m.tplHot}` : ''}${dragT === t.id ? ` ${m.tplDrag}` : ''}`}
              style={{ '--pad': `${10 + it.depth * 16}px` } as CSSProperties}
              onClick={() => act.open(t.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') act.open(t.id)
              }}
              onContextMenu={e => openMenu(e, 'tpl', t.id)}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', t.id)
                setDragT(t.id)
              }}
              onDragEnd={endDrag}
            >
              <span className={`${m.dot} ${STATUS_DOT[st.dot]}`} aria-hidden="true" />
              <div className={m.tplBody}>{ren ? renameBox(ren) : <div className={m.tplName}>{name}</div>}</div>
            </div>
          )
        })}
        {q.trim() && items.length === 0 ? <div className={m.noMatch}>No templates match</div> : null}
      </div>

      {menu && lines.length ? (
        <>
          <div className={m.menuScrim} onClick={close} onContextMenu={e => { e.preventDefault(); close() }} />
          <div className={m.menu} role="menu" style={{ left: menu.x, top: menu.y }}>
            {lines.map((l, i) =>
              'sep' in l ? <div key={i} className={m.mSep} role="separator" />
              : 'label' in l ? <div key={i} className={m.mLabel}>{l.label}</div>
              : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={`${m.mItem}${l.red ? ` ${m.mRed}` : ''}`}
                  style={l.pad ? ({ '--pad': `${l.pad}px` } as CSSProperties) : undefined}
                  disabled={l.dis}
                  title={l.title}
                  onClick={e => {
                    e.stopPropagation()
                    l.onClick()
                  }}
                >
                  <span className={m.mText}>{l.item}</span>
                  <span className={m.mCheck}>{l.check ? '✓' : ''}</span>
                </button>
              ),
            )}
          </div>
        </>
      ) : null}
    </nav>
  )
}
