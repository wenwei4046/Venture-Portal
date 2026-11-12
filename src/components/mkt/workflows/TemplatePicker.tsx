'use client'

import { useRef, useState, type MouseEvent } from 'react'
import type { WfCategory, WfTemplate } from '@/lib/marketing/workflows'
import { longPress } from './longPress'
import w from './workflows.module.css'

// The header's template picker (`Workflow Builder v2.dc.html` › 2a): "{emoji} {Category} / {Template} ▼", opening the
// categories with their templates — hover a template for ⧉ Clone and ✕ Delete (asked once, "Delete?" in a red pill;
// leaving the row cancels), double-click a name to rename it (Enter saves, Esc cancels), right-click (or long-press)
// for more, "+ Template" beside each category, "+ New category" inline (Enter makes it with a Standard template).
// A template once published stays (the user's answer 8): its ✕ is greyed with the reason.

export type PickTarget = { type: 'tpl' | 'cat'; id: string }
export interface Renaming extends PickTarget {
  draft: string
}

const PUBLISHED_STAYS = 'A published template stays — its versions are kept'

export default function TemplatePicker({
  categories,
  current,
  open,
  busy,
  renaming,
  onToggle,
  onOpen,
  onClone,
  onDelete,
  onAddTemplate,
  onNewCategory,
  onRename,
  onRenaming,
  onMenu,
}: {
  categories: (WfCategory & { templates: WfTemplate[] })[]
  /** The template open (its name as typed). */
  current: { id: string; emoji: string; category: string; tname: string } | null
  open: boolean
  busy: boolean
  renaming: Renaming | null
  onToggle: () => void
  onOpen: (id: string) => void
  onClone: (id: string) => void
  onDelete: (id: string) => void
  onAddTemplate: (categoryId: string) => void
  onNewCategory: (name: string) => void
  onRename: (target: PickTarget, name: string) => void
  onRenaming: (r: Renaming | null) => void
  /** Open the right-click menu at a point on the screen. */
  onMenu: (x: number, y: number, target: PickTarget) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const addingRef = useRef(false)

  // Enter commits, then the input leaves and blurs: the second commit is ignored.
  const committed = useRef<string | null>(null)
  const commitRename = () => {
    if (!renaming) return
    const once = `${renaming.type}:${renaming.id}:${renaming.draft}`
    if (committed.current === once) return
    committed.current = once
    const name = renaming.draft.trim()
    onRenaming(null)
    if (name) onRename({ type: renaming.type, id: renaming.id }, name)
  }
  const commitCategory = () => {
    if (!addingRef.current) return
    addingRef.current = false
    const name = draft.trim()
    setAdding(false)
    setDraft('')
    if (name) onNewCategory(name)
  }
  const nameInput = (label: string) => (
    <input
      className={w.nameInput}
      autoFocus
      value={renaming?.draft ?? ''}
      maxLength={60}
      aria-label={label}
      onClick={e => e.stopPropagation()}
      onChange={e => renaming && onRenaming({ ...renaming, draft: e.target.value })}
      onKeyDown={e => {
        if (e.key === 'Enter') commitRename()
        else if (e.key === 'Escape') onRenaming(null)
      }}
      onBlur={commitRename}
    />
  )
  const menuOn = (target: PickTarget) => ({
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onMenu(e.clientX, e.clientY, target)
    },
    ...longPress((x, y) => onMenu(x, y, target)),
  })

  return (
    <div className={w.pick} onClick={e => e.stopPropagation()}>
      <button type="button" className={w.pickBtn} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>
        {current ? (
          <>
            <span>{current.emoji}</span>
            <span className={w.pickAct}>{current.category}</span>
            <span className={w.pickSlash}>/</span>
            <span className={w.pickTpl}>{current.tname || 'Untitled'}</span>
          </>
        ) : (
          <span className={w.pickAct}>Pick a template</span>
        )}
        <span className={w.caret}>▼</span>
      </button>
      {open ? (
        <div className={w.pickMenu} role="menu" aria-label="Templates">
          {categories.map(cat => (
            <div key={cat.id} className={w.cat}>
              <div className={w.catRow} {...menuOn({ type: 'cat', id: cat.id })}>
                <span className={w.catEmoji}>{cat.emoji}</span>
                {renaming?.type === 'cat' && renaming.id === cat.id ? nameInput('Category name') : (
                  <span className={w.catName} title="Double-click to rename" onDoubleClick={e => { e.stopPropagation(); onRenaming({ type: 'cat', id: cat.id, draft: cat.name }) }}>{cat.name}</span>
                )}
                <button type="button" className={w.addTpl} disabled={busy} onClick={() => onAddTemplate(cat.id)}>+ Template</button>
              </div>
              {cat.templates.map(t => {
                const on = t.id === current?.id
                const isArmed = armed === t.id
                const published = t.version > 0
                const name = on ? current?.tname || t.tname : t.tname
                return (
                  <div
                    key={t.id}
                    role="menuitem"
                    tabIndex={0}
                    aria-current={on ? 'true' : undefined}
                    className={`${w.tplRow}${on ? ` ${w.tplOn}` : ''}`}
                    onClick={() => onOpen(t.id)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(t.id) }}
                    onMouseEnter={() => hover !== t.id && setHover(t.id)}
                    onMouseLeave={() => {
                      setHover(h => (h === t.id ? null : h))
                      setArmed(a => (a === t.id ? null : a))
                    }}
                    {...menuOn({ type: 'tpl', id: t.id })}
                  >
                    {renaming?.type === 'tpl' && renaming.id === t.id ? nameInput('Template name') : (
                      <span className={w.tplName} title="Double-click to rename" onDoubleClick={e => { e.stopPropagation(); onRenaming({ type: 'tpl', id: t.id, draft: name }) }}>{name}</span>
                    )}
                    <div className={`${w.tplIcons}${hover === t.id || isArmed ? ` ${w.tplIconsOn}` : ''}`}>
                      <button type="button" className={w.tplClone} title="Clone" aria-label={`Clone ${name}`} disabled={busy}
                        onClick={e => { e.stopPropagation(); onClone(t.id) }}>⧉</button>
                      <button
                        type="button"
                        className={`${w.tplDel}${isArmed ? ` ${w.tplDelArmed}` : ''}`}
                        title={published ? PUBLISHED_STAYS : isArmed ? 'Click again to delete' : 'Delete'}
                        aria-label={isArmed ? `Click again to delete ${name}` : `Delete ${name}`}
                        disabled={published || busy}
                        onClick={e => {
                          e.stopPropagation()
                          if (isArmed) {
                            setArmed(null)
                            onDelete(t.id)
                          } else setArmed(t.id)
                        }}
                      >
                        {isArmed ? 'Delete?' : '✕'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <div className={w.pickFoot}>
            {adding ? (
              <input
                className={w.newCatInput}
                autoFocus
                value={draft}
                maxLength={60}
                placeholder="Category name, Enter"
                aria-label="New category"
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitCategory()
                  else if (e.key === 'Escape') {
                    addingRef.current = false
                    setAdding(false)
                    setDraft('')
                  }
                }}
                onBlur={commitCategory}
              />
            ) : (
              <button type="button" className={w.newCat} disabled={busy} onClick={() => { addingRef.current = true; setAdding(true); setDraft('') }}>+ New category</button>
            )}
            <span className={w.hint}>Double-click a name to rename · right-click for more</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { PUBLISHED_STAYS }
