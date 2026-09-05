'use client'

import { useMemo, useRef, useState, useTransition, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorNote, Hint, SectionHead } from '@/components/RowForm'
import type { Rung } from '@/lib/ladder'
import { deleteLevel, insertLevel, renameLevel, setTitleLevel } from '../ladder-actions'

export interface BoardTitle {
  id: string
  name: string
  departmentId: string | null
  departmentName: string | null
  /** Null = not placed on the ladder. */
  levelId: string | null
  people: number
  isActive: boolean
}

/** Column key for titles that belong to no department. */
const NO_DEPT = ''
/** Drop-target key for the tray under the board. */
const TRAY = '__tray__'

interface Column {
  key: string
  name: string
}

/**
 * The ladder, as a board.
 *
 * Rows are the rungs, top is most senior; columns are the departments; a
 * title is a chip in the cell where its department and its rung meet. That
 * layout is the whole argument for a shared scale: Finance's Assistant Manager
 * and Marketing's sit on the same row, which is what lets the Hierarchy page
 * compare them when somebody is dragged across departments.
 *
 * A chip moves up and down its own column — a title's department is set in
 * the title table, not here — by drag, or by the arrows on the chip for
 * anybody who would rather click. Below the board is the tray: titles nobody
 * has placed yet. They are outside the rule until they are.
 *
 * Every change is one round trip and a refresh, no local copy of the state:
 * the board is edited rarely and read often, and a copy that could drift from
 * what the org chart is checked against is not worth the responsiveness.
 */
export default function LevelsBoard({
  rungs,
  titles,
  breaks,
}: {
  rungs: Rung[]
  titles: BoardTitle[]
  /** Reporting lines the ladder, as it stands, would refuse. */
  breaks: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; column: string } | null>(null)
  // The same fact, readable synchronously: the first dragover can arrive
  // before React has re-rendered with `dragging` set, and a dragover that is
  // not answered with preventDefault makes the browser refuse the drop.
  const dragSource = useRef<{ id: string; column: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  // Top rung first.
  const rows = useMemo(() => [...rungs].sort((a, b) => b.rank - a.rank), [rungs])
  const top = rows[0] ?? null
  const bottom = rows[rows.length - 1] ?? null

  const columns: Column[] = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of titles) {
      seen.set(t.departmentId ?? NO_DEPT, t.departmentName ?? '— No department')
    }
    return [...seen.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) =>
        a.key === NO_DEPT ? 1 : b.key === NO_DEPT ? -1 : a.name.localeCompare(b.name),
      )
  }, [titles])

  const cells = useMemo(() => {
    const map = new Map<string, BoardTitle[]>()
    for (const t of titles) {
      if (!t.levelId) continue
      const key = cellKey(t.levelId, t.departmentId ?? NO_DEPT)
      const list = map.get(key)
      if (list) list.push(t)
      else map.set(key, [t])
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [titles])

  const unplaced = useMemo(
    () =>
      titles
        .filter(t => !t.levelId)
        .sort(
          (a, b) =>
            (a.departmentName ?? '').localeCompare(b.departmentName ?? '') ||
            a.name.localeCompare(b.name),
        ),
    [titles],
  )
  const placed = titles.length - unplaced.length

  /** Rungs with at least one title on them — the ones that cannot be deleted. */
  const occupied = useMemo(() => {
    const set = new Set<string>()
    for (const t of titles) if (t.levelId) set.add(t.levelId)
    return set
  }, [titles])

  function run(fallback: string, work: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await work()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : fallback)
      }
    })
  }

  function place(title: BoardTitle, levelId: string | null) {
    if (title.levelId === levelId) return
    run('Could not move the title', () => setTitleLevel(title.id, levelId))
  }

  /** The rung one step up (+1) or down (−1) from a rung, if there is one. */
  function neighbour(levelId: string, dir: 1 | -1): Rung | null {
    const here = rungs.find(r => r.id === levelId)
    if (!here) return null
    let best: Rung | null = null
    for (const r of rungs) {
      if (dir > 0 ? r.rank <= here.rank : r.rank >= here.rank) continue
      if (!best || (dir > 0 ? r.rank < best.rank : r.rank > best.rank)) best = r
    }
    return best
  }

  // ── Drag and drop ──────────────────────────────────────────────────────
  // Native HTML5, no library: a chip is draggable, a cell in the same column
  // (or the tray) accepts it. A cell in another column never calls
  // preventDefault, so the browser itself shows it cannot take the drop.

  function onDragStart(e: DragEvent<HTMLElement>, t: BoardTitle) {
    const source = { id: t.id, column: t.departmentId ?? NO_DEPT }
    e.dataTransfer.setData('text/plain', t.id)
    e.dataTransfer.effectAllowed = 'move'
    dragSource.current = source
    setDragging(source)
  }

  function onDragEnd() {
    dragSource.current = null
    setDragging(null)
    setOver(null)
  }

  function allow(e: DragEvent<HTMLElement>, key: string, column: string | null) {
    const source = dragSource.current
    if (!source) return
    if (column !== null && column !== source.column) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (over !== key) setOver(key)
  }

  function leave(e: DragEvent<HTMLElement>, key: string) {
    // dragleave fires when the pointer moves onto a child; that is not leaving.
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    if (over === key) setOver(null)
  }

  function drop(e: DragEvent<HTMLElement>, levelId: string | null, column: string | null) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragSource.current?.id
    dragSource.current = null
    setDragging(null)
    setOver(null)
    const t = titles.find(x => x.id === id)
    if (!t) return
    if (column !== null && (t.departmentId ?? NO_DEPT) !== column) return
    place(t, levelId)
  }

  // ── Rungs ──────────────────────────────────────────────────────────────

  function addOnTop() {
    run('Could not add a level', () => insertLevel((top?.rank ?? 0) + 1))
  }

  function commitRename(rung: Rung, value: string) {
    setRenaming(null)
    const name = value.trim()
    if (!name || name === rung.name) return
    run('Could not rename the level', () => renameLevel(rung.id, name))
  }

  function remove(rung: Rung) {
    if (!window.confirm(`Remove the level "${rung.name}"?`)) return
    run('Could not remove the level', () => deleteLevel(rung.id))
  }

  const count =
    rungs.length === 0
      ? 'NO LEVELS'
      : `${rungs.length} ${rungs.length === 1 ? 'LEVEL' : 'LEVELS'} · ${placed} OF ${titles.length} ${
          titles.length === 1 ? 'TITLE' : 'TITLES'
        } PLACED${pending ? ' · SAVING…' : ''}`

  return (
    <section id="levels" className="mb-12 scroll-mt-6" aria-busy={pending}>
      <SectionHead
        title="Levels"
        count={count}
        action={
          <button
            type="button"
            onClick={addOnTop}
            disabled={pending}
            className="text-xs font-sans text-accent hover:underline disabled:opacity-50"
          >
            + Add level
          </button>
        }
      />

      <Hint>
        Every title stands on one level, and the top row is the most senior.
        A person can be promoted to the next level up in their own department,
        and the chart below will not put anybody under somebody the ladder
        ranks below them. A title not placed yet is outside the rule. Drag a
        title up or down its column, or use the arrows; click a level&apos;s
        name to rename it.
      </Hint>

      <ErrorNote error={error} />

      {breaks > 0 ? (
        <p className="mb-4 font-serif italic text-sm text-alert">
          {breaks} reporting {breaks === 1 ? 'line breaks' : 'lines break'} this ladder as it
          stands.{' '}
          <a href="#chart" className="not-italic font-sans text-xs text-accent hover:underline">
            Marked red on the chart below ↓
          </a>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="py-10 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-muted text-sm">
            No levels yet. Add one, then drag titles onto it.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table min-w-[760px]">
            <thead>
              <tr>
                <th className="w-[210px]">Level</th>
                {columns.map(c => (
                  <th key={c.key}>{c.name}</th>
                ))}
                {columns.length === 0 ? <th>Titles</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(rung => (
                <tr key={rung.id} className="group/row">
                  <td className="align-top">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10.5px] text-muted shrink-0">
                        L{rung.rank}
                      </span>
                      {renaming === rung.id ? (
                        <RenameField rung={rung} onCommit={commitRename} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRenaming(rung.id)}
                          title="Rename this level"
                          className="font-serif text-sm text-ink hover:text-accent text-left leading-tight"
                        >
                          {rung.name}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 mt-1.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() =>
                          run('Could not add a level', () => insertLevel(rung.rank + 1))
                        }
                        disabled={pending}
                        className="font-sans text-[10.5px] text-graphite hover:text-accent disabled:opacity-50"
                      >
                        + above
                      </button>
                      {bottom && rung.id === bottom.id ? (
                        <button
                          type="button"
                          onClick={() => run('Could not add a level', () => insertLevel(1))}
                          disabled={pending}
                          className="font-sans text-[10.5px] text-graphite hover:text-accent disabled:opacity-50"
                        >
                          + below
                        </button>
                      ) : null}
                      {!occupied.has(rung.id) ? (
                        <button
                          type="button"
                          onClick={() => remove(rung)}
                          disabled={pending}
                          className="font-sans text-[10.5px] text-graphite hover:text-danger disabled:opacity-50"
                        >
                          remove
                        </button>
                      ) : null}
                    </div>
                  </td>

                  {columns.map(col => {
                    const key = cellKey(rung.id, col.key)
                    const list = cells.get(key) ?? []
                    const foreign = dragging !== null && dragging.column !== col.key
                    return (
                      <td
                        key={col.key}
                        className={`align-top transition-colors ${
                          over === key ? 'bg-accent-bg' : ''
                        } ${foreign ? 'opacity-40' : ''}`}
                        onDragOver={e => allow(e, key, col.key)}
                        onDragLeave={e => leave(e, key)}
                        onDrop={e => drop(e, rung.id, col.key)}
                      >
                        <div className="flex flex-wrap gap-1.5 min-h-[30px]">
                          {list.map(t => {
                            const up = neighbour(rung.id, 1)
                            const down = neighbour(rung.id, -1)
                            return (
                              <Chip
                                key={t.id}
                                title={t}
                                busy={pending}
                                canUp={up !== null}
                                onUp={() => up && place(t, up.id)}
                                downLabel={
                                  down
                                    ? `Move ${t.name} down to ${down.name}`
                                    : `Take ${t.name} off the ladder`
                                }
                                onDown={() => place(t, down ? down.id : null)}
                                onDragStart={e => onDragStart(e, t)}
                                onDragEnd={onDragEnd}
                              />
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                  {columns.length === 0 ? <td /> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The tray: titles not on the ladder. A drop here takes one off it. */}
      <div
        className={`mt-4 rounded-card border border-dashed p-3 transition-colors ${
          over === TRAY ? 'border-accent bg-accent-bg' : 'border-hairline bg-surface'
        }`}
        onDragOver={e => allow(e, TRAY, null)}
        onDragLeave={e => leave(e, TRAY)}
        onDrop={e => drop(e, null, null)}
      >
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted">
            Not on the ladder
          </span>
          <span className="font-mono text-[0.6rem] text-muted">· {unplaced.length}</span>
        </div>
        {unplaced.length === 0 ? (
          <p className="font-serif italic text-muted text-xs">
            Every title is placed. Drop one here to take it off the ladder.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map(t => (
              <div
                key={t.id}
                draggable={!pending}
                onDragStart={e => onDragStart(e, t)}
                onDragEnd={onDragEnd}
                title={`${t.name} · ${t.departmentName ?? 'no department'}`}
                className={`inline-flex items-center gap-2 max-w-full rounded-control border border-hairline bg-paper pl-2 pr-1 py-1 cursor-grab active:cursor-grabbing ${
                  t.isActive ? '' : 'opacity-60'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-sans text-[11.5px] leading-tight text-ink">
                    {t.name}
                  </span>
                  <span className="block font-mono text-[9.5px] uppercase tracking-wide text-muted mt-0.5 truncate">
                    {t.departmentName ?? 'no department'}
                    {t.people > 0 ? ` · ${t.people}` : ''}
                  </span>
                </span>
                {rows.length > 0 ? (
                  <select
                    aria-label={`Place ${t.name} on a level`}
                    value=""
                    disabled={pending}
                    onChange={e => {
                      if (e.target.value) place(t, e.target.value)
                    }}
                    className="px-1 py-0.5 bg-surface border border-hairline rounded text-[11px] text-graphite max-w-[120px]"
                  >
                    <option value="">Place on…</option>
                    {rows.map(r => (
                      <option key={r.id} value={r.id}>
                        L{r.rank} · {r.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function cellKey(levelId: string, column: string): string {
  return `${levelId}|${column}`
}

/** A title on the board: its name, its headcount, and the two arrows. */
function Chip({
  title,
  busy,
  canUp,
  onUp,
  downLabel,
  onDown,
  onDragStart,
  onDragEnd,
}: {
  title: BoardTitle
  busy: boolean
  canUp: boolean
  onUp: () => void
  downLabel: string
  onDown: () => void
  onDragStart: (e: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}) {
  const people =
    title.people > 0 ? ` · ${title.people} ${title.people === 1 ? 'person' : 'people'}` : ''
  return (
    <div
      draggable={!busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${title.name}${people}${title.isActive ? '' : ' · inactive'}`}
      className={`group/chip inline-flex items-center gap-1.5 max-w-full rounded-control border border-hairline bg-paper pl-2 pr-0.5 py-0.5 cursor-grab active:cursor-grabbing ${
        title.isActive ? '' : 'opacity-60'
      }`}
    >
      <span className="font-sans text-[11.5px] leading-tight text-ink">{title.name}</span>
      {title.people > 0 ? (
        <span className="font-mono text-[10px] text-muted">{title.people}</span>
      ) : null}
      <span className="inline-flex flex-col leading-none">
        <button
          type="button"
          onClick={onUp}
          disabled={busy || !canUp}
          aria-label={`Move ${title.name} up a level`}
          className="px-1 text-[8px] leading-[10px] text-graphite opacity-50 group-hover/chip:opacity-100 hover:!text-accent disabled:opacity-15 disabled:hover:!text-graphite"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={busy}
          aria-label={downLabel}
          className="px-1 text-[8px] leading-[10px] text-graphite opacity-50 group-hover/chip:opacity-100 hover:!text-accent disabled:opacity-15"
        >
          ▼
        </button>
      </span>
    </div>
  )
}

/** The rename box. Enter or leaving the box saves; Escape puts the name back. */
function RenameField({
  rung,
  onCommit,
}: {
  rung: Rung
  onCommit: (rung: Rung, value: string) => void
}) {
  // Enter commits and unmounts the box, and the blur that follows must not
  // commit a second time.
  const done = useRef(false)
  function commit(value: string) {
    if (done.current) return
    done.current = true
    onCommit(rung, value)
  }
  return (
    <input
      autoFocus
      defaultValue={rung.name}
      maxLength={60}
      aria-label={`Name of level ${rung.rank}`}
      className="w-full px-1.5 py-0.5 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border"
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(e.currentTarget.value)
        } else if (e.key === 'Escape') {
          commit(rung.name)
        }
      }}
      onBlur={e => commit(e.currentTarget.value)}
    />
  )
}
