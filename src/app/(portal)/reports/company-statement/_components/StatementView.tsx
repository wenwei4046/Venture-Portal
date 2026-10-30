'use client'

// The Company Statement's counterparties (2026-10-26, six rounds of samples with the user —
// mockups/company-statement-mockup.html): To collect green, To repay red, each with its principal, interest and total
// (only the totals when the room is short), the net worded and coloured, a line between every column ("每个 column
// 之间要有线条"); Sort and Show over it, search, Expand all and the export ticks as before.
//
// A counterparty opens into ONE table for both sides ("可以一个表"): the columns once — Date · Terms · Original ·
// Total interest ‖ Principal due · Interest due · Total due · Left · Payoff; a green To collect row with that side's
// totals under them, its positions newest first ("顺序用 A 日期新到旧"); the red To repay row the same; a Net row.
// A terms change keeps its 差价 under its position (2026-09-21). UI is English-only per user 2026-08-06.

import { Fragment, useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { monthShort } from '@/lib/min-pay'
import type { CounterpartyRow, PositionRow, StatementSide, StatementTotals } from '@/lib/counterparty-statement'
import {
  dayText,
  leftText,
  monthlyReference,
  orderPositions,
  payoffMonth,
  shownCounterparties,
  sideTotals,
  termsText,
  totalDueOf,
  totalInterestOf,
  type CounterpartyShow,
  type CounterpartySort,
} from '@/lib/counterparty-statement-view'
import { TermsChangeSummary, TermsChangeTable } from '@/components/treasury/TermsChangeTable'

const r2 = (n: number) => Math.round(n * 100) / 100
const nil = (n: number) => Math.abs(n) < 0.005
const Dash = () => <span className="cs-dim">—</span>
const money = (n: number) => (nil(n) ? <Dash /> : formatMoneyBare(n))
const signed = (n: number) => (nil(n) ? <Dash /> : `${n > 0 ? '+' : '−'}${formatMoneyBare(Math.abs(n))}`)
const netText = (n: number) => (nil(n) ? 'Even' : `${n > 0 ? 'Collect' : 'Repay'} ${formatMoneyBare(Math.abs(n))}`)
const netTone = (n: number) => (nil(n) ? '' : n > 0 ? 'is-collect' : 'is-repay')
const sideWord = (side: StatementSide) => (side === 'collect' ? 'To collect' : 'To repay')

/** The statement's width, to choose its columns by — a computer's until it is measured (and while it measures 0, hidden). */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => {
      if (el.clientWidth > 0) setWidth(Math.floor(el.clientWidth))
    }
    read()
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}

/** The counterparty table's columns by its room: each side's principal, interest and total; each side's total; the net alone (a phone). */
type Cols = 'wide' | 'totals' | 'net'
const colsOf = (width: number): Cols => (width >= 980 ? 'wide' : width >= 560 ? 'totals' : 'net')
/** An opened counterparty's columns by its room: all; the date under the terms and the payoff under the total due;
 *  on a phone the terms and the total due, the rest on a line under the terms. */
type Fit = 'full' | 'compact' | 'phone'
const fitOf = (width: number): Fit => (width >= 860 ? 'full' : width >= 680 ? 'compact' : 'phone')

// collect side: SC = the loan's 资金来源 remark (from repayment_terms).
// repay side: LENT TO = where the borrowed-in money was lent onward (the fund source's notes — user 2026-08-06).
function Badges({ item }: { item: PositionRow }) {
  return (
    <>
      {item.source ? (
        <span className="cs-bdg" title={item.side === 'collect' ? `Source of capital: ${item.source}` : `Lent to: ${item.source}`}>
          {item.side === 'collect' ? `SC ${item.source}` : `Lent to ${item.source}`}
        </span>
      ) : null}
      {item.termsFrom ? (
        <span
          className="cs-bdg is-alert"
          title={`Terms changed — current terms from ${item.termsFrom}, on RM ${formatMoneyBare(item.termsBase ?? 0)} still owed then${item.termsInterestOnOriginal ? `, interest on the original RM ${formatMoneyBare(item.principal)}` : item.termsInterestKeptOn != null ? `, interest on RM ${formatMoneyBare(item.termsInterestKeptOn)} as before` : ''}`}
        >
          Terms from {item.termsFrom}
        </span>
      ) : null}
      {item.minPayInterest ? (
        <span className="cs-bdg" title="最低还息单 — 本金可以慢慢还，但每月利息一定要还">
          Min interest RM {formatMoneyBare(item.monthlyInterest)}/mo{item.minPayFrom ? ` · from ${monthShort(item.minPayFrom.slice(0, 7))}` : ''}
        </span>
      ) : null}
    </>
  )
}

const hrefOf = (item: PositionRow) => (item.side === 'collect' ? `/fund-out/${item.id}` : `/fund-in/${item.id}`)
/** The payoff in words, where it goes under another figure: "Oct 2026 · 1 of 6 left", or no date. */
const payoffWords = (item: PositionRow) => {
  const month = payoffMonth(item)
  return month ? `${month} · ${leftText(item)} left` : 'No fixed date'
}
/** Interest due: what is still owed; a no-fixed-term deal shows its interest a month instead, in no total. */
function InterestDue({ item }: { item: PositionRow }) {
  if (item.kind !== 'no_term') return money(item.interestOutstanding)
  const perMonth = monthlyReference(item)
  return perMonth ? <span className="cs-permo">{formatMoneyBare(perMonth)}/mo</span> : <Dash />
}

/** An opened counterparty: both sides in one table, each opened by its totals; the net under them. */
function PositionsTable({ g, fit }: { g: CounterpartyRow; fit: Fit }) {
  const collect = orderPositions(g.items.filter((i) => i.side === 'collect'))
  const repay = orderPositions(g.items.filter((i) => i.side === 'repay'))
  const full = fit === 'full'
  const phone = fit === 'phone'
  const columns = full ? 10 : phone ? 3 : 7
  const labelSpan = full ? 2 : 1
  // The whole row opens the deal, as its arrow does (the arrow is the link, for a keyboard or a new tab).
  const open = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('a')) return
    e.currentTarget.querySelector<HTMLAnchorElement>('a.cs-go')?.click()
  }

  const row = (item: PositionRow) => {
    const totalInterest = totalInterestOf(item)
    const perMonth = monthlyReference(item)
    const date = item.startDate ? dayText(item.startDate) : '—'
    const interestWords =
      item.kind === 'no_term' ? (perMonth ? `${formatMoneyBare(perMonth)}/mo` : '—') : nil(item.interestOutstanding) ? '—' : formatMoneyBare(item.interestOutstanding)
    return (
      <Fragment key={item.id}>
        <tr className="cs-pos-row" onClick={open}>
          {full ? <td className="c-date">{date}</td> : null}
          <td className="c-terms">
            <span>{termsText(item)}</span>
            <Badges item={item} />
            {!full ? (
              <div className="c-sub c-day">
                {date}
                {phone ? (
                  <>
                    {' · '}
                    <b>{formatMoneyBare(item.principal)}</b>
                  </>
                ) : null}
              </div>
            ) : null}
            {phone ? (
              <div className="c-sub">
                {totalInterest ? `Total interest ${formatMoneyBare(totalInterest)} · ` : ''}Principal {formatMoneyBare(item.principalOutstanding)} · Interest {interestWords} ·{' '}
                {payoffWords(item)}
              </div>
            ) : null}
          </td>
          {!phone ? (
            <>
              <td className="c-orig">{formatMoneyBare(item.principal)}</td>
              <td className="c-ti">{totalInterest ? formatMoneyBare(totalInterest) : <Dash />}</td>
              <td className="c-p cs-rule">{money(item.principalOutstanding)}</td>
              <td className="c-i">
                <InterestDue item={item} />
              </td>
            </>
          ) : null}
          <td className="c-t">
            {formatMoneyBare(totalDueOf(item))}
            {fit === 'compact' ? <div className="c-sub">{payoffWords(item)}</div> : null}
          </td>
          {full ? (
            <>
              <td className="c-left">{leftText(item) ?? <Dash />}</td>
              <td className="c-pay">{payoffMonth(item) ?? <span className="cs-dim-t">No fixed date</span>}</td>
            </>
          ) : null}
          <td className="c-go">
            <Link href={hrefOf(item)} className="cs-go" aria-label={`Open the ${item.side === 'collect' ? 'loan' : 'fund source'} of ${date}`}>
              →
            </Link>
          </td>
        </tr>
        {/* 差价 of each 从某月起 change (user 2026-09-21: "主要是 company statement 那边") — old plan vs new,
            month by month, with what was already paid. */}
        {(item.termsChanges ?? []).map((c) => (
          <tr key={`${item.id}-terms-${c.fromYM}`} className="cs-terms-row">
            <td colSpan={columns}>
              <details>
                <summary className="cursor-pointer">
                  <TermsChangeSummary c={c} />
                </summary>
                <TermsChangeTable c={c} />
              </details>
            </td>
          </tr>
        ))}
      </Fragment>
    )
  }

  const tail = (
    <>
      {full ? (
        <>
          <td className="c-left" />
          <td className="c-pay" />
        </>
      ) : null}
      <td className="c-go" />
    </>
  )
  const section = (side: StatementSide, items: PositionRow[]) => {
    if (items.length === 0) return null
    const t = sideTotals(items)
    return (
      <Fragment key={side}>
        <tr className={`cs-sec is-${side}`}>
          <td className="c-label" colSpan={labelSpan}>
            {sideWord(side)} · {t.count}
          </td>
          {!phone ? (
            <>
              <td className="c-orig">{formatMoneyBare(t.original)}</td>
              <td className="c-ti">{money(t.totalInterest)}</td>
              <td className="c-p cs-rule">{money(t.principal)}</td>
              <td className="c-i">{money(t.interest)}</td>
            </>
          ) : null}
          <td className="c-t">{formatMoneyBare(t.total)}</td>
          {tail}
        </tr>
        {items.map(row)}
      </Fragment>
    )
  }
  let net = null
  if (collect.length > 0 && repay.length > 0) {
    const c = sideTotals(collect)
    const r = sideTotals(repay)
    const n = { principal: r2(c.principal - r.principal), interest: r2(c.interest - r.interest), total: r2(c.total - r.total) }
    net = (
      <tr className="cs-net">
        <td className="c-label" colSpan={labelSpan}>
          Net · {n.total >= 0 ? 'collect' : 'repay'}
        </td>
        {!phone ? (
          <>
            <td className="c-orig" />
            <td className="c-ti" />
            <td className={`c-p cs-rule ${netTone(n.principal)}`}>{signed(n.principal)}</td>
            <td className={`c-i ${netTone(n.interest)}`}>{signed(n.interest)}</td>
          </>
        ) : null}
        <td className={`c-t ${netTone(n.total)}`}>{signed(n.total)}</td>
        {tail}
      </tr>
    )
  }

  return (
    <div className="cs-pos-wrap">
      <table className={`cs-pos is-${fit}`}>
        <thead>
          <tr>
            {full ? <th className="c-date">Date</th> : null}
            <th className="c-terms">Terms</th>
            {!phone ? (
              <>
                <th className="c-orig">Original</th>
                <th className="c-ti">Total interest</th>
                <th className="c-p cs-rule">Principal due</th>
                <th className="c-i">Interest due</th>
              </>
            ) : null}
            <th className="c-t">Total due</th>
            {full ? (
              <>
                <th className="c-left">Left</th>
                <th className="c-pay">Payoff</th>
              </>
            ) : null}
            <th className="c-go">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {section('collect', collect)}
          {section('repay', repay)}
          {net}
        </tbody>
      </table>
    </div>
  )
}

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <span className="flex items-center gap-2">
      <span className="cs-tool-label">{label}</span>
      <span className="cs-seg" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)}>
            {text}
          </button>
        ))}
      </span>
    </span>
  )
}

export default function StatementView({
  rows,
  totals,
  canExport = false,
}: {
  rows: CounterpartyRow[]
  totals: StatementTotals
  /** Reports · Export (2026-10-16): the ticks pick counterparties to export, so they are for whoever may. */
  canExport?: boolean
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<CounterpartySort>('size')
  const [show, setShow] = useState<CounterpartyShow>('all')
  // Ticked counterparties → export only those (user 2026-08-06).
  const [sel, setSel] = useState<Set<string>>(new Set())
  const frame = useRef<HTMLElement>(null)
  const width = useWidth(frame)

  // The handoff's section head (2026-10-10): the counterparties, how many shown.
  const head = (shownCount: number, filtered: boolean) => (
    <div className="sect-head">
      <h2>Counterparties</h2>
      <span className="rule" aria-hidden />
      <span className="count">
        {shownCount}
        {filtered ? ` / ${rows.length}` : ''} SHOWN
      </span>
    </div>
  )

  if (rows.length === 0) {
    return (
      <section className="mb-6">
        {head(0, false)}
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-ledger text-base">All square — nothing outstanding.</p>
        </div>
      </section>
    )
  }

  const needle = q.trim()
  const filtered = !!needle || show !== 'all'
  const shown = shownCounterparties(rows, { needle, show, sort })
  // A filtered view sums what's on screen so the total always ties to the rows above it; unfiltered it is the server's.
  const shownTotals: StatementTotals = filtered
    ? shown.reduce(
        (acc, g) => ({
          collectPrincipal: r2(acc.collectPrincipal + g.collectPrincipal),
          collectInterest: r2(acc.collectInterest + g.collectInterest),
          repayPrincipal: r2(acc.repayPrincipal + g.repayPrincipal),
          repayInterest: r2(acc.repayInterest + g.repayInterest),
          net: r2(acc.net + g.net),
        }),
        { collectPrincipal: 0, collectInterest: 0, repayPrincipal: 0, repayInterest: 0, net: 0 },
      )
    : totals
  const allOpen = shown.length > 0 && shown.every((g) => open[g.counterparty])
  const cols = colsOf(width)
  const fit = fitOf(width - 44)
  const span = cols === 'wide' ? 8 : cols === 'totals' ? 4 : 2
  const figures = (o: { collectPrincipal: number; collectInterest: number; repayPrincipal: number; repayInterest: number }) => {
    const c = r2(o.collectPrincipal + o.collectInterest)
    const r = r2(o.repayPrincipal + o.repayInterest)
    if (cols === 'net') return null
    if (cols === 'totals') {
      return (
        <>
          <td className="c-tot is-collect cs-rule">{money(c)}</td>
          <td className="c-tot is-repay cs-rule">{money(r)}</td>
        </>
      )
    }
    return (
      <>
        <td className="cs-rule">{money(o.collectPrincipal)}</td>
        <td>{money(o.collectInterest)}</td>
        <td className="c-tot is-collect">{money(c)}</td>
        <td className="cs-rule">{money(o.repayPrincipal)}</td>
        <td>{money(o.repayInterest)}</td>
        <td className="c-tot is-repay">{money(r)}</td>
      </>
    )
  }

  return (
    <section className="mb-6" ref={frame}>
      {head(shown.length, filtered)}
      {/* ── Search, Sort, Show, expand-all, the export ticks ── */}
      <div className="cs-tools">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search counterparty…"
          className="bg-paper border border-hairline rounded-md px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border w-56"
        />
        <Seg label="Sort" value={sort} onPick={setSort} options={[['size', 'Largest'], ['net', 'Net'], ['collect', 'To collect'], ['repay', 'To repay'], ['name', 'A–Z']]} />
        <Seg label="Show" value={show} onPick={setShow} options={[['all', 'All'], ['collect', 'To collect'], ['repay', 'To repay']]} />
        <span className="flex-1" />
        {canExport && sel.size > 0 ? (
          <span className="flex items-center gap-2 text-xs font-sans text-graphite border border-accent/40 bg-surface rounded-md px-3 py-1.5">
            {sel.size} selected · Export:
            <a
              href={`/reports/company-statement/export?format=xlsx&cp=${encodeURIComponent([...sel].join(','))}`}
              className="text-accent hover:text-accent-hover font-mono"
            >
              Excel
            </a>
            <a
              href={`/reports/company-statement/export?format=pdf&cp=${encodeURIComponent([...sel].join(','))}`}
              className="text-accent hover:text-accent-hover font-mono"
            >
              PDF
            </a>
            <button type="button" onClick={() => setSel(new Set())} className="text-muted hover:text-ink transition-colors">
              Clear
            </button>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(allOpen ? {} : Object.fromEntries(shown.map((g) => [g.counterparty, true])))}
          className="text-xs font-sans text-graphite hover:text-ink border border-hairline rounded-md px-3 py-1.5 bg-surface hover:bg-surface-2 transition-colors"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="cs-scroll">
        <table className={`cs-sheet is-${cols}`}>
          <thead>
            {cols === 'wide' ? (
              <>
                <tr>
                  <th className="c-name" rowSpan={2}>
                    Counterparty
                  </th>
                  <th className="cs-collect cs-rule" colSpan={3}>
                    To collect
                  </th>
                  <th className="cs-repay cs-rule" colSpan={3}>
                    To repay
                  </th>
                  <th className="c-net cs-rule" rowSpan={2}>
                    Net
                  </th>
                </tr>
                <tr>
                  <th className="cs-collect-sub cs-rule">Principal</th>
                  <th className="cs-collect-sub">Interest</th>
                  <th className="cs-collect-sub">Total</th>
                  <th className="cs-repay-sub cs-rule">Principal</th>
                  <th className="cs-repay-sub">Interest</th>
                  <th className="cs-repay-sub">Total</th>
                </tr>
              </>
            ) : (
              <tr>
                <th className="c-name">Counterparty</th>
                {cols === 'totals' ? (
                  <>
                    <th className="cs-collect cs-rule">To collect</th>
                    <th className="cs-repay cs-rule">To repay</th>
                  </>
                ) : null}
                <th className="c-net cs-rule">Net</th>
              </tr>
            )}
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={span} className="cs-empty">
                  {needle ? <>No counterparty matches &ldquo;{needle}&rdquo;</> : <>No counterparty has anything {show === 'collect' ? 'to collect' : 'to repay'}</>}
                </td>
              </tr>
            ) : null}
            {shown.map((g) => {
              const isOpen = !!open[g.counterparty]
              const nCollect = g.items.filter((i) => i.side === 'collect').length
              const nRepay = g.items.length - nCollect
              return (
                <Fragment key={g.counterparty}>
                  <tr className={`cs-cp${isOpen ? ' is-open' : ''}`} onClick={() => setOpen((prev) => ({ ...prev, [g.counterparty]: !isOpen }))}>
                    <td className="c-name">
                      {canExport ? (
                        <span onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={sel.has(g.counterparty)}
                            onChange={() =>
                              setSel((prev) => {
                                const next = new Set(prev)
                                if (next.has(g.counterparty)) next.delete(g.counterparty)
                                else next.add(g.counterparty)
                                return next
                              })
                            }
                            title="Tick to export only selected counterparties"
                            className="h-3.5 w-3.5 accent-[var(--accent)] align-middle"
                          />
                        </span>
                      ) : null}
                      <span className="cs-tg">{isOpen ? '▾' : '▸'}</span>
                      <span className="font-semibold text-ink">{g.counterparty}</span>
                      <span className="cs-cnt">{[nCollect ? `${nCollect} to collect` : '', nRepay ? `${nRepay} to repay` : ''].filter(Boolean).join(' · ')}</span>
                    </td>
                    {figures(g)}
                    <td className={`c-net cs-rule ${netTone(g.net)}`}>{netText(g.net)}</td>
                  </tr>
                  {isOpen ? (
                    <tr className="cs-detail">
                      <td colSpan={span}>
                        <PositionsTable g={g} fit={fit} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
            <tr className="cs-total">
              <td className="c-name">{filtered ? `Total · ${shown.length} shown` : 'Total'}</td>
              {figures(shownTotals)}
              <td className={`c-net cs-rule ${netTone(shownTotals.net)}`}>{netText(shownTotals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
