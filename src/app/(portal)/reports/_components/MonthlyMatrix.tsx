'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatMoneyBare } from '@/lib/utils'
import type { MonthlyMatrixData } from '@/lib/monthly-matrix'
import { ancestorsOfMatches, matchesAccount } from '@/lib/report-search'
import Highlight from './Highlight'
import { useReportSearch } from './ReportSearchProvider'

// Shared month-matrix table for the Monthly P&L / Cash Flow reports.
// Columns = Accumulated + each month; each column shows a number and an optional
// % cell. L1/L2/L3 collapse account depth (subtotals always shown). The header
// already carries the "RM" unit, so cells show bare numbers.
export default function MonthlyMatrix({
  columns,
  rows,
  pctBaseByColumn,
  variant = 'cf',
  nowKey,
  separated = false,
}: {
  columns: MonthlyMatrixData['columns']
  rows: MonthlyMatrixData['rows']
  /** Per-column base for the % cell. Omit to hide the % column entirely. */
  pctBaseByColumn?: number[]
  /** 'cf' (default) = the navy / gold report skin (user 2026-09-18 "蓝为主",
   *  then "report 那边的颜色等等弄到和 cash flow 的一样"): navy header and
   *  headline bands, category rows on a pale-navy band with a gold edge, flat
   *  white detail rows (no zebra — "一行一个 colour 看了会 misleading"), zero as
   *  a dash. 'default' = the portal's plain ledger look. */
  variant?: 'default' | 'cf'
  /** Column key to wash as "this month" (cf skin). */
  nowKey?: string
  /** A rule before each column's figures (2026-10-09, the Finance revamp
   *  handoff: "month columns are visually separated"). */
  separated?: boolean
}) {
  const cf = variant === 'cf'
  // L1 = subtotals / categories only · L2 = + top accounts & parent roll-ups ·
  // L3 = every level. A matrix with layout category rows (Cash Flow) opens
  // folded to them, as in the approved mock-up; the others open fully.
  const [ownLevel, setOwnLevel] = useState<1 | 2 | 3>(() => (rows.some((r) => r.kind === 'category') ? 1 : 3))
  // Explicit user overrides of the level default, both directions: `collapsed`
  // closes something the level would show, `expanded` opens something the level
  // would hide. Without the second set, clicking ▶ at L2 did nothing — the
  // children were filtered out by depth no matter what the arrow said
  // (user report 2026-07-30).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const showPct = Array.isArray(pctBaseByColumn)

  // ─── Account search ───
  // Highlights and reveals; never hides. A match forces its ancestors open and
  // lets the match itself through the level filter, so it surfaces even at L1 —
  // but rows the level was already hiding stay hidden, because the detail level
  // is the user's own separate choice.
  //
  // The BOX lives in the left rail (MonthlyReportControls) to match the GL
  // statements, and the rail is a sibling — so query + cursor come through
  // ReportSearchProvider and we publish the match count back up.
  const ctx = useReportSearch()
  // The page's control row may hold the detail level (2026-10-09); else the
  // matrix keeps its own, with its L1 / L2 / L3 above the table.
  const levelInRow = ctx?.level != null
  const level: 1 | 2 | 3 = ctx?.level ?? ownLevel
  const setLevel = levelInRow && ctx ? ctx.setLevel : setOwnLevel
  const search = ctx?.search ?? ''
  const activeHit = ctx?.activeHit ?? 0
  const setHitCount = ctx?.setHitCount
  const jump = ctx?.jump ?? 0

  const { hitKeys, hitOrder, forceOpen } = useMemo(() => {
    if (!search.trim()) {
      return { hitKeys: new Set<string>(), hitOrder: [] as string[], forceOpen: new Set<string>() }
    }
    // Accounts match; a category row (a layout section, or the COA root merged
    // into it) only ever opens as an ancestor of a match — its label is the
    // user's own wording, not an account.
    const tree = rows.filter((r) => r.kind !== 'subtotal')
    const isMatch = (r: (typeof rows)[number]) => r.kind === 'account' && matchesAccount(search, r.code, r.label)
    const order = tree.filter(isMatch).map((r) => r.key)
    return {
      hitKeys: new Set(order),
      hitOrder: order,
      forceOpen: ancestorsOfMatches(tree, isMatch),
    }
  }, [rows, search])

  const activeKey = hitOrder.length > 0 ? hitOrder[activeHit % hitOrder.length] : null

  // Tell the rail how many rows matched so it can render "2 / 7" and step.
  useEffect(() => setHitCount?.(hitOrder.length), [hitOrder.length, setHitCount])
  // `jump` is in the deps so Enter re-scrolls even when there is only one match
  // and the active index therefore can't change.
  useEffect(() => {
    if (!activeKey) return
    document
      .getElementById(`mx-row-${activeKey}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeKey, jump])

  // Deepest ACCOUNT depth this level shows on its own.
  const maxDepth = level === 1 ? -1 : level === 2 ? 1 : Infinity
  const opensByLevel = (depth: number) => depth + 1 <= maxDepth
  const isOpen = (key: string, depth: number) =>
    forceOpen.has(key) ||
    (collapsed.has(key) ? false : opensByLevel(depth) || expanded.has(key))

  const toggle = (key: string, depth: number) => {
    const open = isOpen(key, depth)
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
    setExpanded((prev) => {
      const next = new Set(prev)
      if (open) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // One pass: skip anything inside a closed parent, and let an explicitly
  // opened parent's subtree bypass the level filter.
  const visibleRows: typeof rows = []
  const openKeys = new Set<string>()
  let hideDepth = Infinity
  let bypassDepth = Infinity
  for (const r of rows) {
    if (r.depth > hideDepth) continue
    hideDepth = Infinity
    if (r.depth <= bypassDepth) bypassDepth = Infinity
    const bypassed = r.depth > bypassDepth
    // A match and the path down to it always show, whatever the level.
    const onSearchPath = hitKeys.has(r.key) || forceOpen.has(r.key)
    // Subtotals (section / grand totals) and category rows always show.
    if (!(r.kind !== 'account' || bypassed || r.depth <= maxDepth || onSearchPath)) continue
    visibleRows.push(r)
    if (r.kind !== 'subtotal' && r.isParent) {
      if (isOpen(r.key, r.depth)) {
        openKeys.add(r.key)
        if (expanded.has(r.key)) bypassDepth = Math.min(bypassDepth, r.depth)
      } else {
        hideDepth = r.depth
      }
    }
  }

  const pct = (value: number, base: number) =>
    Math.abs(base) < 0.005 ? '—' : `${((value / base) * 100).toFixed(1)}%`
  // cf: zero is a dash, the accounting convention the statements and the
  // xlsx/pdf exports already use — a page of 0.00 hid the few real figures.
  const num = (n: number) =>
    cf && Math.abs(n) < 0.005 ? (
      <span className="cf-dash">—</span>
    ) : n < 0 ? (
      <span className="neg">{formatMoneyBare(n)}</span>
    ) : (
      formatMoneyBare(n)
    )

  return (
    // `cf-report` on the wrapper puts the skin tokens in scope for the pills too.
    <div className={[cf ? 'cf-report' : '', separated ? 'mx-sep' : ''].filter(Boolean).join(' ') || undefined}>
      {levelInRow ? null : (
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
                ? cf
                  ? 'cf-pill-on'
                  : 'bg-ink text-paper border-ink'
                : 'bg-surface text-graphite border-hairline hover:text-ink'
            }`}
          >
            L{lv}
          </button>
        ))}
      </div>
      )}

      <div className={`overflow-x-auto table-scroll border rounded-md mx-matrix ${cf ? 'cf-matrix' : 'border-hairline'}`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className={cf ? '' : 'border-b border-hairline'}>
              <th className={`sticky left-0 z-10 whitespace-nowrap text-left font-sans text-xs uppercase tracking-wide px-4 py-3 min-w-[130px] sm:min-w-[220px] ${cf ? 'cf-th' : 'bg-surface text-muted'}`}>
                {cf ? '' : 'Item'}
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  colSpan={showPct ? 2 : 1}
                  className={
                    cf
                      ? `cf-th mx-col-start text-right font-sans text-xs uppercase tracking-wide px-4 py-3 ${c.key === 'acc' ? 'font-semibold' : ''} ${c.key === nowKey ? 'cf-th-now' : ''}`
                      : `text-center font-sans text-xs uppercase tracking-wide px-4 py-3 border-l border-hairline ${c.key === 'acc' ? 'text-ink font-semibold' : 'text-muted'}`
                  }
                >
                  {c.label}
                </th>
              ))}
            </tr>
            {/* cf: one header row, as in the approved mock-up (the page
                subtitle that said "all amounts RM" went on 2026-10-12). The
                sub-row stays when a % column needs its label (Monthly P&L). */}
            {cf && !showPct ? null : (
              <tr className={cf ? '' : 'border-b border-hairline'}>
                <th className={`sticky left-0 z-10 px-4 py-1.5 ${cf ? 'cf-th cf-th-sub' : 'bg-surface'}`} />
                {columns.map((c) => (
                  <Fragment key={c.key}>
                    <th
                      className={`mx-col-start text-right font-mono text-[10px] uppercase px-4 py-1.5 ${
                        cf ? `cf-th cf-th-sub ${c.key === nowKey ? 'cf-th-now' : ''}` : 'text-muted border-l border-hairline'
                      }`}
                    >
                      RM
                    </th>
                    {showPct ? (
                      <th className={`text-right font-mono text-[10px] uppercase pr-4 py-1.5 ${cf ? `cf-th cf-th-sub ${c.key === nowKey ? 'cf-th-now' : ''}` : 'text-muted'}`}>
                        %
                      </th>
                    ) : null}
                  </Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isSub = row.kind === 'subtotal'
              const isCat = row.kind === 'category'
              const isStrong = isSub && row.emphasis === 'strong'
              const isParent = row.kind !== 'subtotal' && !!row.isParent
              // Arrow reflects what is actually on screen, level included.
              const isCollapsed = isParent && !openKeys.has(row.key)
              // Default skin — four shaded tiers, darkest → lightest: headline
              // total (accent wash, matching the GL statements) > section
              // subtotal / category (surface-2) > parent roll-up (paper) > leaf
              // (surface). cf skin — three bands with a job each (headline
              // navy, category pale navy, "now" column) on flat white.
              const bandBg = cf
                ? isStrong
                  ? 'cf-strong'
                  : isCat
                    ? 'cf-cat'
                    : isSub
                      ? 'cf-sub'
                      : 'cf-row'
                : isStrong
                  ? 'bg-accent-bg'
                  : isSub || isCat
                    ? 'bg-surface-2'
                    : isParent
                      ? 'bg-paper'
                      : 'bg-surface'
              const cellBg = bandBg
              const stickyBg = bandBg
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
              const labelWeight = isSub || isCat || isParent ? 'font-semibold' : 'font-normal'
              const rowBorder = cf
                ? isStrong
                  ? 'cf-strong-row'
                  : 'cf-hairline-row'
                : isStrong
                  ? 'border-t-2 border-b-2 border-accent-border'
                  : `border-hairline ${isSub || isCat ? 'border-t' : ''}`
              return (
                <tr
                  key={row.key}
                  id={`mx-row-${row.key}`}
                  className={`border-b last:border-0 ${rowBorder}${
                    activeKey === row.key
                      ? ' search-row-active'
                      : hitKeys.has(row.key)
                        ? ' search-row-hit'
                        : ''
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap ${stickyBg} ${isCat && cf ? 'cf-cat-label' : ''} px-4 font-sans ${labelTone} ${labelWeight} ${
                      isStrong ? 'py-4 text-[15px]' : 'py-2.5'
                    }`}
                    style={{ paddingLeft: `${16 + row.depth * 18}px` }}
                  >
                    {isParent ? (
                      <button
                        type="button"
                        onClick={() => toggle(row.key, row.depth)}
                        className="inline-flex items-center gap-1.5 text-left hover:text-accent transition-colors"
                        title={isCollapsed ? 'Expand children' : 'Collapse children'}
                      >
                        <span className={`text-[9px] w-2 inline-block leading-none ${isCat && cf ? 'cf-arrow' : 'text-muted'}`}>
                          {isCollapsed ? '▶' : '▼'}
                        </span>
                        <Highlight text={row.label} query={search} />
                      </button>
                    ) : (
                      <Highlight text={row.label} query={search} />
                    )}
                  </td>
                  {columns.map((c, i) => {
                    const v = row.values[i] ?? 0
                    const base = pctBaseByColumn?.[i] ?? 0
                    const now = cf && c.key === nowKey ? ' cf-now' : ''
                    return (
                      <Fragment key={`${row.key}-${c.key}`}>
                        <td
                          className={`mx-col-start text-right font-mono tabular px-4 ${cf ? '' : 'border-l border-hairline'} ${cellBg}${now} ${valueTone} ${
                            isStrong ? 'py-4 text-[15px]' : 'py-2.5'
                          } ${c.key === 'acc' ? 'font-semibold' : ''}`}
                        >
                          {num(v)}
                        </td>
                        {showPct ? (
                          <td className={`text-right font-mono tabular text-[11px] text-muted pr-4 ${isStrong ? 'py-4' : 'py-2.5'} ${cellBg}${now}`}>
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
