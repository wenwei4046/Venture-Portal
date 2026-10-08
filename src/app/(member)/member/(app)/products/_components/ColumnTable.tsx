'use client'

import { useRef, type ReactNode } from 'react'
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, type LayoutColumn } from './column-layout'
import { usePageFirstWheel } from './page-first-wheel'
import { useColumnLayout } from './useColumnLayout'
import c from './products.module.css'

export type TableColumn<T> = LayoutColumn & {
  /** The header, as the prototype writes it (PRODUCT CODE). */
  label: string
  /** Right-aligned: figures. */
  num?: boolean
  /** On every cell of the column: `c.strong`, `c.muted`, `c.wrap`… */
  className?: string
  cell: (row: T) => ReactNode
}

/**
 * A Product List sheet whose columns the reader lays out (user 2026-09-27,
 * after the ERP's tables): drag a header onto another to swap them, drag its
 * right edge to resize, double-click the edge to fit, Reset columns to undo it
 * all. Whichever column stands first is the frozen one. Drawn as the
 * prototype's table card: a 560px window of its own with sticky heads, the
 * footer under it.
 */
export default function ColumnTable<T>({
  id,
  label,
  columns,
  rows,
  rowKey,
  rowNew,
  empty,
  footer,
  initialLayout = null,
}: {
  /** Where this table's layout is kept — one per table and view. */
  id: string
  label: string
  columns: readonly TableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  /** A row new on the list (the prototype's #FFF5EC). */
  rowNew?: (row: T) => boolean
  empty: ReactNode
  /** The footer's contents (`TableFoot` pieces); Reset columns follows them. */
  footer: (reset: ReactNode) => ReactNode
  /** The layout the request's cookie carried, for the server's render. */
  initialLayout?: string | null
}) {
  const layout = useColumnLayout(id, columns, initialLayout)
  const frame = useRef<HTMLDivElement>(null)
  usePageFirstWheel(frame)
  const reset = layout.customised ? (
    <button type="button" className={c.more} onClick={layout.reset}>Reset columns</button>
  ) : null

  return (
    <div className={c.tableCard}>
      <div ref={frame} className={c.tableScroll} data-window="" tabIndex={0} role="region" aria-label={label}>
        <table
          ref={layout.tableRef}
          className={c.table}
          data-layout={layout.fixed ? 'fixed' : undefined}
          style={layout.tableStyle}
        >
          <colgroup>
            {layout.columns.map(column => (
              <col key={column.key} ref={layout.colRef(column.key)} style={layout.colStyle(column)} />
            ))}
            <col />
          </colgroup>
          <thead>
            <tr>
              {layout.columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  data-col-key={column.key}
                  aria-label={column.label}
                  className={c.th}
                  data-first={index === 0 || undefined}
                  data-num={column.num || undefined}
                  data-dragging={layout.dragging === column.key || undefined}
                  style={layout.fixed ? undefined : { minWidth: column.defaultWidth }}
                  title={column.movable === false ? undefined : 'Drag to move this column'}
                  {...layout.headerProps(column)}
                >
                  {column.label}
                  {layout.drop?.key === column.key ? (
                    <span className={c.drop} data-side={layout.drop.side} aria-hidden="true" />
                  ) : null}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize the ${column.label} column`}
                    aria-valuemin={MIN_COLUMN_WIDTH}
                    aria-valuemax={MAX_COLUMN_WIDTH}
                    aria-valuenow={Math.round(layout.width(column))}
                    tabIndex={0}
                    title={column.movable === false
                      ? 'Drag to resize · double-click to fit'
                      : 'Drag to resize · double-click to fit · Alt+← / Alt+→ moves the column'}
                    className={c.resize}
                    {...layout.resizeProps(column)}
                  />
                </th>
              ))}
              <th aria-hidden="true" className={`${c.th} ${c.filler}`} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={layout.columns.length + 1} className={c.empty}>{empty}</td>
              </tr>
            ) : rows.map((row, i) => (
              <tr key={rowKey(row)} className={c.row} data-stripe={i % 2 === 1 || undefined} data-new={rowNew?.(row) || undefined}>
                {layout.columns.map((column, index) => (
                  <td key={column.key} className={[c.td, column.className].filter(Boolean).join(' ')}
                    data-first={index === 0 || undefined} data-num={column.num || undefined}>
                    {column.cell(row)}
                  </td>
                ))}
                <td aria-hidden="true" className={`${c.td} ${c.filler}`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer(reset)}
    </div>
  )
}
