'use client'

import { useRef, type ReactNode } from 'react'
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, type LayoutColumn } from './column-layout'
import { usePageFirstWheel } from './page-first-wheel'
import { useColumnLayout } from './useColumnLayout'

export type TableColumn<T> = LayoutColumn & {
  label: string
  /** On the header and on every cell of the column. */
  className?: string
  cell: (row: T) => ReactNode
}

/**
 * A Product List sheet whose columns the reader lays out (user 2026-09-27,
 * after the ERP's tables): drag a header onto another to swap them, drag its
 * right edge to resize, double-click the edge to fit, Reset columns to undo it
 * all. Whichever column stands first is the frozen one. The panel, its window
 * and footer are the shared `.sku-table-*` pieces; `footer` fills the footer
 * before Reset columns.
 */
export default function ColumnTable<T>({
  id,
  label,
  columns,
  rows,
  rowKey,
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
  empty: ReactNode
  footer: ReactNode
  /** The layout the request's cookie carried, for the server's render. */
  initialLayout?: string | null
}) {
  const layout = useColumnLayout(id, columns, initialLayout)
  const frame = useRef<HTMLDivElement>(null)
  usePageFirstWheel(frame)
  const cellClass = (column: TableColumn<T>, index: number) =>
    [column.className, index === 0 ? 'sku-frozen-column' : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="sku-table-panel">
      <div ref={frame} className="sku-table-window table-scroll" tabIndex={0} role="region" aria-label={label}>
        <table
          ref={layout.tableRef}
          className="ledger-table sku-table"
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
                  className={cellClass(column, index)}
                  data-dragging={layout.dragging === column.key || undefined}
                  title={column.movable === false ? undefined : 'Drag to move this column'}
                  {...layout.headerProps(column)}
                >
                  {column.label}
                  {layout.drop?.key === column.key ? (
                    <span className="sku-col-drop" data-side={layout.drop.side} aria-hidden="true" />
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
                    className="sku-col-resize"
                    {...layout.resizeProps(column)}
                  />
                </th>
              ))}
              <th aria-hidden="true" className="sku-col-filler" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={layout.columns.length + 1} className="sku-empty">{empty}</td>
              </tr>
            ) : rows.map(row => (
              <tr key={rowKey(row)}>
                {layout.columns.map((column, index) => (
                  <td key={column.key} className={cellClass(column, index)}>{column.cell(row)}</td>
                ))}
                <td aria-hidden="true" className="sku-col-filler" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sku-table-footer">
        {footer}
        {layout.customised ? (
          <button type="button" className="sku-load-more" onClick={layout.reset}>Reset columns</button>
        ) : null}
      </div>
    </div>
  )
}
