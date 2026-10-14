'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  EMPTY_LAYOUT,
  applyOrder,
  fetchDefaultLayout,
  fetchSavedLayout,
  isCustomised,
  readCachedDefault,
  readCachedLayout,
  saveDefaultLayout,
  saveLayout,
  writeCachedDefault,
  writeCachedLayout,
  type TableLayout,
} from '@/lib/table-layout'
import { Chip, type ChipTone } from './Hub'
import s from './hub.module.css'

// The hub's table (2026-10-14, the Finance revamp v2 — D03 / D04 of
// `.design/fin-r2/handoff`): Name · Description · Amount always, the rest
// ticked on in the Columns panel; every heading sorts (↕ → ▲ → ▼ → off),
// filters by its values (the funnel; not Amount), moves when dragged onto
// another and widens from its right edge (never under 70px). The arrangement
// — which columns, their order and widths — follows the account (the
// portal's saved layouts, lib/table-layout); the sort and the filters this
// browser (a convenience: the list says "· filtered" while one is on).

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const MIN_WIDTH = 70

export interface FinColumn<R> {
  key: string
  label: string
  /** How a cell is set: the name in ink, a figure in mono at the right, a number in mono, a chip… */
  kind: 'name' | 'desc' | 'amount' | 'no' | 'date' | 'text' | 'chip'
  /** One of the three that are always on show. */
  fixed?: boolean
  /** A fixed column's width, or a fluid column's basis (px). */
  width: number
  /** A fluid column grows from `width` and never shrinks under `min`. */
  min?: number
  /** What it sorts by (a date as YYYY-MM-DD). */
  value: (r: R) => string | number
  /** What the cell says — and what its filter lists. */
  text: (r: R) => string
  chip?: (r: R) => { text: string; tone: ChipTone } | null
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null
type Filters = Record<string, string[]>

const viewKey = (id: string) => `fin-table-view:${id}`
function readView(id: string): { sort: Sort; filters: Filters } {
  try {
    const raw = window.localStorage.getItem(viewKey(id))
    if (!raw) return { sort: null, filters: {} }
    const v = JSON.parse(raw) as { sort?: Sort; filters?: Filters }
    return { sort: v.sort ?? null, filters: v.filters ?? {} }
  } catch {
    return { sort: null, filters: {} }
  }
}
function writeView(id: string, sort: Sort, filters: Filters) {
  try {
    const live = Object.fromEntries(Object.entries(filters).filter(([, v]) => v.length > 0))
    if (!sort && Object.keys(live).length === 0) window.localStorage.removeItem(viewKey(id))
    else window.localStorage.setItem(viewKey(id), JSON.stringify({ sort, filters: live }))
  } catch {
    // Private mode — the view simply is not kept.
  }
}

const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function FinTable<R>({
  layoutId,
  title,
  rows,
  rowKey,
  columns,
  amountOf,
  itemsOf,
  faint,
  search,
  activeKey,
  onRowClick,
  onRowContextMenu,
  emptyText,
  canSetDefault = false,
  countText,
  children,
}: {
  /** Names the saved arrangement — each page arranges its own. */
  layoutId: string
  title: string
  rows: R[]
  rowKey: (r: R) => string
  columns: FinColumn<R>[]
  /** The figure the count sums ("11 · RM 457,783.00"). */
  amountOf: (r: R) => number
  /** How many the count counts for a row — a folded payroll batch stands for its members (1 when left out). */
  itemsOf?: (r: R) => number
  /** A row whose figure is grey (a voided voucher). */
  faint?: (r: R) => boolean
  search?: { value: string; onChange: (v: string) => void; placeholder: string } | null
  /** The row open in the drawer, in peach. */
  activeKey?: string | null
  onRowClick: (r: R) => void
  onRowContextMenu?: (r: R, e: MouseEvent<HTMLElement>) => void
  emptyText: string
  canSetDefault?: boolean
  /** The count beside the title when the list is not the table's ("6 batches · 71 vouchers"). */
  countText?: string
  /** Drawn in place of the table (the payroll batches), under the toolbar. */
  children?: ReactNode
}) {
  const extras = useMemo(() => columns.filter((c) => !c.fixed).map((c) => c.key), [columns])
  const [own, setOwn] = useState<TableLayout>(EMPTY_LAYOUT)
  const [shared, setShared] = useState<TableLayout>(EMPTY_LAYOUT)
  const [sort, setSort] = useState<Sort>(null)
  const [filters, setFilters] = useState<Filters>({})
  const [colOpen, setColOpen] = useState(false)
  const [pop, setPop] = useState<{ key: string; left: number; top: number } | null>(null)
  const [drag, setDrag] = useState<{ from: string | null; over: string | null }>({ from: null, over: null })
  const panelRef = useRef<HTMLDivElement>(null)
  // Once the person has changed the arrangement here, an answer from the account that lands later is older than it.
  const touched = useRef(false)

  // The arrangement this browser kept, then the account's (and the table's default) — the account's wins.
  useIsoLayoutEffect(() => {
    setOwn(readCachedLayout(layoutId))
    setShared(readCachedDefault(layoutId))
    const v = readView(layoutId)
    setSort(v.sort)
    setFilters(v.filters)
    let live = true
    void fetchSavedLayout(layoutId).then((l) => {
      if (live && l && !touched.current) {
        setOwn(l)
        writeCachedLayout(layoutId, l)
      }
    })
    void fetchDefaultLayout(layoutId).then((l) => {
      if (live && l) {
        setShared(l)
        writeCachedDefault(layoutId, l)
      }
    })
    return () => {
      live = false
    }
  }, [layoutId])

  const layout = isCustomised(own) ? own : shared
  const hidden = isCustomised(layout) ? layout.hidden : extras
  const visible = columns.filter((c) => c.fixed || !hidden.includes(c.key))
  // The person's order; a column ticked on since takes its place in the code's (Name · Description · … · Amount).
  const shown = applyOrder(visible, layout.order)
  const order = shown.map((c) => c.key)
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const widths = layout.widths

  const keep = (next: TableLayout) => {
    touched.current = true
    setOwn(next)
    writeCachedLayout(layoutId, next)
    saveLayout(layoutId, next)
  }
  const keepView = (nextSort: Sort, nextFilters: Filters) => {
    setSort(nextSort)
    setFilters(nextFilters)
    writeView(layoutId, nextSort, nextFilters)
  }
  // The order is the person's only once they move a column; ticking or widening keeps it as it is. A layout
  // with every extra on is still the person's own (else it would read as the code's, every extra off).
  const current = (patch: Partial<TableLayout>): TableLayout => {
    const next = { order: layout.order, widths: { ...widths }, hidden: [...hidden], ...patch }
    return isCustomised(next) ? next : { ...next, order: columns.map((c) => c.key) }
  }

  // A column's place in the row: fixed at its width, or fluid from its basis.
  const fx = (c: FinColumn<R>) => {
    const w = widths[c.key]
    if (w || !c.min) {
      const px = w || c.width
      return { style: { flex: 'none', width: px, minWidth: 0 }, min: px }
    }
    return { style: { flex: `1 1 ${c.width}px`, width: c.width, minWidth: c.min }, min: c.min }
  }
  const tableWidth = shown.reduce((n, c) => n + fx(c).min, 0) + 32

  // ── Filters, then the sort ──
  const active = Object.entries(filters).filter(([k, v]) => v.length > 0 && byKey.has(k))
  const filtered = active.length === 0 ? rows : rows.filter((r) => active.every(([k, vals]) => vals.includes(byKey.get(k)!.text(r))))
  const sorted = useMemo(() => {
    if (!sort || !byKey.has(sort.key)) return filtered
    const col = byKey.get(sort.key)!
    return [...filtered].sort((a, b) => {
      const va = col.value(a)
      const vb = col.value(b)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? c : -c
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort])

  // The count counts what the card beside it counts: a folded batch its members.
  const items = (rs: R[]) => rs.reduce((n, r) => n + (itemsOf ? itemsOf(r) : 1), 0)
  const count =
    active.length > 0
      ? `${items(sorted)} of ${items(rows)} · filtered`
      : `${items(rows)} · RM ${f2(Math.round(rows.reduce((n, r) => n + amountOf(r), 0) * 100) / 100)}`

  const toggleSort = (key: string) => {
    const next: Sort = !sort || sort.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null
    keepView(next, filters)
  }
  const openFilter = (key: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const btn = e.currentTarget.getBoundingClientRect()
    const pn = panelRef.current?.getBoundingClientRect()
    if (!pn) return
    setPop({ key, left: Math.max(8, Math.min(btn.left - pn.left - 8, pn.width - 240)), top: btn.bottom - pn.top + 6 })
  }
  const startResize = (key: string, e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    touched.current = true
    const x0 = e.clientX
    const w0 = Math.round((e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width)
    let last = w0
    const move = (ev: PointerEvent) => {
      last = Math.max(MIN_WIDTH, Math.round(w0 + ev.clientX - x0))
      setOwn((prev) => {
        const base = isCustomised(prev) ? prev : current({})
        return { ...base, widths: { ...base.widths, [key]: last } }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      keep(current({ widths: { ...widths, [key]: last } }))
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const drop = (target: string) => {
    const from = drag.from
    if (from && from !== target) {
      const next = order.filter((k) => k !== from)
      next.splice(next.indexOf(target), 0, from)
      keep(current({ order: next }))
    }
    setDrag({ from: null, over: null })
  }

  const filterCol = pop ? byKey.get(pop.key) : null
  const options = useMemo(() => {
    if (!filterCol) return []
    const counts = new Map<string, number>()
    for (const r of rows) {
      const t = filterCol.text(r)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filterCol, rows])

  const onRowKey = (r: R, e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(r)
  }

  return (
    <div ref={panelRef} className={s.panel}>
      <div className={s.toolbar}>
        <div className={s.listHead}>
          <span className={s.listTitle}>{title}</span>
          <span className={s.listCount}>{countText ?? count}</span>
        </div>
        {search ? (
          <input
            className={s.search}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
          />
        ) : null}
        {children ? null : (
          <button type="button" className={s.colBtn} data-open={colOpen ? 'true' : undefined} onClick={() => setColOpen((o) => !o)} aria-expanded={colOpen}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16M15 4v16" />
            </svg>
            Columns
          </button>
        )}
      </div>

      {colOpen ? (
        <>
          <div className={s.away} onClick={() => setColOpen(false)} aria-hidden="true" />
          <div className={`${s.pop} ${s.popCols}`} role="dialog" aria-label="Columns">
            <div className={s.popHead}>
              <span className={s.popTitle}>Columns</span>
              <button
                type="button"
                className={s.popLink}
                onClick={() => {
                  keep(EMPTY_LAYOUT)
                  keepView(null, {})
                }}
              >
                Reset
              </button>
            </div>
            <div className={s.popHint}>Drag a heading to move it · drag its edge to resize</div>
            <div className={s.popFixed}>
              <span className={`${s.box} ${s.boxFixed}`} aria-hidden="true">
                ✓
              </span>
              {columns
                .filter((c) => c.fixed)
                .map((c) => c.label)
                .join(' · ')}
            </div>
            {columns
              .filter((c) => !c.fixed)
              .map((c) => {
                const on = !hidden.includes(c.key)
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    className={s.popOpt}
                    onClick={() => keep(current({ hidden: on ? [...hidden, c.key] : hidden.filter((k) => k !== c.key) }))}
                  >
                    <span className={s.box} data-on={on ? 'true' : undefined} aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    {c.label}
                  </button>
                )
              })}
            {canSetDefault ? (
              <div className={s.popFoot}>
                <button type="button" className={s.popLink} onClick={() => void saveDefaultLayout(layoutId, current({})).then((ok) => ok && setShared(current({})))}>
                  Make this everyone’s default
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {pop && filterCol ? (
        <>
          <div className={s.away} onClick={() => setPop(null)} aria-hidden="true" />
          <div className={s.pop} style={{ left: pop.left, top: pop.top }} role="dialog" aria-label={`Filter · ${filterCol.label}`}>
            <div className={s.popHead}>
              <span className={s.popTitle}>Filter · {filterCol.label}</span>
              <button type="button" className={s.popLink} onClick={() => keepView(sort, { ...filters, [filterCol.key]: [] })}>
                Clear
              </button>
            </div>
            <div className={s.popList}>
              {options.map(([value, n]) => {
                const cur = filters[filterCol.key] ?? []
                const on = cur.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    className={`${s.popOpt} ${s.popOptRow}`}
                    onClick={() => keepView(sort, { ...filters, [filterCol.key]: on ? cur.filter((x) => x !== value) : [...cur, value] })}
                  >
                    <span className={s.box} data-on={on ? 'true' : undefined} data-ink="true" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span className={s.popOptLabel}>{value}</span>
                    <span className={s.popOptN}>{n}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : null}

      {children ?? (
        <div className={s.scroll}>
          <div role="table" aria-label={title} style={{ minWidth: tableWidth }}>
            <div className={s.thead} role="row" style={{ minWidth: tableWidth }}>
              <span className={s.lead} />
              {shown.map((c) => {
                const on = sort?.key === c.key
                const fOn = (filters[c.key] ?? []).length > 0
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={s.th}
                    style={fx(c).style}
                    data-align={c.kind === 'amount' ? 'right' : undefined}
                    data-dragging={drag.from === c.key ? 'true' : undefined}
                    data-drop={drag.over === c.key && drag.from && drag.from !== c.key ? 'true' : undefined}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      try {
                        e.dataTransfer.setData('text/plain', c.key)
                      } catch {
                        // Some browsers refuse data on a drag start; the state carries it.
                      }
                      setDrag({ from: c.key, over: null })
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (drag.over !== c.key) setDrag((d) => ({ ...d, over: c.key }))
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      drop(c.key)
                    }}
                    onDragEnd={() => setDrag({ from: null, over: null })}
                  >
                    <span className={s.thLabel} onClick={() => toggleSort(c.key)}>
                      {c.label}
                    </span>
                    <button
                      type="button"
                      className={s.sort}
                      data-on={on ? 'true' : undefined}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSort(c.key)
                      }}
                      title="Sort"
                      aria-label={`Sort by ${c.label}`}
                    >
                      {on ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </button>
                    {c.kind !== 'amount' ? (
                      <button
                        type="button"
                        className={s.funnel}
                        data-on={fOn ? 'true' : undefined}
                        onClick={(e) => openFilter(c.key, e)}
                        title="Filter"
                        aria-label={`Filter ${c.label}`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 4h18l-7 8.5V19l-4 2v-8.5Z" />
                        </svg>
                      </button>
                    ) : null}
                    <span className={s.resize} onPointerDown={(e) => startResize(c.key, e)} title="Drag to resize" aria-hidden="true" />
                  </div>
                )
              })}
              <span className={s.trail} />
            </div>
            {sorted.length === 0 ? (
              <div className={s.empty}>{active.length > 0 ? 'Nothing matches these filters.' : emptyText}</div>
            ) : (
              sorted.map((r) => {
                const key = rowKey(r)
                return (
                  <div
                    key={key}
                    role="row"
                    tabIndex={0}
                    className={s.row}
                    style={{ minWidth: tableWidth }}
                    data-active={activeKey === key ? 'true' : undefined}
                    onClick={() => onRowClick(r)}
                    onKeyDown={(e) => onRowKey(r, e)}
                    onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(r, e) : undefined}
                  >
                    <span className={s.lead} />
                    {shown.map((c) => {
                      const chip = c.kind === 'chip' ? c.chip?.(r) : null
                      return (
                        <span
                          key={c.key}
                          role="cell"
                          className={s.cell}
                          style={fx(c).style}
                          data-kind={c.kind}
                          data-faint={c.kind === 'amount' && faint?.(r) ? 'true' : undefined}
                          title={c.kind === 'desc' || c.kind === 'name' ? c.text(r) : undefined}
                        >
                          {chip ? <Chip tone={chip.tone}>{chip.text}</Chip> : c.text(r)}
                        </span>
                      )
                    })}
                    <span className={s.chev} aria-hidden="true">
                      ›
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

