'use client'

import { useMemo, useState, type ReactNode } from 'react'

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
  /** Right-align (typical for amount columns). */
  align?: 'left' | 'right'
  /** Optional extra className applied to <td> cells in this column. */
  cellClassName?: string
  /** Optional extra className applied to the <th> in this column. */
  headerClassName?: string
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
}: Props<T>) {
  const [sortKey, setSortKey] = useState(defaultSort.key)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort.dir)
  const [search, setSearch] = useState('')

  const columnByKey = useMemo(() => {
    const m = new Map<string, SortableColumn<T>>()
    for (const c of columns) m.set(c.key, c)
    return m
  }, [columns])

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || !searchKeys || searchKeys.length === 0) return rows
    return rows.filter((row) => {
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
  }, [rows, search, searchKeys, columnByKey])

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

  return (
    <div>
      {(searchKeys && searchKeys.length > 0) || toolbarRight ? (
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
          {toolbarRight ? <div className="ml-auto flex items-center gap-3 flex-wrap">{toolbarRight}</div> : null}
        </div>
      ) : null}

      <table className={tableClassName}>
        <thead>
          <tr>
            {columns.map((c) => {
              const isActive = c.key === sortKey
              const sortable = c.sortable !== false
              return (
                <th
                  key={c.key}
                  onClick={sortable ? () => toggleSort(c.key) : undefined}
                  className={`${c.headerClassName ?? ''} ${
                    sortable ? 'cursor-pointer select-none hover:text-ink' : ''
                  } ${c.align === 'right' ? 'text-right' : ''}`}
                  scope="col"
                >
                  <span className="inline-flex items-baseline gap-1">
                    {c.label}
                    {sortable ? (
                      <span
                        className={`font-mono text-[10px] ${
                          isActive ? 'text-accent' : 'text-muted'
                        }`}
                        aria-hidden
                      >
                        {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    ) : null}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-8">
                {emptyState ?? (
                  <span className="font-serif italic text-muted text-sm">No rows.</span>
                )}
              </td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${c.cellClassName ?? ''} ${c.align === 'right' ? 'text-right num' : ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer ? <tfoot>{footer(visible)}</tfoot> : null}
      </table>
    </div>
  )
}
