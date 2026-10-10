'use client'

import { useEffect, useState, useTransition, type CSSProperties, type DragEvent } from 'react'
import { btn, hv } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { levelLabel, levelRows, titleTone, type RolePerson, type RoleRung, type RoleTitle } from '@/lib/hierarchy-roles'
import { deleteLevel, insertLevel, renameLevel, setTitleLevel } from '../ladder-actions'
import s from './hierarchy.module.css'

const UNPLACED = '__unplaced__'

/**
 * Hierarchy › Levels as the handoff draws it (2026-10-10): the ladder top
 * down, one row per level — "L7" and its titles as coloured chips, "No title
 * on this level" when it holds none. Kept editable (the user's A): drag a
 * chip onto another level (or press it for Move to …), click a level's name
 * to rename it, + Add level puts an empty one on top, an empty level can go.
 */
export default function LevelsList({
  rungs,
  titles,
  people,
  breaks,
  canManage,
}: {
  rungs: RoleRung[]
  titles: RoleTitle[]
  people: RolePerson[]
  /** Reporting lines the ladder, as it stands, would refuse. */
  breaks: number
  canManage: boolean
}) {
  // Moves shown before the server answers; dropped when the page's props catch up.
  const [moved, setMoved] = useState<Record<string, string | null>>({})
  const [over, setOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => setMoved({}), [titles])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const shown = titles.map(t => (t.id in moved ? { ...t, levelId: moved[t.id] } : t))
  const rows = levelRows(rungs, shown, people)
  const top = rungs.reduce((m, r) => Math.max(m, r.rank), 0)

  function run(work: () => Promise<{ ok: true } | { ok: false; reason: string }>, done?: string, undo?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await work()
        if (!result.ok) {
          undo?.()
          setError(result.reason)
          return
        }
        if (done) flash(done)
      } catch {
        undo?.()
        setError('That could not be saved. Please try again.')
      }
    })
  }

  function move(title: RoleTitle, levelId: string | null) {
    setMenu(null)
    const current = title.id in moved ? moved[title.id] : title.levelId
    if (current === levelId) return
    setMoved(m => ({ ...m, [title.id]: levelId }))
    const rung = rungs.find(r => r.id === levelId)
    run(
      () => setTitleLevel(title.id, levelId),
      rung ? `${title.name} moved to ${levelLabel(rung.rank)}` : `${title.name} taken off the ladder`,
      () =>
        setMoved(m => {
          const next = { ...m }
          delete next[title.id]
          return next
        }),
    )
  }

  function drop(e: DragEvent<HTMLDivElement>, levelId: string | null) {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain') || dragging
    setDragging(null)
    const title = shown.find(t => t.id === id)
    if (title) move(title, levelId)
  }

  return (
    <div>
      {breaks > 0 ? (
        <p className={s.warn}>
          {breaks} reporting {breaks === 1 ? 'line stands' : 'lines stand'} against the ladder as it is — the org chart marks{' '}
          {breaks === 1 ? 'it' : 'them'} red.
        </p>
      ) : null}
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
      {canManage ? (
        <div className={s.levelsBar}>
          <button
            type="button"
            className={btn('outline')}
            disabled={pending}
            onClick={() => run(() => insertLevel(top + 1), `${levelLabel(top + 1)} added on top`)}
          >
            + Add level
          </button>
        </div>
      ) : null}
      <div className={s.levels}>
        {rows.map(row => {
          const key = row.rung?.id ?? UNPLACED
          const empty = row.titles.length === 0
          const editing = renaming && row.rung && renaming.id === row.rung.id
          return (
            <div
              key={key}
              className={s.level}
              data-empty={empty ? 'true' : undefined}
              data-over={over === key ? 'true' : undefined}
              onDragOver={canManage ? e => {
                e.preventDefault()
                setOver(key)
              } : undefined}
              onDragLeave={canManage ? () => setOver(o => (o === key ? null : o)) : undefined}
              onDrop={canManage ? e => drop(e, row.rung?.id ?? null) : undefined}
              aria-label={row.rung ? `${levelLabel(row.rung.rank)} ${row.rung.name}` : 'Not on the ladder'}
              role="group"
            >
              <span className={s.levelL}>{row.rung ? levelLabel(row.rung.rank) : '—'}</span>
              <div className={s.levelBody}>
                <div className={s.chips}>
                  {row.titles.map(({ title, people: n }) => {
                    const [bg, fg] = titleTone(title.name)
                    return (
                      <span key={title.id} className={s.chipWrap}>
                        <button
                          type="button"
                          className={s.chip}
                          style={{ '--tone-bg': bg, '--tone-fg': fg } as CSSProperties}
                          draggable={canManage}
                          data-inactive={title.isActive ? undefined : 'true'}
                          data-moving={dragging === title.id ? 'true' : undefined}
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', title.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setDragging(title.id)
                          }}
                          onDragEnd={() => {
                            setDragging(null)
                            setOver(null)
                          }}
                          onClick={e => {
                            if (!canManage) return
                            e.stopPropagation()
                            setMenu(m => (m === title.id ? null : title.id))
                          }}
                          aria-haspopup={canManage ? 'menu' : undefined}
                          aria-expanded={canManage ? menu === title.id : undefined}
                          title={[title.departmentName, title.isActive ? null : 'inactive'].filter(Boolean).join(' · ') || undefined}
                        >
                          {title.name} · {n}
                        </button>
                        {menu === title.id ? (
                          <div className={`${hv.menu} ${s.moveMenu}`} role="menu" aria-label={`Move ${title.name}`} onClick={e => e.stopPropagation()}>
                            {[...rungs]
                              .sort((a, b) => b.rank - a.rank)
                              .map(r => (
                                <button
                                  key={r.id}
                                  type="button"
                                  role="menuitem"
                                  className={hv.menuItem}
                                  aria-current={r.id === title.levelId ? 'true' : undefined}
                                  onClick={() => move(title, r.id)}
                                >
                                  Move to {levelLabel(r.rank)} · {r.name}
                                </button>
                              ))}
                            <div className={hv.menuRule} />
                            <button type="button" role="menuitem" className={hv.menuItem} onClick={() => move(title, null)}>
                              Take off the ladder
                            </button>
                          </div>
                        ) : null}
                      </span>
                    )
                  })}
                  {empty ? <span className={s.levelEmpty}>No title on this level</span> : null}
                </div>
                {row.rung ? (
                  editing ? (
                    <input
                      className={s.levelInput}
                      value={renaming!.name}
                      autoFocus
                      aria-label={`Rename ${levelLabel(row.rung.rank)}`}
                      onChange={e => setRenaming({ id: row.rung!.id, name: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setRenaming(null)
                        if (e.key === 'Enter') {
                          const rung = row.rung!
                          const name = renaming!.name
                          setRenaming(null)
                          if (name.trim() && name.trim() !== rung.name) run(() => renameLevel(rung.id, name), `${levelLabel(rung.rank)} renamed`)
                        }
                      }}
                      onBlur={() => setRenaming(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={s.levelName}
                      disabled={!canManage}
                      onClick={() => setRenaming({ id: row.rung!.id, name: row.rung!.name })}
                      title={canManage ? 'Rename this level' : undefined}
                    >
                      {row.rung.name}
                    </button>
                  )
                ) : (
                  <span className={s.levelName}>Not on the ladder</span>
                )}
                {canManage && row.rung && empty && !editing ? (
                  <button
                    type="button"
                    className={s.levelRemove}
                    disabled={pending}
                    onClick={() => {
                      const rung = row.rung!
                      run(() => deleteLevel(rung.id), `${levelLabel(rung.rank)} removed`)
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
