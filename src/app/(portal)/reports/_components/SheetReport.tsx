'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { matchesAccount } from '@/lib/report-search'
import { rangeLabel } from '@/lib/report-range'
import type { SheetColumn, SheetRow, SheetTxn } from '@/lib/report-sheet'
import type { MonthlyDrillAsk } from '../_lib/drill-reads'
import type { MonthlyDrillAnswer } from '../drill-actions'
import Highlight from './Highlight'
import { useReportSearch } from './ReportSearchProvider'

/**
 * The reports' table as the user's Claude Design handoff draws it (2026-10-10,
 * rptSection): a two-row head — each column's name over its RM (and %) — the
 * current month peach with an orange bar, Accumulated a shade darker; a blue
 * block title, groups and items, an open group's figure moved to a Subtotal
 * row under its items, tinted totals; negatives red in brackets, nil as a
 * dash, the current month's cells washed peach. L1 = the totals, L2 = + the
 * groups (folded), L3 every item (a group folds by hand). Find highlights;
 * a match and the groups above it always show. Level and Find come from the
 * page's control row (ReportSearchProvider).
 *
 * An account opens on its whole row (2026-10-24, the user's drill-down — "我想要这样的概念", then "照样稿做，Monthly
 * 用 A"): a single month's (`drill`) onto its journal lines as a ledger — Date, Description, Other side, Ref. 1 (the
 * entry), Ref. 2 (the document), Debit, Credit, the count and totals under them with the General Ledger a click away;
 * a month-by-month sheet's (`monthly`) onto its months, read when it opens, each month onto its own lines.
 */

export type { SheetColumn }

/** A month-by-month sheet whose accounts open: the page's server action, and which report and segment it reads. */
export interface MonthlyDrill {
  open: (ask: MonthlyDrillAsk) => Promise<MonthlyDrillAnswer>
  report: MonthlyDrillAsk['report']
  /** '' = every segment. */
  segment: string
}

type Line =
  | { type: 'title'; row: SheetRow }
  | { type: 'total'; row: SheetRow }
  | { type: 'group' | 'item'; row: SheetRow; open: boolean; toggles: boolean }
  | { type: 'subtotal'; row: SheetRow }
  | { type: 'drill'; row: SheetRow }

/** A month-by-month account's lines, as far as they are read. */
type Read = { state: 'reading' } | { state: 'failed'; reason: string } | { state: 'ready'; lines: SheetTxn[] }

const INDENT = (depth: number) => (depth <= 1 ? 28 : 50 + (depth - 2) * 20)
const MONTH = /^\d{4}-\d{2}$/
const NONE: ReadonlySet<string> = new Set()
const NOT_READ = 'The lines could not be read just now. Try again.'

const money = (v: number) => (Math.abs(v) < 0.005 ? '—' : formatMoneyBare(v))
const total = (lines: SheetTxn[], side: 'debit' | 'credit') => Math.round(lines.reduce((s, t) => s + t[side], 0) * 100) / 100
const monthEnd = (ym: string) => dayjs(`${ym}-01`).endOf('month').format('YYYY-MM-DD')

/** The General Ledger on this account over these days — a chart account only (not the bridge's IB-XFER / PY-XFER). */
const ledgerHref = (code: string | undefined, from: string, to: string) =>
  code && /^\d/.test(code) ? `/reports/ledger?${new URLSearchParams({ codes: code, from, to }).toString()}` : null

/** "9 lines · Open in General Ledger ↗ · Oct 2026". */
function Count({ n, href, label }: { n: number; href: string | null; label: string }) {
  return (
    <>
      <span className="sr-dl-count">{`${n} ${n === 1 ? 'line' : 'lines'} · `}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="sr-dl-gl">
          Open in General Ledger ↗
        </a>
      ) : null}
      <span className="sr-dl-count">{href ? ` · ${label}` : label}</span>
    </>
  )
}

/** One account's journal lines as a ledger. */
function DrillTable({ lines, href, label }: { lines: SheetTxn[]; href: string | null; label: string }) {
  return (
    <table className="sr-dl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Other side</th>
          <th>Ref. 1</th>
          <th>Ref. 2</th>
          <th className="is-num">Debit</th>
          <th className="is-num">Credit</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((t) => (
          <tr key={t.key}>
            <td className="is-mono">{t.date}</td>
            <td className="sr-dl-desc">{t.text || '—'}</td>
            <td className="sr-dl-other">{t.otherSide ?? '—'}</td>
            <td className="is-mono">{t.ref || '—'}</td>
            <td className="is-mono">{t.ref2 ?? '—'}</td>
            <td className="is-mono is-num">{money(t.debit)}</td>
            <td className="is-mono is-num">{money(t.credit)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5}>
            <Count n={lines.length} href={href} label={label} />
          </td>
          <td className="is-mono is-num">{formatMoneyBare(total(lines, 'debit'))}</td>
          <td className="is-mono is-num">{formatMoneyBare(total(lines, 'credit'))}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** A month-by-month account opened (Monthly A): its months, latest first, each opening onto its lines. */
function MonthList({
  row,
  columns,
  read,
  openMonths,
  onMonth,
  onRetry,
}: {
  row: SheetRow
  columns: SheetColumn[]
  read: Read | undefined
  openMonths: ReadonlySet<string>
  onMonth: (ym: string) => void
  onRetry: () => void
}) {
  const months = columns
    .map((c, i) => ({ key: c.key, label: c.label, value: row.values[i] ?? 0 }))
    .filter((c) => MONTH.test(c.key))
    .sort((a, b) => b.key.localeCompare(a.key))
  const range = months.length > 0 ? rangeLabel(months[months.length - 1].key, months[0].key) : ''
  const head = (
    <div className="sr-drill-title">
      <b>{row.label}</b> · {range} · month by month
    </div>
  )
  if (!read || read.state === 'reading') {
    return (
      <>
        {head}
        <p className="sr-drill-note" role="status">
          Reading the lines…
        </p>
      </>
    )
  }
  if (read.state === 'failed') {
    return (
      <>
        {head}
        <p className="sr-drill-note is-error" role="alert">
          {read.reason}{' '}
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </p>
      </>
    )
  }
  const listed = months
    .map((m) => ({ ...m, lines: read.lines.filter((t) => t.date.startsWith(m.key)) }))
    .filter((m) => m.lines.length > 0 || Math.abs(m.value) >= 0.005)
  const acc = columns.findIndex((c) => c.key === 'acc')
  const sum = acc >= 0 ? row.values[acc] ?? 0 : listed.reduce((s, m) => s + m.value, 0)
  const count = listed.reduce((s, m) => s + m.lines.length, 0)
  const first = months[months.length - 1]?.key
  const last = months[0]?.key
  return (
    <>
      {head}
      <table className="sr-months">
        {/* Fixed columns, so an opened month's ledger scrolls in its own box and never pushes the figures off a phone. */}
        <colgroup>
          <col />
          <col className="is-count" />
          <col className="is-value" />
        </colgroup>
        <tbody>
          {listed.length === 0 ? (
            <tr>
              <td colSpan={3} className="sr-drill-note">
                No lines in {range}.
              </td>
            </tr>
          ) : null}
          {listed.map((m) => {
            const open = openMonths.has(`${row.key}|${m.key}`)
            const opens = m.lines.length > 0
            const name = (
              <>
                <span className="sr-chev" aria-hidden>
                  {opens ? (open ? '▾' : '▸') : ''}
                </span>
                {m.label}
              </>
            )
            return (
              <Fragment key={m.key}>
                <tr data-kind="month" className={opens ? 'can-open' : undefined} onClick={opens ? () => onMonth(m.key) : undefined}>
                  <td className="sr-month-name">
                    {opens ? (
                      <button type="button" aria-expanded={open}>
                        {name}
                      </button>
                    ) : (
                      name
                    )}
                  </td>
                  <td className="sr-month-count">
                    {m.lines.length} {m.lines.length === 1 ? 'line' : 'lines'}
                  </td>
                  <td className={`is-mono is-num${m.value < 0 ? ' is-neg' : ''}`}>{money(m.value)}</td>
                </tr>
                {open ? (
                  <tr className="sr-month-lines">
                    <td colSpan={3}>
                      <div className="sr-dl-scroll">
                        <DrillTable lines={m.lines} href={ledgerHref(row.code, `${m.key}-01`, monthEnd(m.key))} label={m.label} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <Count n={count} href={first && last ? ledgerHref(row.code, `${first}-01`, monthEnd(last)) : null} label={range} />
            </td>
            <td className={`is-mono is-num${sum < 0 ? ' is-neg' : ''}`}>{money(sum)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  )
}

export default function SheetReport({
  columns,
  rows,
  pctBase,
  drill = false,
  drillMonth,
  monthly,
}: {
  columns: SheetColumn[]
  rows: SheetRow[]
  /** Each column's base for a % beside its figure; omit for no % column. */
  pctBase?: number[]
  /** A single month: an item opens onto its journal lines. */
  drill?: boolean
  /** That month, 'YYYY-MM' — the lines' General Ledger link and label. */
  drillMonth?: string
  /** A month-by-month sheet: an account opens onto its months, read when it opens. */
  monthly?: MonthlyDrill
}) {
  const ctx = useReportSearch()
  const level = ctx?.level ?? 3
  const search = ctx?.search ?? ''
  const activeHit = ctx?.activeHit ?? 0
  const setHitCount = ctx?.setHitCount
  const jump = ctx?.jump ?? 0
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const showPct = Array.isArray(pctBase)

  // The sheet's months (a month-by-month sheet's), first and last.
  const monthKeys = columns.map((c) => c.key).filter((k) => MONTH.test(k))
  const firstMonth = monthKeys.length > 0 ? monthKeys.reduce((a, b) => (b < a ? b : a)) : null
  const lastMonth = monthKeys.length > 0 ? monthKeys.reduce((a, b) => (b > a ? b : a)) : null
  // What an opened account belongs to: another period or segment starts the sheet folded again, and reads afresh.
  const scope = monthly ? `${monthly.report}|${monthly.segment}|${firstMonth}|${lastMonth}` : (drillMonth ?? '')
  const [opened, setOpened] = useState<{ scope: string; rows: ReadonlySet<string>; months: ReadonlySet<string> }>(() => ({ scope, rows: NONE, months: NONE }))
  const [reads, setReads] = useState<{ scope: string; byRow: Readonly<Record<string, Read>> }>(() => ({ scope, byRow: {} }))
  const openRows = opened.scope === scope ? opened.rows : NONE
  const openMonths = opened.scope === scope ? opened.months : NONE
  const readOf = (key: string): Read | undefined => (reads.scope === scope ? reads.byRow[key] : undefined)

  // An opened account's ledger keeps to the width on screen, however wide the months make the sheet.
  const wrap = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState<number | null>(null)
  const drills = drill || !!monthly
  useEffect(() => {
    const el = wrap.current
    if (!drills || !el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => setBoxWidth(Math.floor(el.clientWidth)))
    watch.observe(el)
    return () => watch.disconnect()
  }, [drills])

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

  // Which accounts open: a single month's with lines; a month-by-month sheet's leaf accounts — any on the P&L, the
  // cash rows on the Cash Flow and Receipt & Payment (never the receivables under them).
  const { monthlyOpens, opens } = useMemo(() => {
    const monthlyOpens = (r: SheetRow) =>
      !!monthly && !!firstMonth && r.kind === 'account' && !r.isParent && !!r.code && (monthly.report === 'pnl' || /^(in|out):/.test(r.key))
    return { monthlyOpens, opens: (r: SheetRow) => (drill && !r.isParent && !!r.txns?.length) || monthlyOpens(r) }
  }, [drill, monthly, firstMonth])

  // What is on screen, in order: a group's Subtotal follows its last item; an opened account's lines follow it.
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
        const drills = opens(r)
        out.push({ type: r.depth <= 1 ? 'group' : 'item', row: r, open, toggles: (!!r.isParent && level === 3) || drills })
        if (drills && openRows.has(r.key)) out.push({ type: 'drill', row: r })
      }
      stack.push({ row: r, open, shown })
    }
    flush(0)
    return out
  }, [rows, level, closed, openRows, hits, forced, opens])

  const flip = (set: ReadonlySet<string>, key: string): Set<string> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  // A month-by-month account's lines, read for the sheet's months; an answer for another period is dropped.
  const readRow = (r: SheetRow) => {
    if (!monthly || !r.code || !firstMonth || !lastMonth) return
    const at = scope
    const put = (read: Read) => setReads((prev) => (prev.scope === at ? { scope: at, byRow: { ...prev.byRow, [r.key]: read } } : prev))
    setReads((prev) => ({ scope: at, byRow: { ...(prev.scope === at ? prev.byRow : {}), [r.key]: { state: 'reading' } } }))
    const side = monthly.report === 'pnl' ? null : r.key.startsWith('in:') ? 'in' : 'out'
    monthly
      .open({ report: monthly.report, segment: monthly.segment, from: firstMonth, to: lastMonth, code: r.code, side })
      .then((answer) => put(answer.ok ? { state: 'ready', lines: answer.lines } : { state: 'failed', reason: answer.reason || NOT_READ }))
      .catch(() => put({ state: 'failed', reason: NOT_READ }))
  }

  const toggleRow = (r: SheetRow) => {
    const rowsOpen = flip(openRows, r.key)
    setOpened({ scope, rows: rowsOpen, months: openMonths })
    const read = readOf(r.key)
    if (rowsOpen.has(r.key) && monthlyOpens(r) && (!read || read.state === 'failed')) readRow(r)
  }
  const toggleMonth = (r: SheetRow, ym: string) => setOpened({ scope, rows: openRows, months: flip(openMonths, `${r.key}|${ym}`) })

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
  const span = 1 + columns.length * (showPct ? 2 : 1)

  return (
    <div className="sheet-rpt" ref={wrap}>
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
            if (l.type === 'drill') {
              const r = l.row
              return (
                <tr key={`${r.key}:drill`} data-kind="drill" className="sr-drill">
                  <td colSpan={span}>
                    <div className="sr-drill-box" style={boxWidth ? { width: boxWidth } : undefined}>
                      {monthly ? (
                        <MonthList
                          row={r}
                          columns={columns}
                          read={readOf(r.key)}
                          openMonths={openMonths}
                          onMonth={(ym) => toggleMonth(r, ym)}
                          onRetry={() => readRow(r)}
                        />
                      ) : (
                        <DrillTable
                          lines={r.txns ?? []}
                          href={drillMonth ? ledgerHref(r.code, `${drillMonth}-01`, monthEnd(drillMonth)) : null}
                          label={drillMonth ? rangeLabel(drillMonth, drillMonth) : columns[0]?.label ?? ''}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )
            }
            const r = l.row
            const drills = opens(r)
            const expanded = drills ? openRows.has(r.key) : l.open
            const arrow = !l.toggles ? '' : drills ? (expanded ? '▾' : '▸') : expanded ? '▼' : '▶'
            const label = (
              <>
                <span className="sr-chev" aria-hidden>
                  {arrow}
                </span>
                <Highlight text={r.label} query={search} />
              </>
            )
            const mark = `${hits.has(r.key) ? ' is-hit' : ''}${activeKey === r.key ? ' is-active' : ''}${drills ? ' can-open' : ''}`
            return (
              <tr
                key={r.key}
                id={`sr-row-${r.key}`}
                data-kind={l.type}
                className={`sr-${l.type}${mark}`}
                // An account that opens does so on its whole row; its name's button is the keyboard's way in.
                onClick={drills ? () => toggleRow(r) : undefined}
              >
                <td className="sr-label" style={{ paddingLeft: INDENT(r.depth) }} title={r.label}>
                  {l.toggles ? (
                    <button type="button" aria-expanded={expanded} onClick={drills ? undefined : () => setClosed(flip(closed, r.key))}>
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
