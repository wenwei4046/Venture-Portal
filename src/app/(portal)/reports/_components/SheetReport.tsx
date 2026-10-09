'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { matchesAccount } from '@/lib/report-search'
import type { SheetColumn, SheetRow, SheetTxn } from '@/lib/report-sheet'
import Highlight from './Highlight'
import { useReportSearch } from './ReportSearchProvider'

/**
 * The reports' table as the user's Claude Design handoff draws it (2026-10-10,
 * rptSection): a two-row head — each column's name over its RM (and %) — the
 * current month peach with an orange bar, Accumulated a shade darker; a blue
 * block title, groups and items, an open group's figure moved to a Subtotal
 * row under its items, tinted totals; negatives red in brackets, nil as a
 * dash, the current month's cells washed peach. L1 = the totals, L2 = + the
 * groups (folded), L3 = every item (a group folds by hand). Find highlights;
 * a match and the groups above it always show. A single month's items open
 * onto their journal lines (`drill`). Level and Find come from the page's
 * control row (ReportSearchProvider).
 */

export type { SheetColumn }

type Line =
  | { type: 'title'; row: SheetRow }
  | { type: 'total'; row: SheetRow }
  | { type: 'group' | 'item'; row: SheetRow; open: boolean; toggles: boolean }
  | { type: 'subtotal'; row: SheetRow }
  | { type: 'txn'; row: SheetRow; txn: SheetTxn }

const INDENT = (depth: number) => (depth <= 1 ? 28 : 50 + (depth - 2) * 20)

export default function SheetReport({
  columns,
  rows,
  pctBase,
  drill = false,
}: {
  columns: SheetColumn[]
  rows: SheetRow[]
  /** Each column's base for a % beside its figure; omit for no % column. */
  pctBase?: number[]
  /** A single month: an item opens onto its journal lines. */
  drill?: boolean
}) {
  const ctx = useReportSearch()
  const level = ctx?.level ?? 3
  const search = ctx?.search ?? ''
  const activeHit = ctx?.activeHit ?? 0
  const setHitCount = ctx?.setHitCount
  const jump = ctx?.jump ?? 0
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const [openTxns, setOpenTxns] = useState<Set<string>>(() => new Set())
  const showPct = Array.isArray(pctBase)

  // Find: the matching accounts, and every group above one (forced open).
  const { hits, hitOrder, forced } = useMemo(() => {
    const hits = new Set<string>()
    const forced = new Set<string>()
    const order: string[] = []
    if (!search.trim()) return { hits, hitOrder: order, forced }
    const stack: SheetRow[] = []
    for (const r of rows) {
      if (r.kind !== 'account') {
        stack.length = 0
        continue
      }
      while (stack.length > 0 && stack[stack.length - 1].depth >= r.depth) stack.pop()
      if (matchesAccount(search, r.code, r.label)) {
        hits.add(r.key)
        order.push(r.key)
        for (const a of stack) forced.add(a.key)
      }
      stack.push(r)
    }
    return { hits, hitOrder: order, forced }
  }, [rows, search])
  const activeKey = hitOrder.length > 0 ? hitOrder[activeHit % hitOrder.length] : null
  useEffect(() => setHitCount?.(hitOrder.length), [hitOrder.length, setHitCount])
  useEffect(() => {
    if (!activeKey) return
    document.getElementById(`sr-row-${activeKey}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeKey, jump])

  // What is on screen, in order: a group's Subtotal follows its last item.
  const lines = useMemo(() => {
    const out: Line[] = []
    const stack: Array<{ row: SheetRow; open: boolean; shown: boolean }> = []
    const flush = (depth: number) => {
      while (stack.length > 0 && stack[stack.length - 1].row.depth >= depth) {
        const a = stack.pop()!
        if (a.shown && a.open) out.push({ type: 'subtotal', row: a.row })
      }
    }
    for (const r of rows) {
      if (r.kind !== 'account') {
        flush(0)
        if (r.kind === 'total') out.push({ type: 'total', row: r })
        else if (level >= 2) out.push({ type: 'title', row: r })
        continue
      }
      flush(r.depth)
      const parent = stack[stack.length - 1]
      const onPath = hits.has(r.key) || forced.has(r.key)
      const shown = parent ? parent.shown && parent.open : level >= 2 || onPath
      const open = !!r.isParent && (forced.has(r.key) || (level === 3 && !closed.has(r.key)))
      if (shown) {
        const toggles = (!!r.isParent && level === 3) || (drill && !!r.txns?.length)
        out.push({ type: r.depth <= 1 ? 'group' : 'item', row: r, open, toggles })
        if (drill && r.txns && openTxns.has(r.key)) for (const t of r.txns) out.push({ type: 'txn', row: r, txn: t })
      }
      stack.push({ row: r, open, shown })
    }
    flush(0)
    return out
  }, [rows, level, closed, openTxns, hits, forced, drill])

  const flip = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const fig = (v: number, i: number) => {
    const now = columns[i]?.tone === 'now' ? ' is-now' : ''
    if (Math.abs(v) < 0.005) return <td key={`v${i}`} className={`sr-num is-nil${now}`}>—</td>
    return (
      <td key={`v${i}`} className={`sr-num${v < 0 ? ' is-neg' : ''}${now}`}>
        {formatMoneyBare(v)}
      </td>
    )
  }
  const pct = (v: number, i: number) => {
    const now = columns[i]?.tone === 'now' ? ' is-now' : ''
    const base = pctBase?.[i] ?? 0
    const text = Math.abs(base) < 0.005 ? '—' : `${((v / base) * 100).toFixed(1)}%`
    return (
      <td key={`p${i}`} className={`sr-pct${v < 0 && Math.abs(base) >= 0.005 ? ' is-neg' : ''}${now}`}>
        {text}
      </td>
    )
  }
  const cells = (values: number[] | null) =>
    columns.map((c, i) => (
      <Fragment key={c.key}>
        {values ? fig(values[i] ?? 0, i) : <td className={`sr-num${c.tone === 'now' ? ' is-now' : ''}`} />}
        {showPct ? values ? pct(values[i] ?? 0, i) : <td className={`sr-pct${c.tone === 'now' ? ' is-now' : ''}`} /> : null}
      </Fragment>
    ))

  return (
    <div className="sheet-rpt">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="sr-corner" />
            {columns.map((c) => (
              <th key={c.key} colSpan={showPct ? 2 : 1} className={c.tone === 'now' ? 'is-now' : c.tone === 'acc' ? 'is-acc' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map((c) => (
              <Fragment key={c.key}>
                <th className={`sr-unit${c.tone === 'now' ? ' is-now' : c.tone === 'acc' ? ' is-acc' : ''}`}>RM</th>
                {showPct ? <th className={`sr-unit sr-unit-pct${c.tone === 'now' ? ' is-now' : c.tone === 'acc' ? ' is-acc' : ''}`}>%</th> : null}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            if (l.type === 'title') {
              return (
                <tr key={l.row.key} data-kind="title" className="sr-title">
                  <td className="sr-label" style={{ paddingLeft: 14 }}>
                    {l.row.label}
                  </td>
                  {cells(null)}
                </tr>
              )
            }
            if (l.type === 'total') {
              return (
                <tr key={l.row.key} data-kind="total" className={`sr-total${l.row.strong ? ' is-strong' : ''}`}>
                  <td className="sr-label" style={{ paddingLeft: 14 }}>
                    {l.row.label}
                  </td>
                  {cells(l.row.values)}
                </tr>
              )
            }
            if (l.type === 'subtotal') {
              return (
                <tr key={`${l.row.key}:subtotal`} data-kind="subtotal" className="sr-sub">
                  <td className="sr-label" style={{ paddingLeft: INDENT(l.row.depth + 1) }}>
                    Subtotal
                  </td>
                  {cells(l.row.values)}
                </tr>
              )
            }
            if (l.type === 'txn') {
              return (
                <tr key={l.txn.key} data-kind="txn" className="sr-txn">
                  <td className="sr-label" style={{ paddingLeft: INDENT(l.row.depth) + 20 }}>
                    <span className="sr-ref">
                      {[l.txn.ref, dayjs(l.txn.date).format('DD MMM')].filter(Boolean).join(' · ')}
                    </span>
                    {l.txn.text ? <span className="sr-txn-text">{l.txn.text}</span> : null}
                  </td>
                  {columns.map((c, i) => (
                    <Fragment key={c.key}>
                      {i === 0 ? fig(l.txn.value, 0) : <td className={`sr-num${c.tone === 'now' ? ' is-now' : ''}`} />}
                      {showPct ? <td className={`sr-pct${c.tone === 'now' ? ' is-now' : ''}`} /> : null}
                    </Fragment>
                  ))}
                </tr>
              )
            }
            const r = l.row
            const isDrill = drill && !r.isParent && !!r.txns?.length
            const expanded = isDrill ? openTxns.has(r.key) : l.open
            const arrow = !l.toggles ? '' : isDrill ? (expanded ? '▾' : '▸') : expanded ? '▼' : '▶'
            const label = (
              <>
                <span className="sr-chev" aria-hidden>
                  {arrow}
                </span>
                <Highlight text={r.label} query={search} />
              </>
            )
            const mark = `${hits.has(r.key) ? ' is-hit' : ''}${activeKey === r.key ? ' is-active' : ''}`
            return (
              <tr key={r.key} id={`sr-row-${r.key}`} data-kind={l.type} className={`sr-${l.type}${mark}`}>
                <td className="sr-label" style={{ paddingLeft: INDENT(r.depth) }} title={r.label}>
                  {l.toggles ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => (isDrill ? flip(openTxns, r.key, setOpenTxns) : flip(closed, r.key, setClosed))}
                    >
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </td>
                {cells(l.open ? null : r.values)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
