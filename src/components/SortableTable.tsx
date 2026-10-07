'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  EMPTY_LAYOUT,
  announceLayout,
  applyOrder,
  clampWidth,
  fetchSavedLayout,
  isCustomised,
  groupColumns,
  moveColumn,
  onLayoutAnnounced,
  readCachedLayout,
  sameLayout,
  saveLayout,
  storedWidth,
  toggleHidden,
  visibleColumns,
  writeCachedLayout,
  type TableLayout,
} from '@/lib/table-layout'
import { backdropDismiss } from '@/components/modal-dismiss'

export type SortDir = 'asc' | 'desc'

export interface SortableColumn<T> {
  /** Stable key used for sort state. Must match a value() key. */
  key: string
  /** Header label shown in the UI. */
  label: string
  /**
   * Cell renderer. Receives the row and returns a ReactNode (string,
   * number, JSX). Used for both display and (if `sortValue` is omitted)
   * the value the sorter uses.
   */
  render: (row: T) => ReactNode
  /**
   * Optional override for the sort comparator. Returns a comparable
   * primitive (string | number | boolean | Date). Falls back to a
   * stringified form of `render(row)` if absent — usually you'll want
   * to supply this when the cell renders a React element instead of
   * plain text (e.g. status badges).
   */
  sortValue?: (row: T) => string | number | boolean | Date | null
  /** Disable click-to-sort on this column (e.g. an "Action" column). */
  sortable?: boolean
  /**
   * Enable an Excel-style per-column value filter (a funnel in the header that
   * opens a checkbox list of the column's distinct values + a search box).
   * The facet value is `filterValue(row)` if given, else the stringified
   * `sortValue(row)`, else the stringified `render(row)`.
   */
  filterable?: boolean
  /** Optional override for the value used in the column filter facet list. */
  filterValue?: (row: T) => string
  /** Right-align (typical for amount columns). */
  align?: 'left' | 'right'
  /** Optional extra className applied to <td> cells in this column. */
  cellClassName?: string
  /** Optional extra className applied to the <th> in this column. */
  headerClassName?: string
  /**
   * Mobile (<768px) behaviour. A nine-column ledger is ~1030px wide, which is
   * three sideways screens on a 390px phone — so below md only the columns
   * marked `'keep'` stay in the grid and the rest collapse into a per-row
   * detail panel behind a chevron.
   *
   * Default when no column declares `'keep'`: the first column plus the first
   * right-aligned (amount) column, which is the identifier + the figure —
   * enough to recognise a row and decide whether to open it.
   *
   * `'drop'` removes the column from mobile entirely, detail panel included.
   * Use it for action links that the row's own tap target already covers.
   */
  mobile?: 'keep' | 'detail' | 'drop'
  /**
   * With `layoutId`: this column stays at its edge and cannot be dragged to
   * another place — a tick-box column at the start, a row menu at the end.
   */
  pinned?: 'start' | 'end'
  /** With `layoutId`: set false for a column whose width must not be dragged. */
  resizable?: boolean
  /** With `layoutId`: the heading this column sits under in the Columns panel
   *  (基本 / 金额 / 日期 / 入账 …). */
  group?: string
  /** With `layoutId`: set false for a column that must always be on show. A
   *  pinned column never appears in the panel either way. */
  hideable?: boolean
}

interface Props<T> {
  rows: T[]
  columns: SortableColumn<T>[]
  /** Initial sort. */
  defaultSort: { key: string; dir: SortDir }
  /** Stable key for each row (React reconciliation + dedup). */
  getRowKey: (row: T) => string
  /**
   * Keys to filter against when the user types in the search box. Each
   * row contributes the stringified result of each listed column's
   * `render(row)` for matching. Omit `searchPlaceholder` to hide the
   * search box entirely.
   */
  searchKeys?: string[]
  searchPlaceholder?: string
  /** Optional content rendered on the right side of the search/toolbar row. */
  toolbarRight?: ReactNode
  emptyState?: ReactNode
  /**
   * Optional className applied to the <table>. Defaults to "ledger-table"
   * to match the rest of the portal.
   */
  tableClassName?: string
  /**
   * Optional tfoot, e.g. for grand totals. Rendered AFTER all data rows.
   * Receives the currently visible (filtered + sorted) rows so totals
   * can match what the user sees.
   */
  footer?: (visibleRows: T[]) => ReactNode
  /**
   * A stable name for this table (e.g. 'billing.invoices'). Giving one turns on
   * column resizing (drag a header's right edge) and reordering (drag a header
   * onto another), and remembers the result per person — in the browser so the
   * table opens already arranged, and on the account so it follows them to
   * another computer. Desktop only: below 768px the mobile grid is untouched.
   */
  layoutId?: string
  /** What the Columns panel calls this table, e.g. 'Receipts'. */
  layoutTitle?: string
  /** Right-click on a data row — for a row menu. The caller owns the menu. On
   *  a phone, where there is no right-click, the opened row offers 更多 ⋯ for
   *  it unless the table already ends in a pinned menu column. */
  onRowContextMenu?: (row: T, event: MouseEvent<HTMLElement>) => void
  /**
   * Opening a row: a double-click on desktop, a 打开 → button in the row's
   * detail panel on a phone. Replaces a View link at the end of every row
   * (user 2026-10-02: "view … 可以 remove,我希望双击点开"). A double-click on a
   * link, button or field inside the row is left to that control. Without a
   * mouse: Tab to the row, then Enter — as the link could be reached.
   */
  onRowOpen?: (row: T) => void
  /**
   * false for a row that has nothing to open and no menu — a total standing in
   * for rows the viewer may not see (2026-10-02, a locked payroll batch). Such
   * a row takes no double-click, no right-click, no Tab stop and no 打开 →.
   */
  rowOpens?: (row: T) => boolean
}

const ROW_CONTROLS = 'a, button, input, select, textarea, label'

/**
 * Whether a press on a row was on the row itself. A dialog that a cell has
 * opened is still INSIDE the row — in the DOM when it is drawn in place, and
 * as far as React's bubbling goes even when it is portaled — so selecting a
 * word in an invoice's detail popup, or right-clicking there to copy it, used
 * to count as a press on the invoice's row. With `skipControls`, a link,
 * button or field in the row is not the row either: it keeps its own click.
 */
function pressOnRow(e: MouseEvent<HTMLElement>, skipControls = false): boolean {
  const row = e.currentTarget
  const target = e.target as HTMLElement | null
  if (!target || !row.contains(target)) return false // drawn through a portal
  for (let el: HTMLElement | null = target; el && el !== row; el = el.parentElement) {
    if (el.classList.contains('fixed') || el.getAttribute('role') === 'dialog') return false
    if (skipControls && el.matches(ROW_CONTROLS)) return false
  }
  return true
}

/**
 * Generic sortable + filterable table. Columns are click-to-sort, header
 * arrows indicate current sort, a top-of-table search box does a
 * case-insensitive substring match across `searchKeys`. State lives in
 * the component — no URL/searchParams round-trip, so this stays cheap
 * inside Server Components that just hand over rows.
 */
export default function SortableTable<T>({
  rows,
  columns,
  defaultSort,
  getRowKey,
  searchKeys,
  searchPlaceholder = 'Search…',
  toolbarRight,
  emptyState,
  tableClassName = 'ledger-table',
  footer,
  layoutId,
  layoutTitle,
  onRowContextMenu: onAnyRowContextMenu,
  onRowOpen: onAnyRowOpen,
  rowOpens,
}: Props<T>) {
  const [sortKey, setSortKey] = useState(defaultSort.key)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort.dir)
  const [search, setSearch] = useState('')
  // Rows whose mobile detail panel is open, by row key.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Per-column value filter: columnKey → Set of allowed facet tokens.
  // Absent key = no filter (all rows pass). Blank values use the BLANK sentinel.
  const [filters, setFilters] = useState<Record<string, Set<string>>>({})
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null)
  const [filterAnchor, setFilterAnchor] = useState<{ top: number; left: number } | null>(null)
  const [filterSearch, setFilterSearch] = useState('')
  const BLANK = '\0blank'

  function facetValue(row: T, col: SortableColumn<T>): string {
    if (col.filterValue) return col.filterValue(row)
    if (col.sortValue) {
      const v = col.sortValue(row)
      return v == null ? '' : String(v)
    }
    const cell = col.render(row)
    return typeof cell === 'string' || typeof cell === 'number' ? String(cell) : ''
  }
  function facetToken(row: T, col: SortableColumn<T>): string {
    const v = facetValue(row, col)
    return v === '' ? BLANK : v
  }

  const columnByKey = useMemo(() => {
    const m = new Map<string, SortableColumn<T>>()
    for (const c of columns) m.set(c.key, c)
    return m
  }, [columns])

  // ─── Column layout: order + widths, per person ───────────────────────────
  // 2026-10-02 (user: "我希望可以左右拉 … 甚至我希望我可以自己排顺序"). Nothing
  // here runs without a layoutId, and nothing applies below 768px.
  const [layout, setLayout] = useState<TableLayout>(EMPTY_LAYOUT)
  const [isDesktop, setIsDesktop] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ key: string; side: 'before' | 'after' } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const resizing = useRef(false)

  useEffect(() => {
    // No matchMedia (an old webview, a test DOM): leave the table as it was.
    if (!layoutId || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [layoutId])

  // The browser's copy first, before paint, so the table does not re-flow;
  // then the account's copy, which wins when the two differ.
  useLayoutEffect(() => {
    if (!layoutId) return
    setLayout(readCachedLayout(layoutId))
    let cancelled = false
    fetchSavedLayout(layoutId).then((saved) => {
      if (cancelled || !saved) return
      setLayout((cur) => (sameLayout(cur, saved) ? cur : saved))
      writeCachedLayout(layoutId, saved)
    })
    return () => {
      cancelled = true
    }
  }, [layoutId])

  // Tables that share a layoutId stay in step (see announceLayout).
  useEffect(() => {
    if (!layoutId) return
    return onLayoutAnnounced(layoutId, (next) => setLayout((cur) => (sameLayout(cur, next) ? cur : next)))
  }, [layoutId])

  const commitLayout = useCallback(
    (next: TableLayout) => {
      setLayout(next)
      if (!layoutId) return
      writeCachedLayout(layoutId, next)
      saveLayout(layoutId, next)
      announceLayout(layoutId, next)
    },
    [layoutId],
  )

  const layoutOn = !!layoutId && isDesktop
  const orderedColumns = useMemo(
    () => (layoutOn ? applyOrder(columns, layout.order) : columns),
    [layoutOn, columns, layout.order],
  )
  // What the Columns panel has left on show. The panel lists the hideable
  // columns in the order the CODE declares them, so a group never reshuffles
  // under the pointer while its columns are being dragged about in the header.
  const shownColumns = useMemo(
    () => (layoutOn ? visibleColumns(orderedColumns, layout.hidden) : orderedColumns),
    [layoutOn, orderedColumns, layout.hidden],
  )
  const hideableColumns = useMemo(() => columns.filter((c) => !c.pinned && c.hideable !== false && c.label), [columns])
  const [columnsOpen, setColumnsOpen] = useState(false)
  // Fixed layout only once somebody has dragged a width; until then the
  // browser sizes the columns exactly as it always has.
  const widthsOn = layoutOn && shownColumns.some((c) => layout.widths[c.key] != null)
  const widthOf = (key: string) => layout.widths[key] ?? 140
  const tableWidth = widthsOn ? shownColumns.reduce((sum, c) => sum + widthOf(c.key), 0) : undefined

  function startResize(key: string, e: ReactPointerEvent<HTMLSpanElement>) {
    e.preventDefault()
    e.stopPropagation()
    const table = tableRef.current
    if (!table) return
    // Freeze every column at the width it has on screen right now, so going
    // to a fixed layout moves nothing but the column being dragged.
    const base: Record<string, number> = {}
    table.querySelectorAll<HTMLElement>('thead th[data-col]').forEach((th) => {
      base[th.dataset.col as string] = storedWidth(th.getBoundingClientRect().width)
    })
    const startX = e.clientX
    const startW = base[key] ?? widthOf(key)
    const others = Object.entries(base).reduce((sum, [k, w]) => (k === key ? sum : sum + w), 0)
    const order = layout.order
    let width = startW
    resizing.current = true
    setLayout((cur) => ({ ...cur, widths: { ...cur.widths, ...base } }))

    // While dragging, the <col> and the table are sized directly: a state
    // update per pointer move would re-render every row of a long ledger.
    const move = (ev: PointerEvent) => {
      width = clampWidth(startW + ev.clientX - startX)
      const col = Array.from(table.querySelectorAll<HTMLElement>('col[data-col]')).find((c) => c.dataset.col === key)
      if (col) col.style.width = `${width}px`
      table.style.width = `${others + width}px`
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      resizing.current = false
      commitLayout({ ...layout, order, widths: { ...layout.widths, ...base, [key]: width } })
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
  }

  function dropSide(e: DragEvent<HTMLTableCellElement>): 'before' | 'after' {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX < r.left + r.width / 2 ? 'before' : 'after'
  }
  function endDrag() {
    setDragKey(null)
    setDropHint(null)
  }
  function dropColumn(target: string, side: 'before' | 'after') {
    if (!dragKey || dragKey === target) return endDrag()
    const movable = orderedColumns.filter((c) => !c.pinned).map((c) => c.key)
    commitLayout({ ...layout, order: moveColumn(movable, dragKey, target, side) })
    endDrag()
  }
  const showReset = layoutOn && isCustomised(layout)
  const hasPinnedEnd = columns.some((c) => c.pinned === 'end')
  function setColumnShown(key: string, show: boolean) {
    const hidden = toggleHidden(layout.hidden, key, show, hideableColumns.map((c) => c.key))
    if (hidden === layout.hidden) return
    // A column that is not on show must not go on filtering the rows unseen.
    if (!show) clearColumnFilter(key)
    commitLayout({ ...layout, hidden })
  }

  // ─── Mobile column split ────────────────────────────────────────────────
  // Which columns survive in the grid below 768px, and which fall into the
  // per-row detail panel. Callers can be explicit with `mobile: 'keep'`; the
  // fallback picks the identifier (first column) and the figure (first
  // right-aligned column), which is what makes a row recognisable.
  const { mobileKeep, mobileDetail } = useMemo(() => {
    const explicit = columns.filter((c) => c.mobile === 'keep')
    let keep = explicit
    if (keep.length === 0) {
      const first = columns[0]
      const amount = columns.find((c) => c.align === 'right' && c.key !== first?.key)
      keep = [first, amount].filter(Boolean) as SortableColumn<T>[]
    }
    const keepKeys = new Set(keep.map((c) => c.key))
    return {
      mobileKeep: keepKeys,
      mobileDetail: columns.filter((c) => !keepKeys.has(c.key) && c.mobile !== 'drop'),
    }
  }, [columns])

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSort(key: string) {
    const col = columnByKey.get(key)
    if (!col || col.sortable === false) return
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Most "new sort target" intents are "show me the most recent / largest
      // first" — default to desc when switching columns.
      setSortDir('desc')
    }
  }

  function valueFor(row: T, col: SortableColumn<T>): string | number | boolean | Date | null {
    if (col.sortValue) return col.sortValue(row)
    // Fallback: stringify the rendered cell. Works for plain text columns.
    const cell = col.render(row)
    if (cell == null) return ''
    if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
      return cell
    }
    return String(cell)
  }

  // Apply per-column value filters (Excel-style facets) before search/sort.
  const columnFiltered = useMemo(() => {
    const active = Object.entries(filters)
    if (active.length === 0) return rows
    return rows.filter((row) =>
      active.every(([key, set]) => {
        const col = columnByKey.get(key)
        if (!col) return true
        return set.has(facetToken(row, col))
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, columnByKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || !searchKeys || searchKeys.length === 0) return columnFiltered
    return columnFiltered.filter((row) => {
      for (const key of searchKeys) {
        const col = columnByKey.get(key)
        if (!col) continue
        const cell = col.render(row)
        const text =
          typeof cell === 'string' || typeof cell === 'number'
            ? String(cell)
            : col.sortValue
              ? String(col.sortValue(row))
              : ''
        if (text.toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [columnFiltered, search, searchKeys, columnByKey])

  const sorted = useMemo(() => {
    const col = columnByKey.get(sortKey)
    if (!col) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      const va = valueFor(a, col)
      const vb = valueFor(b, col)
      if (va == null && vb == null) return 0
      if (va == null) return -1 * dir
      if (vb == null) return 1 * dir
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * dir
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir
    })
    return copy
  }, [filtered, sortKey, sortDir, columnByKey])

  const visible = sorted

  // Distinct facet tokens for the currently-open filter popover (from all rows
  // so the value list is stable regardless of other active filters/search).
  const openDistinct = useMemo(() => {
    if (!openFilterKey) return [] as string[]
    const col = columnByKey.get(openFilterKey)
    if (!col) return []
    const set = new Set<string>()
    for (const row of rows) set.add(facetToken(row, col))
    return Array.from(set).sort((a, b) =>
      a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFilterKey, rows, columnByKey])

  function tokenChecked(key: string, token: string): boolean {
    const set = filters[key]
    return set ? set.has(token) : true
  }
  function allChecked(key: string, allTokens: string[]): boolean {
    const set = filters[key]
    return !set || set.size === allTokens.length
  }
  function toggleToken(key: string, token: string, allTokens: string[]) {
    setFilters((prev) => {
      const next = { ...prev }
      const cur = new Set(prev[key] ?? allTokens)
      if (cur.has(token)) cur.delete(token)
      else cur.add(token)
      if (cur.size >= allTokens.length) delete next[key]
      else next[key] = cur
      return next
    })
  }
  function toggleAll(key: string, allTokens: string[]) {
    setFilters((prev) => {
      const next = { ...prev }
      if (allChecked(key, allTokens)) next[key] = new Set<string>() // none pass
      else delete next[key] // all pass
      return next
    })
  }
  function clearColumnFilter(key: string) {
    setFilters((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  function openFilter(key: string, e: MouseEvent) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const left = Math.min(r.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 280)
    setFilterAnchor({ top: r.bottom + 4, left: Math.max(8, left) })
    setFilterSearch('')
    setOpenFilterKey((k) => (k === key ? null : key))
  }

  return (
    <div>
      {(searchKeys && searchKeys.length > 0) || toolbarRight || layoutOn || onAnyRowOpen ? (
        <div className="mb-3 flex items-center gap-3 flex-wrap">
          {searchKeys && searchKeys.length > 0 ? (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full max-w-md px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
              />
              {search ? (
                <span className="font-mono text-xs text-graphite">
                  {visible.length}/{rows.length}
                </span>
              ) : null}
            </>
          ) : null}
          {onAnyRowOpen ? (
            <span className="hidden md:inline font-serif italic text-xs text-muted">
              双击一行打开{onAnyRowContextMenu ? ' · 右键更多' : ''}
            </span>
          ) : null}
          {toolbarRight ? <div className="ml-auto flex items-center gap-3 flex-wrap">{toolbarRight}</div> : null}
          {layoutOn ? (
            <span className={`flex items-center gap-3 ${toolbarRight ? '' : 'ml-auto'}`}>
              <button
                type="button"
                onClick={() => setColumnsOpen(true)}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-1.5 font-sans text-sm font-medium text-ink hover:border-accent-border"
                title="选要显示哪些栏位"
              >
                <span aria-hidden>▥</span>
                Columns
                <span className="font-mono text-xs font-normal text-muted">· {shownColumns.filter((c) => !c.pinned && c.label).length}</span>
              </button>
              {showReset ? (
                <button
                  type="button"
                  onClick={() => commitLayout(EMPTY_LAYOUT)}
                  className="text-xs text-muted hover:text-accent font-serif italic"
                  title="栏位的宽度、顺序和显示回到预设 · Reset columns to default"
                >
                  还原栏位
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={widthsOn ? 'overflow-x-auto' : undefined}>
      <table
        ref={tableRef}
        className={`${tableClassName}${widthsOn ? ' st-fixed' : ''}`}
        style={widthsOn ? { tableLayout: 'fixed', width: tableWidth } : undefined}
      >
        {widthsOn ? (
          <colgroup>
            {shownColumns.map((c) => (
              <col key={c.key} data-col={c.key} style={{ width: widthOf(c.key) }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr>
            {shownColumns.map((c) => {
              const isActive = c.key === sortKey
              const sortable = c.sortable !== false
              const filterActive = !!filters[c.key]
              const movable = layoutOn && !c.pinned
              const hint = dropHint && dropHint.key === c.key ? dropHint.side : null
              return (
                <th
                  key={c.key}
                  data-col={c.key}
                  // `right` as well as text-right: the ledger-table header rule
                  // out-ranks a utility class, so a right-aligned column's heading
                  // used to sit at the LEFT of its own figures (seen once columns
                  // were dragged wide, 2026-10-02). Not `num`: that would also set
                  // the heading in the figures' typeface.
                  className={`${c.headerClassName ?? ''} ${c.align === 'right' ? 'text-right right' : ''} ${
                    mobileKeep.has(c.key) ? '' : 'm-hide'
                  }${layoutOn ? ' st-th' : ''}${dragKey === c.key ? ' st-dragging' : ''}${
                    hint ? ` st-drop-${hint}` : ''
                  }${c.resizable === false ? ' st-nocut' : ''}`}
                  scope="col"
                  draggable={movable || undefined}
                  onDragStart={
                    movable
                      ? (e) => {
                          // A press on the resize handle must size the column, not lift it.
                          if (resizing.current) return e.preventDefault()
                          e.dataTransfer.effectAllowed = 'move'
                          try {
                            e.dataTransfer.setData('text/plain', c.key)
                          } catch {
                            // Some browsers refuse setData outside a trusted drag; the key is in state.
                          }
                          setDragKey(c.key)
                        }
                      : undefined
                  }
                  onDragOver={
                    movable
                      ? (e) => {
                          if (!dragKey || dragKey === c.key) return
                          e.preventDefault()
                          const side = dropSide(e)
                          setDropHint((cur) => (cur && cur.key === c.key && cur.side === side ? cur : { key: c.key, side }))
                        }
                      : undefined
                  }
                  onDrop={
                    movable
                      ? (e) => {
                          e.preventDefault()
                          dropColumn(c.key, dropSide(e))
                        }
                      : undefined
                  }
                  onDragEnd={movable ? endDrag : undefined}
                >
                  <span className="inline-flex items-baseline gap-1">
                    <span
                      onClick={sortable ? () => toggleSort(c.key) : undefined}
                      className={`inline-flex items-baseline gap-1 ${sortable ? 'cursor-pointer select-none hover:text-ink' : ''}`}
                    >
                      {c.label}
                      {sortable ? (
                        <span
                          className={`font-mono text-[10px] ${isActive ? 'text-accent' : 'text-muted'}`}
                          aria-hidden
                        >
                          {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      ) : null}
                    </span>
                    {c.filterable ? (
                      <button
                        type="button"
                        onClick={(e) => openFilter(c.key, e)}
                        className={`align-middle ${filterActive ? 'text-accent' : 'text-muted hover:text-ink'}`}
                        aria-label={`Filter ${c.label}`}
                        title={`Filter ${c.label}`}
                      >
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                          <path d="M2 3.5h12L9.2 9v4l-2.4 1.2V9L2 3.5z" />
                        </svg>
                      </button>
                    ) : null}
                  </span>
                  {layoutOn && c.resizable !== false ? (
                    <span
                      className="st-resize"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.label || 'column'}`}
                      title="左右拉调整宽度"
                      draggable={false}
                      onPointerDown={(e) => startResize(c.key, e)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : null}
                </th>
              )
            })}
            {/* Chevron column — mobile only (CSS), so desktop keeps its
                existing column count and widths exactly. */}
            {mobileDetail.length > 0 ? <th className="lt-toggle" aria-hidden /> : null}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={shownColumns.length + 1} className="text-center py-8">
                {emptyState ?? (
                  <span className="font-serif italic text-muted text-sm">No rows.</span>
                )}
              </td>
            </tr>
          ) : (
            visible.map((row) => {
              const rowKey = getRowKey(row)
              const isOpen = expanded.has(rowKey)
              const opens = rowOpens ? rowOpens(row) : true
              const onRowOpen = opens ? onAnyRowOpen : undefined
              const onRowContextMenu = opens ? onAnyRowContextMenu : undefined
              return (
                <Fragment key={rowKey}>
                  <tr
                    onContextMenu={onRowContextMenu ? (e) => pressOnRow(e) && onRowContextMenu(row, e) : undefined}
                    onDoubleClick={onRowOpen ? (e) => pressOnRow(e, true) && onRowOpen(row) : undefined}
                    // The second press of a double-click would otherwise select the word under it.
                    onMouseDown={onRowOpen ? (e) => e.detail > 1 && pressOnRow(e, true) && e.preventDefault() : undefined}
                    tabIndex={onRowOpen ? 0 : undefined}
                    onKeyDown={onRowOpen ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onRowOpen(row) : undefined}
                  >
                    {shownColumns.map((c) => (
                      <td
                        key={c.key}
                        // st-nocut: a column whose width cannot be dragged is
                        // never cut with an ellipsis once the layout is fixed.
                        className={`${c.cellClassName ?? ''} ${c.align === 'right' ? 'text-right num' : ''} ${
                          mobileKeep.has(c.key) ? '' : 'm-hide'
                        }${c.resizable === false ? ' st-nocut' : ''}`}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                    {mobileDetail.length > 0 ? (
                      <td className="lt-toggle">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(rowKey)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? '收起明细' : '展开明细'}
                          className="flex items-center justify-center w-9 h-9 -my-2 -mr-2 text-graphite"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="15"
                            height="15"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform duration-120 ${isOpen ? 'rotate-180' : ''}`}
                            aria-hidden
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </td>
                    ) : null}
                  </tr>
                  {mobileDetail.length > 0 && isOpen ? (
                    <tr className="lt-detail">
                      <td colSpan={mobileKeep.size + 1}>
                        <dl className="lt-detail-list">
                          {mobileDetail.map((c) => (
                            // An unlabelled column (the action link) gets the
                            // full width instead of a dash where its term
                            // would be.
                            <div key={c.key} className={c.label ? undefined : 'lt-wide'}>
                              {c.label ? <dt>{c.label}</dt> : null}
                              <dd className={c.align === 'right' ? 'num' : ''}>{c.render(row)}</dd>
                            </div>
                          ))}
                          {/* No double-click and no right-click on a phone. */}
                          {onRowOpen || (onRowContextMenu && !hasPinnedEnd) ? (
                            <div className="lt-wide flex items-center gap-5">
                              {onRowOpen ? (
                                <button
                                  type="button"
                                  onClick={() => onRowOpen(row)}
                                  className="text-sm text-accent hover:text-accent-hover font-serif italic"
                                >
                                  打开 →
                                </button>
                              ) : null}
                              {onRowContextMenu && !hasPinnedEnd ? (
                                <button
                                  type="button"
                                  onClick={(e) => onRowContextMenu(row, e)}
                                  className="text-sm text-graphite hover:text-ink font-serif italic"
                                >
                                  更多 ⋯
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })
          )}
        </tbody>
        {footer ? <tfoot>{footer(visible)}</tfoot> : null}
      </table>
      </div>

      {columnsOpen && layoutOn ? (
        <ColumnsPanel
          title={layoutTitle}
          columns={hideableColumns.map((c) => ({ key: c.key, label: c.label, group: c.group }))}
          hidden={layout.hidden}
          onToggle={setColumnShown}
          onShowAll={() => commitLayout({ ...layout, hidden: [] })}
          onReset={() => commitLayout(EMPTY_LAYOUT)}
          onClose={() => setColumnsOpen(false)}
        />
      ) : null}

      {/* Excel-style per-column value filter popover. Portaled to document.body:
          `fixed` + getBoundingClientRect coords are viewport-relative, but any
          transformed ancestor re-bases fixed positioning and the popover lands
          somewhere random (user report 2026-06-12). The portal escapes that. */}
      {openFilterKey && filterAnchor && typeof document !== 'undefined' ? (
        createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenFilterKey(null)} aria-hidden />
          <div
            className="fixed z-50 w-64 bg-paper border border-hairline rounded-panel shadow-xl p-2 text-left font-sans normal-case"
            style={{ top: filterAnchor.top, left: filterAnchor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              autoFocus
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="搜索值…"
              className="w-full mb-2 px-2 py-1 text-sm bg-paper border border-hairline rounded text-ink focus:outline-none focus:border-accent-border"
            />
            <div className="max-h-56 overflow-y-auto pr-1">
              {!filterSearch.trim() ? (
                <label className="flex items-center gap-2 py-0.5 text-sm cursor-pointer text-ink">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={allChecked(openFilterKey, openDistinct)}
                    onChange={() => toggleAll(openFilterKey, openDistinct)}
                  />
                  <span className="font-medium">(All)</span>
                </label>
              ) : null}
              {openDistinct
                .filter((tok) => {
                  const disp = tok === BLANK ? '(blanks)' : tok
                  return disp.toLowerCase().includes(filterSearch.trim().toLowerCase())
                })
                .map((tok) => (
                  <label key={tok} className="flex items-center gap-2 py-0.5 text-sm cursor-pointer text-ink">
                    <input
                      type="checkbox"
                      className="accent-accent shrink-0"
                      checked={tokenChecked(openFilterKey, tok)}
                      onChange={() => toggleToken(openFilterKey, tok, openDistinct)}
                    />
                    <span className="truncate" title={tok === BLANK ? '(Blanks)' : tok}>
                      {tok === BLANK ? '(Blanks)' : tok}
                    </span>
                  </label>
                ))}
              {openDistinct.length === 0 ? (
                <div className="text-xs text-muted italic py-1">No values</div>
              ) : null}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => clearColumnFilter(openFilterKey)}
                className="text-xs text-muted hover:text-ink"
              >
                Clear Filter
              </button>
              <button
                type="button"
                onClick={() => setOpenFilterKey(null)}
                className="text-xs text-accent hover:text-accent-hover"
              >
                Close
              </button>
            </div>
          </div>
        </>,
        document.body,
        )
      ) : null}
    </div>
  )
}

/**
 * Columns — which columns a table shows (2026-10-02, user: "我希望有 column
 * categories. 有些我不用显示", with the ERP's Columns drawer as the model).
 * A drawer on the right: the columns under their group headings, a tick for
 * each, a search box, Show all, Reset. Ticks apply at once; Done only closes.
 *
 * Portaled to <body> for the same reason the filter popover is — a transformed
 * ancestor would re-base `fixed`.
 */
function ColumnsPanel({
  title,
  columns,
  hidden,
  onToggle,
  onShowAll,
  onReset,
  onClose,
}: {
  title?: string
  columns: Array<{ key: string; label: string; group?: string }>
  hidden: string[]
  onToggle: (key: string, show: boolean) => void
  onShowAll: () => void
  onReset: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  if (typeof document === 'undefined') return null
  const off = new Set(hidden)
  const needle = query.trim().toLowerCase()
  const shownCount = columns.filter((c) => !off.has(c.key)).length
  const matches = groupColumns(columns)
    .map((g) => ({
      name: g.name,
      all: g.columns,
      items: g.columns.filter((c) => !needle || c.label.toLowerCase().includes(needle)),
    }))
    .filter((g) => g.items.length > 0)

  return createPortal(
    <div className="fixed inset-0 z-50 bg-scrim/30" {...backdropDismiss(onClose)}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Columns"
        className="absolute right-0 top-0 flex h-full w-[340px] max-w-[92vw] flex-col border-l border-hairline bg-paper shadow-xl font-sans normal-case text-left"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 pt-4 pb-3">
          <div>
            {title ? <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">{title}</div> : null}
            <h2 className="font-serif text-xl text-ink">Columns</h2>
            <p className="text-xs text-muted">勾选要显示的栏位</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-muted hover:text-ink">
            ×
          </button>
        </div>
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-2.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search columns"
            aria-label="Search columns"
            className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-accent-border"
          />
          <button type="button" onClick={onShowAll} className="whitespace-nowrap text-xs font-semibold text-ink hover:text-accent">
            Show all
          </button>
          <button
            type="button"
            onClick={onReset}
            className="whitespace-nowrap text-xs font-semibold text-ink hover:text-accent"
            title="显示、宽度和顺序全部回到预设"
          >
            Reset
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-2">
          {matches.length === 0 ? (
            <p className="px-4 py-4 font-serif italic text-sm text-muted">没有叫这个名字的栏位。</p>
          ) : (
            matches.map((g) => (
              <div key={g.name || '_'} role="group" aria-label={g.name || 'Columns'}>
                {g.name ? (
                  <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-graphite">
                    {g.name}
                    <span className="font-mono font-normal tracking-normal text-muted">
                      {g.all.filter((c) => !off.has(c.key)).length}/{g.all.length}
                    </span>
                    <span className="flex-1 border-t border-hairline" aria-hidden />
                  </div>
                ) : null}
                {g.items.map((c) => (
                  <label
                    key={c.key}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 pl-7 text-sm hover:bg-accent-bg ${off.has(c.key) ? 'text-muted' : 'text-ink'}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      checked={!off.has(c.key)}
                      onChange={(e) => onToggle(c.key, e.target.checked)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-hairline bg-surface px-4 py-3">
          <span className="text-xs text-muted">
            {shownCount} of {columns.length} shown
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-accent px-4 py-1.5 font-serif italic text-sm text-white hover:bg-accent-hover"
          >
            Done
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
