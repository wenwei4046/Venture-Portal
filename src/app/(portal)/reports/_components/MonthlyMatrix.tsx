'use client'

import { Fragment, useState } from 'react'
import { formatMoneyBare } from '@/lib/utils'
import type { MonthlyMatrixData } from '@/lib/monthly-matrix'

// Shared month-matrix table for the Monthly P&L / Cash Flow reports.
// Columns = Accumulated + each month; each column shows a number and an optional
// % cell. L1/L2/L3 collapse account depth (subtotals always shown). The header
// already carries the "RM" unit, so cells show bare numbers.
export default function MonthlyMatrix({
  columns,
  rows,
  pctBaseByColumn,
}: {
  columns: MonthlyMatrixData['columns']
  rows: MonthlyMatrixData['rows']
  /** Per-column base for the % cell. Omit to hide the % column entirely. */
  pctBaseByColumn?: number[]
}) {
  // L1 = subtotals only · L2 = + top accounts & parent roll-ups · L3 = every level.
  const [level, setLevel] = useState<1 | 2 | 3>(3)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const showPct = Array.isArray(pctBaseByColumn)
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const leveled = rows.filter((r) => {
    if (r.kind === 'subtotal') return true // category / grand-total rows always show
    if (level === 1) return false // totals only
    if (level === 2) return r.depth <= 1 // + top-level accounts & parent roll-ups
    return true // L3: all account levels incl. children
  })
  // Hide the children of any collapsed parent — everything deeper, until we step
  // back out to the parent's own depth or shallower.
  const visibleRows: typeof leveled = []
  let hideDepth = Infinity
  for (const r of leveled) {
    if (r.depth > hideDepth) continue
    hideDepth = Infinity
    visibleRows.push(r)
    if (r.kind === 'account' && r.isParent && collapsed.has(r.key)) hideDepth = r.depth
  }

  const pct = (value: number, base: number) =>
    Math.abs(base) < 0.005 ? '—' : `${((value / base) * 100).toFixed(1)}%`
  const num = (n: number) =>
    n < 0 ? <span className="neg">{formatMoneyBare(n)}</span> : formatMoneyBare(n)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs uppercase tracking-wide text-muted font-sans">Detail level</span>
        {([1, 2, 3] as const).map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => setLevel(lv)}
            title={lv === 1 ? 'Totals only' : lv === 2 ? '+ top-level accounts' : 'All account levels'}
            className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
              level === lv
                ? 'bg-ink text-paper border-ink'
                : 'bg-surface text-graphite border-hairline hover:text-ink'
            }`}
          >
            L{lv}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-hairline rounded-md">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-hairline">
              <th className="sticky left-0 z-10 bg-surface text-left font-sans text-xs uppercase tracking-wide text-muted px-4 py-3 min-w-[220px]">
                Item
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  colSpan={showPct ? 2 : 1}
                  className={`text-center font-sans text-xs uppercase tracking-wide px-4 py-3 border-l border-hairline ${
                    c.key === 'acc' ? 'text-ink font-semibold' : 'text-muted'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-hairline">
              <th className="sticky left-0 z-10 bg-surface px-4 py-1.5" />
              {columns.map((c) => (
                <Fragment key={c.key}>
                  <th className="text-right font-mono text-[10px] uppercase text-muted px-4 py-1.5 border-l border-hairline">
                    RM
                  </th>
                  {showPct ? (
                    <th className="text-right font-mono text-[10px] uppercase text-muted pr-4 py-1.5">%</th>
                  ) : null}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isSub = row.kind === 'subtotal'
              const isParent = row.kind === 'account' && row.isParent
              const isCollapsed = isParent && collapsed.has(row.key)
              // Three visual tiers: leaf (plain) < parent (faint band + caret) < subtotal (darker band).
              const cellBg = isSub ? 'bg-surface-2' : isParent ? 'bg-surface' : ''
              const stickyBg = isSub ? 'bg-surface-2' : isParent ? 'bg-surface' : 'bg-surface'
              const labelTone = isSub
                ? row.tone === 'danger'
                  ? 'text-danger'
                  : row.tone === 'ledger'
                    ? 'text-ledger'
                    : 'text-ink'
                : row.depth >= 2
                  ? 'text-graphite'
                  : 'text-ink'
              const valueTone = isSub
                ? 'text-num-ink font-semibold'
                : row.depth >= 2
                  ? 'text-graphite'
                  : 'text-ink'
              const labelWeight = isSub || isParent ? 'font-semibold' : 'font-normal'
              return (
                <tr key={row.key} className={`border-b border-hairline last:border-0 ${isSub ? 'border-t' : ''}`}>
                  <td
                    className={`sticky left-0 z-10 ${stickyBg} px-4 py-2.5 font-sans ${labelTone} ${labelWeight}`}
                    style={{ paddingLeft: `${16 + row.depth * 18}px` }}
                  >
                    {isParent ? (
                      <button
                        type="button"
                        onClick={() => toggle(row.key)}
                        className="inline-flex items-center gap-1.5 text-left hover:text-accent transition-colors"
                        title={isCollapsed ? 'Expand children' : 'Collapse children'}
                      >
                        <span className="text-[9px] text-muted w-2 inline-block leading-none">
                          {isCollapsed ? '▶' : '▼'}
                        </span>
                        {row.label}
                      </button>
                    ) : (
                      row.label
                    )}
                  </td>
                  {columns.map((c, i) => {
                    const v = row.values[i] ?? 0
                    const base = pctBaseByColumn?.[i] ?? 0
                    return (
                      <Fragment key={`${row.key}-${c.key}`}>
                        <td
                          className={`text-right font-mono tabular px-4 py-2.5 border-l border-hairline ${cellBg} ${valueTone} ${
                            c.key === 'acc' ? 'font-semibold' : ''
                          }`}
                        >
                          {num(v)}
                        </td>
                        {showPct ? (
                          <td className={`text-right font-mono tabular text-[11px] text-muted pr-4 py-2.5 ${cellBg}`}>
                            {pct(v, base)}
                          </td>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
