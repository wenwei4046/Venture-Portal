'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { matchesAccount } from '@/lib/report-search'
import { rangeLabel } from '@/lib/report-range'
import { drillRowKey, type SheetColumn, type SheetRow, type SheetTxn } from '@/lib/report-sheet'
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
 * An account opens on its whole row (2026-10-24, the user's drill-down — "我想要这样的概念"): a single month's (`drill`)
 * onto its journal lines as a ledger — Date, Description, Other side, Ref. 1 (the entry), Ref. 2 (the document),
 * Debit, Credit, the count and totals under them with the General Ledger a click away. A month-by-month sheet's
 * (`monthly`, 2026-10-26, the mockup's fifth round — "点开看 detail 可以那个 amount 在那个月份下面吗？… 然后加多一个 L4")
 * onto its lines AS ROWS OF THE SHEET, newest first: "date · NAME · what it was · document", its figure in the
 * Total and under its own month, a dash in the other months; read when it opens; L4 opens every account so, in one
 * read, a click closing one.
 *
 * A department's page (`variant="dept"`, 2026-10-25, the mockup's rounds 11–12) dresses it as its charts: a block's
 * title carries its side's total, green or orange, at every level; a group keeps its figure on its own line (no
 * Subtotal); L2 opens a group by its ▶, L3 has them all open; a row may carry its own % base and a square in its
 * chart colour (lib/dept-statement shapes the rows).
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
  | { type: 'lines'; row: SheetRow }

/** A month-by-month account's lines, as far as they are read. */
type Read = { state: 'failed'; reason: string } | { state: 'ready'; lines: SheetTxn[] }

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

/** What a line was, its name first in bold (2026-10-26, the user: "先名字再到 description", "名字变粗体"). */
function Said({ t, party, sep, text }: { t: SheetTxn; party: string; sep: string; text: string }) {
  return (
    <>
      {t.party ? (
        <>
          <span className={party}>{t.party}</span>
          {t.text ? <span className={sep}> · </span> : null}
        </>
      ) : null}
      {t.text || !t.party ? <span className={text}>{t.text || '—'}</span> : null}
    </>
  )
}

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

/** One account's journal lines as a ledger (a single month's). */
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
            <td className="sr-dl-desc">
              <Said t={t} party="sr-dl-party" sep="sr-dl-sep" text="sr-dl-text" />
            </td>
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

/** A line's hover: who and what, the entry and the document, its other side, its debit and credit. */
const hoverOf = (t: SheetTxn) =>
  [
    `${t.date} · ${[t.party, t.text].filter(Boolean).join(' · ') || '—'}`,
    `Ref. 1 ${t.ref || '—'} · Ref. 2 ${t.ref2 ?? '—'}`,
    `Other side ${t.otherSide ?? '—'}`,
    `Debit ${formatMoneyBare(t.debit)} · Credit ${formatMoneyBare(t.credit)}`,
  ].join('\n')

export default function SheetReport({
  columns,
  rows,
  pctBase,
  drill = false,
  drillMonth,
  monthly,
  variant,
}: {
  columns: SheetColumn[]
  rows: SheetRow[]
  /** Each column's base for a % beside its figure; omit for no % column (unless the rows carry their own). */
  pctBase?: number[]
  /** A single month: an item opens onto its journal lines. */
  drill?: boolean
  /** That month, 'YYYY-MM' — the lines' General Ledger link and label. */
  drillMonth?: string
  /** A month-by-month sheet: an account opens onto its lines as rows of the sheet, read when it opens. */
  monthly?: MonthlyDrill
  /** A department's page: its charts' dress (see above). */
  variant?: 'dept'
}) {
  const ctx = useReportSearch()
  const level = ctx?.level ?? 3
  const search = ctx?.search ?? ''
  const activeHit = ctx?.activeHit ?? 0
  const setHitCount = ctx?.setHitCount
  const jump = ctx?.jump ?? 0
  const inline = variant === 'dept'
  // L3 and L4 open every group (L4 every account onto its lines too).
  const deep = level >= 3
  // The groups turned by hand: closed ones on Reports (L3 opens them all); on a department's page, at the level
  // they were turned at — L2 opens, L3 closes, a new level starts afresh.
  const [closed, setClosed] = useState<{ level: number; keys: ReadonlySet<string> }>(() => ({ level, keys: NONE }))
  const turned = inline && closed.level !== level ? NONE : closed.keys
  const showPct = Array.isArray(pctBase) || rows.some((r) => r.pctBase !== undefined)

  // The sheet's months (a month-by-month sheet's), first and last.
  const monthKeys = columns.map((c) => c.key).filter((k) => MONTH.test(k))
  const firstMonth = monthKeys.length > 0 ? monthKeys.reduce((a, b) => (b < a ? b : a)) : null
  const lastMonth = monthKeys.length > 0 ? monthKeys.reduce((a, b) => (b > a ? b : a)) : null
  // What an opened account belongs to: another period or segment starts the sheet folded again, and reads afresh.
  const scope = monthly ? `${monthly.report}|${monthly.segment}|${firstMonth}|${lastMonth}` : (drillMonth ?? '')
  // The accounts turned by hand, at the level they were turned at: below L4 the ones opened, at L4 the ones closed.
  const [opened, setOpened] = useState<{ scope: string; level: number; rows: ReadonlySet<string> }>(() => ({ scope, level, rows: NONE }))
  const [reads, setReads] = useState<{ scope: string; byRow: Readonly<Record<string, Read>> }>(() => ({ scope, byRow: {} }))
  const handled = opened.scope === scope && opened.level === level ? opened.rows : NONE
  const readOf = (key: string): Read | undefined => (reads.scope === scope ? reads.byRow[key] : undefined)

  // A single month's ledger keeps to the width on screen, however wide the columns make the sheet.
  const wrap = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!drill || !el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => setBoxWidth(Math.floor(el.clientWidth)))
    watch.observe(el)
    return () => watch.disconnect()
  }, [drill])

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
  // cash rows on the Cash Flow and Receipt & Payment (never the receivables under them) — and whether one is open:
  // at L4 unless closed by hand, below it when opened by hand.
  const { monthlyOpens, opens, isOpen } = useMemo(() => {
    const monthlyOpens = (r: SheetRow) =>
      !!monthly && !!firstMonth && r.kind === 'account' && !r.isParent && !!r.code && (monthly.report === 'pnl' || /^(in|out):/.test(r.key))
    return {
      monthlyOpens,
      opens: (r: SheetRow) => (drill && !r.isParent && !!r.txns?.length) || monthlyOpens(r),
      isOpen: (r: SheetRow) => (monthlyOpens(r) && level === 4 ? !handled.has(r.key) : handled.has(r.key)),
    }
  }, [drill, monthly, firstMonth, level, handled])

  // What is on screen, in order: a group's Subtotal follows its last item; an opened account's lines follow it.
  const lines = useMemo(() => {
    const out: Line[] = []
    const stack: Array<{ row: SheetRow; open: boolean; shown: boolean }> = []
    const flush = (depth: number) => {
      while (stack.length > 0 && stack[stack.length - 1].row.depth >= depth) {
        const a = stack.pop()!
        if (a.shown && a.open && !inline) out.push({ type: 'subtotal', row: a.row })
      }
    }
    for (const r of rows) {
      if (r.kind !== 'account') {
        flush(0)
        if (r.kind === 'total') out.push({ type: 'total', row: r })
        // A title from L2 — one carrying its block's total (a department's) at every level.
        else if (level >= 2 || r.values.length > 0) out.push({ type: 'title', row: r })
        continue
      }
      flush(r.depth)
      const parent = stack[stack.length - 1]
      const onPath = hits.has(r.key) || forced.has(r.key)
      const shown = parent ? parent.shown && parent.open : level >= 2 || onPath
      const byHand = inline ? level >= 2 && deep !== turned.has(r.key) : deep && !turned.has(r.key)
      const open = !!r.isParent && (forced.has(r.key) || byHand)
      if (shown) {
        const drills = opens(r)
        out.push({ type: r.depth <= 1 ? 'group' : 'item', row: r, open, toggles: (!!r.isParent && (inline ? level >= 2 : deep)) || drills })
        if (drills && isOpen(r)) out.push({ type: monthlyOpens(r) ? 'lines' : 'drill', row: r })
      }
      stack.push({ row: r, open, shown })
    }
    flush(0)
    return out
  }, [rows, level, inline, deep, turned, hits, forced, opens, isOpen, monthlyOpens])

  const flip = (set: ReadonlySet<string>, key: string): Set<string> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  // The opened accounts' lines, read for the sheet's months — every one on show and not read yet in ONE ask (L4 asks
  // for them all); an answer for another period or segment is dropped.
  const asking = useRef(new Set<string>())
  const unread = useMemo(
    () => lines.flatMap((l) => (l.type === 'lines' && !(reads.scope === scope && reads.byRow[l.row.key]) ? [l.row] : [])),
    [lines, reads, scope],
  )
  const readRows = useCallback(
    (want: SheetRow[]) => {
      if (!monthly || !firstMonth || !lastMonth) return
      const at = scope
      const sideOf = (r: SheetRow) => (monthly.report === 'pnl' ? null : r.key.startsWith('in:') ? ('in' as const) : ('out' as const))
      const put = (byRow: Record<string, Read>) =>
        setReads((prev) => (prev.scope === at ? { scope: at, byRow: { ...prev.byRow, ...byRow } } : { scope: at, byRow }))
      const each = (answerOf: (r: SheetRow) => Read) => Object.fromEntries(want.map((r) => [r.key, answerOf(r)]))
      monthly
        .open({ report: monthly.report, segment: monthly.segment, from: firstMonth, to: lastMonth, rows: want.map((r) => ({ code: r.code ?? '', side: sideOf(r) })) })
        .then((answer) =>
          put(each((r) => (answer.ok ? { state: 'ready', lines: answer.lines[drillRowKey(r.code ?? '', sideOf(r))] ?? [] } : { state: 'failed', reason: answer.reason || NOT_READ }))),
        )
        .catch(() => put(each(() => ({ state: 'failed', reason: NOT_READ }))))
        .finally(() => {
          for (const r of want) asking.current.delete(`${at}|${r.key}`)
        })
    },
    [monthly, scope, firstMonth, lastMonth],
  )
  useEffect(() => {
    const want = unread.filter((r) => !asking.current.has(`${scope}|${r.key}`))
    if (want.length === 0) return
    for (const r of want) asking.current.add(`${scope}|${r.key}`)
    readRows(want)
  }, [unread, scope, readRows])
  // Try again: the row's failure forgotten, so it is read afresh.
  const retry = (r: SheetRow) =>
    setReads((prev) => {
      const byRow = { ...prev.byRow }
      delete byRow[r.key]
      return { ...prev, byRow }
    })

  const toggleRow = (r: SheetRow) => setOpened({ scope, level, rows: flip(handled, r.key) })

  // The column's own wash: the month still running, or the Accumulated (a department's Total).
  const tone = (i: number) => (columns[i]?.tone === 'now' ? ' is-now' : columns[i]?.tone === 'acc' ? ' is-acc' : '')
  const fig = (v: number, i: number) => {
    const now = tone(i)
    if (Math.abs(v) < 0.005) return <td key={`v${i}`} className={`sr-num is-nil${now}`}>—</td>
    return (
      <td key={`v${i}`} className={`sr-num${v < 0 ? ' is-neg' : ''}${now}`}>
        {formatMoneyBare(v)}
      </td>
    )
  }
  const pct = (v: number, i: number, row?: SheetRow) => {
    const now = tone(i)
    const own = row?.pctBase
    const base = own === undefined ? (pctBase?.[i] ?? 0) : own === null ? 0 : (own[i] ?? 0)
    const share = Math.abs(base) < 0.005 ? null : (v / base) * 100
    // A share that rounds to nothing reads 0.0%, never -0.0%.
    const text = share === null ? '—' : `${Math.abs(share) < 0.05 ? '0.0' : share.toFixed(1)}%`
    return (
      <td key={`p${i}`} className={`sr-pct${v < 0 && share !== null && Math.abs(share) >= 0.05 ? ' is-neg' : ''}${now}`}>
        {text}
      </td>
    )
  }
  const cells = (values: number[] | null, row?: SheetRow) =>
    columns.map((c, i) => (
      <Fragment key={c.key}>
        {values ? fig(values[i] ?? 0, i) : <td className={`sr-num${tone(i)}`} />}
        {showPct ? values ? pct(values[i] ?? 0, i, row) : <td className={`sr-pct${tone(i)}`} /> : null}
      </Fragment>
    ))
  // A line's cells: its figure in the Total and under its own month, a dash elsewhere, no %.
  const lineCells = (t: SheetTxn, sign: number) =>
    columns.map((c, i) => (
      <Fragment key={c.key}>
        {c.key === 'acc' || t.date.startsWith(c.key) ? fig(t.value * sign, i) : <td className={`sr-num is-nil${tone(i)}`}>—</td>}
        {showPct ? <td className={`sr-pct${tone(i)}`} /> : null}
      </Fragment>
    ))
  const empty = () =>
    columns.map((c, i) => (
      <Fragment key={c.key}>
        <td className={`sr-num${tone(i)}`} />
        {showPct ? <td className={`sr-pct${tone(i)}`} /> : null}
      </Fragment>
    ))
  const span = 1 + columns.length * (showPct ? 2 : 1)
  const sideOf = (r: SheetRow) => (r.side ? ` is-${r.side}` : '')
  const anyLines = lines.some((l) => l.type === 'lines')

  return (
    <div className={`sheet-rpt${inline ? ' is-dept' : ''}${anyLines ? ' has-lines' : ''}`} ref={wrap}>
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
                <tr key={l.row.key} data-kind="title" className={`sr-title${sideOf(l.row)}`}>
                  <td className="sr-label" style={{ paddingLeft: 14 }}>
                    {l.row.label}
                  </td>
                  {cells(l.row.values.length > 0 ? l.row.values : null, l.row)}
                </tr>
              )
            }
            if (l.type === 'total') {
              return (
                <tr key={l.row.key} data-kind="total" className={`sr-total${l.row.strong ? ' is-strong' : ''}`}>
                  <td className="sr-label" style={{ paddingLeft: 14 }}>
                    {l.row.label}
                  </td>
                  {cells(l.row.values, l.row)}
                </tr>
              )
            }
            if (l.type === 'subtotal') {
              return (
                <tr key={`${l.row.key}:subtotal`} data-kind="subtotal" className="sr-sub">
                  <td className="sr-label" style={{ paddingLeft: INDENT(l.row.depth + 1) }}>
                    Subtotal
                  </td>
                  {cells(l.row.values, l.row)}
                </tr>
              )
            }
            if (l.type === 'drill') {
              const r = l.row
              return (
                <tr key={`${r.key}:drill`} data-kind="drill" className="sr-drill">
                  <td colSpan={span}>
                    <div className="sr-drill-box" style={boxWidth ? { width: boxWidth } : undefined}>
                      <DrillTable
                        lines={r.txns ?? []}
                        href={drillMonth ? ledgerHref(r.code, `${drillMonth}-01`, monthEnd(drillMonth)) : null}
                        label={drillMonth ? rangeLabel(drillMonth, drillMonth) : columns[0]?.label ?? ''}
                      />
                    </div>
                  </td>
                </tr>
              )
            }
            if (l.type === 'lines') {
              const r = l.row
              const read = readOf(r.key)
              // The lines sit one level in; a phone gives them the whole narrow column (CSS).
              const pad = { ['--ln-indent' as string]: `${INDENT(r.depth + 1)}px` } as CSSProperties
              if (!read) {
                return (
                  <tr key={`${r.key}:reading`} data-kind="line-note" className="sr-ln-foot">
                    <td className="sr-label sr-ln-label" style={pad} role="status">
                      Reading the lines…
                    </td>
                    {empty()}
                  </tr>
                )
              }
              if (read.state === 'failed') {
                return (
                  <tr key={`${r.key}:failed`} data-kind="line-note" className="sr-ln-foot is-error">
                    <td className="sr-label sr-ln-label" style={pad} role="alert">
                      {read.reason}{' '}
                      <button type="button" onClick={() => retry(r)}>
                        Try again
                      </button>
                    </td>
                    {empty()}
                  </tr>
                )
              }
              // On a department's page money out reads positive; its lines with it.
              const sign = inline && r.side === 'out' ? -1 : 1
              const href = firstMonth && lastMonth ? ledgerHref(r.code, `${firstMonth}-01`, monthEnd(lastMonth)) : null
              return (
                <Fragment key={`${r.key}:lines`}>
                  {/* Newest first, as the months run. */}
                  {[...read.lines].reverse().map((t) => {
                    const doc = t.ref2 ?? (t.ref || null)
                    return (
                      <tr key={t.key} data-kind="line" className="sr-ln" title={hoverOf(t)}>
                        <td className="sr-label sr-ln-label" style={pad}>
                          <span className="sr-ln-date">{t.date}</span>
                          <span className="sr-ln-text">
                            <Said t={t} party="sr-ln-party" sep="sr-ln-sep" text="sr-ln-desc" />
                          </span>
                          {doc ? <span className="sr-ln-ref">{doc}</span> : null}
                        </td>
                        {lineCells(t, sign)}
                      </tr>
                    )
                  })}
                  <tr data-kind="line-foot" className="sr-ln-foot">
                    <td className="sr-label sr-ln-label" style={pad}>
                      <Count n={read.lines.length} href={href} label={firstMonth && lastMonth ? rangeLabel(firstMonth, lastMonth) : ''} />
                    </td>
                    {empty()}
                  </tr>
                </Fragment>
              )
            }
            const r = l.row
            const drills = opens(r)
            const expanded = drills ? isOpen(r) : l.open
            const arrow = !l.toggles ? '' : drills ? (expanded ? '▾' : '▸') : expanded ? '▼' : '▶'
            const label = (
              <>
                <span className="sr-chev" aria-hidden>
                  {arrow}
                </span>
                {r.swatch ? <i className="sr-sw" style={{ background: r.swatch }} aria-hidden /> : null}
                <Highlight text={r.label} query={search} />
              </>
            )
            const mark = `${hits.has(r.key) ? ' is-hit' : ''}${activeKey === r.key ? ' is-active' : ''}${drills ? ' can-open' : ''}${drills && expanded ? ' is-opened' : ''}${sideOf(r)}`
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
                    <button type="button" aria-expanded={expanded} onClick={drills ? undefined : () => setClosed({ level, keys: flip(turned, r.key) })}>
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </td>
                {cells(l.open && !inline ? null : r.values, r)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
