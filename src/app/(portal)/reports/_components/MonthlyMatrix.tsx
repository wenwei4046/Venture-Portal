import { Fragment } from 'react'
import { formatMoneyBare } from '@/lib/utils'
import type { MonthlyPnl } from '@/lib/monthly-pnl'

// Shared month-matrix table for the Monthly P&L / Cash Flow reports.
// Columns = Accumulated + each month; each column shows a number and an optional
// % cell (% of the per-column base, e.g. sales for the P&L). The header already
// carries the "RM" unit, so cells show bare numbers.
export default function MonthlyMatrix({
  columns,
  rows,
  pctBaseByColumn,
}: {
  columns: MonthlyPnl['columns']
  rows: MonthlyPnl['rows']
  /** Per-column base for the % cell. Omit to hide the % column entirely. */
  pctBaseByColumn?: number[]
}) {
  const showPct = Array.isArray(pctBaseByColumn)

  const pct = (value: number, base: number) =>
    Math.abs(base) < 0.005 ? '—' : `${((value / base) * 100).toFixed(1)}%`

  const num = (n: number) =>
    n < 0 ? <span className="neg">{formatMoneyBare(n)}</span> : formatMoneyBare(n)

  return (
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
          {rows.map((row) => {
            const isSub = row.kind === 'subtotal'
            const isParent = row.kind === 'account' && row.isParent
            const cellBg = isSub ? 'bg-surface-2' : ''
            const stickyBg = isSub ? 'bg-surface-2' : 'bg-surface'
            const labelTone = isSub
              ? row.tone === 'danger'
                ? 'text-danger'
                : row.tone === 'ledger'
                  ? 'text-ledger'
                  : 'text-ink'
              : row.depth > 0
                ? 'text-graphite' // child account — lighter
                : 'text-ink'
            const labelWeight = isSub || isParent ? 'font-semibold' : 'font-normal'
            return (
              <tr key={row.key} className={`border-b border-hairline last:border-0 ${isSub ? 'border-t' : ''}`}>
                <td
                  className={`sticky left-0 z-10 ${stickyBg} px-4 py-2.5 font-sans ${labelTone} ${labelWeight}`}
                  style={{ paddingLeft: `${16 + row.depth * 18}px` }}
                >
                  {row.label}
                </td>
                {columns.map((c, i) => {
                  const v = row.values[i] ?? 0
                  const base = pctBaseByColumn?.[i] ?? 0
                  return (
                    <Fragment key={`${row.key}-${c.key}`}>
                      <td
                        className={`text-right font-mono tabular px-4 py-2.5 border-l border-hairline ${cellBg} ${
                          isSub ? 'text-num-ink font-semibold' : row.depth > 0 ? 'text-graphite' : 'text-ink'
                        } ${c.key === 'acc' ? 'font-semibold' : ''}`}
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
  )
}
