'use client'

import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { rangeLabel } from '@/lib/report-range'
import {
  IN_COLOR,
  OTHERS_COLOR,
  OUT_COLOR,
  donutSlices,
  niceScale,
  rankRows,
  shareOf,
  shortMoney,
  sideItems,
  type DeptChartData,
  type DeptChartSide,
  type DeptRankRow,
  type DeptSide,
  type DeptSlice,
} from '@/lib/dept-charts'

/**
 * A department's charts (2026-10-25, the user: "department 那边我要做成像 venture pool 这样用 diagram 和 chart 的 …
 * 别只是 in 和 out, 可以在细分一点", after their Hookka ERP sample; the mockup's twelfth round, "这一版可以了，开始做").
 *
 * In vs Out: on the left a Month — Total (the period, first and picked) or one month — and its two donuts, what came
 * in and what went out by account, the five largest of at least 4% in their colours and the rest one grey Others;
 * on the right each month's money in (green) and out (orange) with the net as a line, a bar's month picked by a
 * click. Under them two ranked cards side by side, in left and out right, for the Month picked: the six largest,
 * the rest in Others, a bar each in its side's colour, its share and its months. Pointing at anything lists what it
 * holds — every source and use, with amount and share — in a box beside it, never over the bar pointed at (round 8).
 * The figures are lib/dept-charts' — the statement's own, cut as the table is.
 */

export type DeptView = 'cash-flow' | 'pnl'

const WORDS = {
  'cash-flow': {
    in: 'Money in',
    out: 'Money out',
    net: 'Net change',
    pair: 'In vs Out',
    pairSub: 'Money in and out, month by month',
    every: 'source and use',
    pieces: 'Where the money came from and went',
    inSub: 'Money in · by source',
    outSub: 'Money out · by use',
    inCol: 'Source',
    outCol: 'Use',
  },
  pnl: {
    in: 'Income',
    out: 'Expenses',
    net: 'Net profit',
    pair: 'Income vs Expenses',
    pairSub: 'Income and expenses, month by month',
    every: 'income and expense',
    pieces: 'What came in and what was spent',
    inSub: 'Income · by type',
    outSub: 'Expenses · by type',
    inCol: 'Income',
    outCol: 'Expense',
  },
} as const
type Words = (typeof WORDS)[DeptView]

const nil = (v: number) => Math.abs(v) < 0.005
const sideColor = (side: DeptSide) => (side === 'in' ? IN_COLOR : OUT_COLOR)
/** "Oct *" / "Oct 2026 *": the month still running starred. */
const monthShort = (ym: string, running: string | null) => dayjs(`${ym}-01`).format('MMM') + (ym === running ? ' *' : '')
const monthLong = (ym: string, running: string | null) => dayjs(`${ym}-01`).format('MMM YYYY') + (ym === running ? ' *' : '')
const tick = (v: number) => (nil(v) ? '0' : shortMoney(v).replace(/\.0k$/, 'k'))
const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`

// ── The hover box ──

interface TipItem {
  name: string
  value: number
  color?: string
}
interface TipSection {
  head: string
  total: number
  /** Its share, beside its total. */
  share?: string
  side?: DeptSide
  /** What it holds (each with its share of `base`, else of `total`); none listed for a lone piece. */
  items?: TipItem[]
  base?: number
  /** Said when `items` is empty. */
  empty?: string
}
interface Tip {
  title: string
  sections: TipSection[]
  net?: { name: string; value: number }
}
/** Beside a month's column, or by the pointer. */
type Anchor = { beside: DOMRect } | { x: number; y: number }
interface TipApi {
  show: (tip: Tip, at: Anchor) => void
  hide: () => void
}

/** A section lists this many at most; the table under the charts has the rest. */
const MOST = 14

function TipBox({ ref }: { ref: Ref<TipApi> }) {
  const [shown, setShown] = useState<{ tip: Tip; at: Anchor } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({ show: (tip, at) => setShown({ tip, at }), hide: () => setShown(null) }), [])
  useLayoutEffect(() => {
    const el = box.current
    if (!shown || !el) return
    const { width: w, height: h } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x: number
    let y: number
    if ('beside' in shown.at) {
      const a = shown.at.beside
      x = a.right + 10
      if (x + w > vw - 8) x = a.left - w - 10
      y = Math.min(a.top + 6, vh - h - 8)
    } else {
      x = shown.at.x + 18
      y = shown.at.y + 18
      if (x + w > vw - 8) x = shown.at.x - w - 18
      if (y + h > vh - 8) y = shown.at.y - h - 18
    }
    setPos({ left: Math.max(8, x), top: Math.max(8, y) })
  }, [shown])
  if (!shown) return null
  // On the page's body, clear of any box that clips or moves (it brings the sheet's palette along).
  return createPortal(
    <div className="sheet-theme contents">
      <div ref={box} className="dept-tip" role="tooltip" style={pos ?? { left: -9999, top: 0 }}>
        <TipBody tip={shown.tip} />
      </div>
    </div>,
    document.body,
  )
}

function TipBody({ tip }: { tip: Tip }) {
  return (
    <>
      <h6>
        {tip.title}
        <span>RM · share</span>
      </h6>
      <table>
        <tbody>
          {tip.sections.map((s, k) => {
            const base = s.base ?? s.total
            const more = (s.items?.length ?? 0) - MOST
            return (
              <Fragment key={k}>
                <tr className={`is-sec${s.side ? ` is-${s.side}` : ''}`}>
                  <td>{s.head}</td>
                  <td className="n">{formatMoneyBare(s.total)}</td>
                  <td className="p">{s.share ?? ''}</td>
                </tr>
                {s.items && s.items.length === 0 ? (
                  <tr>
                    <td className="dim">{s.empty ?? 'Nothing'}</td>
                    <td />
                    <td />
                  </tr>
                ) : null}
                {s.items?.slice(0, MOST).map((i, n) => (
                  <tr key={n}>
                    <td>
                      <i className="dept-sw" style={{ background: i.color ?? OTHERS_COLOR }} />
                      {i.name}
                    </td>
                    <td className="n">{formatMoneyBare(i.value)}</td>
                    <td className="p">{shareOf(i.value, base)}</td>
                  </tr>
                ))}
                {more > 0 ? (
                  <tr>
                    <td className="dim">+ {more} more in the table below</td>
                    <td />
                    <td />
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
          {tip.net ? (
            <tr className="is-net">
              <td>— {tip.net.name}</td>
              <td className={`n${tip.net.value < 0 ? ' is-neg' : ''}`}>{formatMoneyBare(tip.net.value)}</td>
              <td />
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  )
}

/** The box's handlers for a piece pointed at: it follows the pointer. */
const follow = (tip: RefObject<TipApi | null>, make: () => Tip) => ({
  onMouseMove: (e: { clientX: number; clientY: number }) => tip.current?.show(make(), { x: e.clientX, y: e.clientY }),
  onMouseLeave: () => tip.current?.hide(),
})

/** The width a chart has, to draw at (its text stays its size); `fallback` until it is measured. */
function useWidth(ref: RefObject<HTMLElement | null>, fallback: number) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => setWidth(Math.max(260, Math.floor(el.clientWidth)))
    read()
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}

// ── In vs Out, the months: paired bars and the net line ──

/** A line through the points, eased between them. */
function smooth(p: ReadonlyArray<readonly [number, number]>): string {
  if (p.length === 0) return ''
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
  }
  return d
}

function PairChart({ data, running, sel, onPick, tip, words }: {
  data: DeptChartData
  running: string | null
  sel: number
  onPick: (j: number) => void
  tip: RefObject<TipApi | null>
  words: Words
}) {
  const host = useRef<HTMLDivElement>(null)
  const W = useWidth(host, 640)
  const H = 236
  const pad = { l: 50, r: 10, t: 12, b: 32 }
  const inV = data.in.months
  const outV = data.out.months
  const net = data.net.months
  const sc = niceScale(Math.min(0, ...net, ...inV, ...outV), Math.max(1, ...inV, ...outV, ...net))
  const ph = H - pad.t - pad.b
  const band = Math.max(1, W - pad.l - pad.r) / Math.max(1, data.months.length)
  const y = (v: number) => pad.t + ((sc.hi - v) / (sc.hi - sc.lo)) * ph
  const bw = Math.max(5, Math.min(26, band * 0.27))
  // Narrow: every second (or third) month named, counting back from the last; the picked one always.
  const every = band < 30 ? 3 : band < 44 ? 2 : 1
  const bar = (v: number, x: number, color: string) => {
    if (nil(v)) return null
    const y0 = y(0)
    const y1 = y(v)
    return <rect x={x} y={Math.min(y0, y1)} width={bw} height={Math.max(1, Math.abs(y1 - y0))} rx={3} fill={color} />
  }
  const centre = (j: number) => pad.l + band * (j + 0.5)
  const points = data.months.map((_, j) => [centre(j), y(net[j] ?? 0)] as const)
  const monthTip = (j: number): Tip => ({
    title: monthLong(data.months[j], running),
    sections: [
      { head: words.in, total: inV[j] ?? 0, side: 'in', items: sideItems(data.in, j), empty: 'Nothing this month' },
      { head: words.out, total: outV[j] ?? 0, side: 'out', items: sideItems(data.out, j), empty: 'Nothing this month' },
    ],
    net: { name: words.net, value: net[j] ?? 0 },
  })

  return (
    <div className="dept-host" ref={host}>
      <svg className="dept-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${words.pairSub}, ${months(data.months.length)}`}>
        {sc.ticks.map((t) => (
          <g key={`t${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={nil(t) ? 'zero' : 'grid'} />
            <text x={pad.l - 8} y={y(t) + 3.5} className="yt">
              {tick(t)}
            </text>
          </g>
        ))}
        {data.months.map((m, j) => {
          const named = (data.months.length - 1 - j) % every === 0 || j === sel
          return (
            <g key={`x${m}`}>
              {named ? (
                <text x={centre(j)} y={H - pad.b + 16} className={`xt${j === sel ? ' sel' : ''}`}>
                  {band >= 74 ? monthLong(m, running) : monthShort(m, running)}
                </text>
              ) : null}
              {j === sel ? <rect x={centre(j) - 16} y={H - pad.b + 21} width={32} height={2.5} rx={1.25} className="selbar" /> : null}
            </g>
          )
        })}
        {data.months.map((m, j) => (
          <g
            key={m}
            className="mcol"
            data-month={m}
            onMouseEnter={(e) => {
              const zone = e.currentTarget.querySelector('.hz')
              if (zone) tip.current?.show(monthTip(j), { beside: zone.getBoundingClientRect() })
            }}
            onMouseLeave={() => tip.current?.hide()}
            onClick={() => onPick(j)}
          >
            {bar(inV[j] ?? 0, centre(j) - bw - 1.5, IN_COLOR)}
            {bar(outV[j] ?? 0, centre(j) + 1.5, OUT_COLOR)}
            <rect className="hz" x={pad.l + band * j} y={0} width={band} height={H} />
          </g>
        ))}
        <path d={smooth(points)} className="nline" />
        {points.map(([x, py], j) => (
          <circle key={`n${j}`} cx={x} cy={py} r={3} className="ndot" />
        ))}
      </svg>
    </div>
  )
}

// ── In vs Out, the Month: two donuts ──

function arcPath(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4
  const large = a1 - a0 > Math.PI ? 1 : 0
  const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`
  return `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`
}

function Donut({ slices, word, side, tipOf, tip }: {
  slices: DeptSlice[]
  word: string
  side: DeptSide
  tipOf: (s: DeptSlice) => Tip
  tip: RefObject<TipApi | null>
}) {
  const S = 128
  const R = 60
  const r = 39
  const c = S / 2
  const T = slices.reduce((s, i) => s + i.value, 0)
  let a0 = -Math.PI / 2
  return (
    <svg className="dept-donut" viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label={`${word} ${shortMoney(T)}`}>
      {slices.length === 0 ? (
        <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke="#eceae5" strokeWidth={R - r} />
      ) : (
        slices.map((s) => {
          const a1 = a0 + (s.value / T) * Math.PI * 2
          const d = arcPath(c, c, R, r, a0, a1)
          a0 = a1
          return <path key={s.code} d={d} fill={s.color} stroke="#fff" strokeWidth={1} {...follow(tip, () => tipOf(s))} />
        })
      )}
      <text x={c} y={c - 3} className="dl">
        {word}
      </text>
      <text x={c} y={c + 12} className={`dv is-${side}`}>
        {shortMoney(T)}
      </text>
    </svg>
  )
}

function MonthPanel({ data, running, sel, onPick, tip, words }: {
  data: DeptChartData
  running: string | null
  sel: number
  onPick: (j: number) => void
  tip: RefObject<TipApi | null>
  words: Words
}) {
  const total = sel < 0
  const first = data.months[0]
  const last = data.months[data.months.length - 1]
  const title = total ? `${rangeLabel(first, last)} · Total` : monthLong(data.months[sel], running)
  const at = (s: { total: number; months: number[] }) => (total ? s.total : (s.months[sel] ?? 0))
  const netV = at(data.net)
  const columns: Array<{ side: DeptSide; word: string; of: DeptChartSide }> = [
    { side: 'in', word: words.in, of: data.in },
    { side: 'out', word: words.out, of: data.out },
  ]
  // A piece's box: the piece and its share of its side, and what a grey rest holds.
  const sliceTip = (side: DeptSide, word: string, sideTotal: number) => (s: DeptSlice): Tip => ({
    title: `${title} · ${word}`,
    sections: [{ head: s.name, total: s.value, share: shareOf(s.value, sideTotal), side, items: s.members, base: sideTotal }],
  })

  return (
    <div className="dept-panel">
      <div className="dept-mpicker" role="group" aria-label="Month">
        <span className="dept-chl">Month</span>
        <button type="button" className="dept-mpick is-total" aria-pressed={total} onClick={() => onPick(-1)}>
          Total
        </button>
        {data.months.map((m, j) => (
          <button key={m} type="button" className="dept-mpick" aria-pressed={sel === j} onClick={() => onPick(j)}>
            {monthShort(m, running)}
          </button>
        ))}
      </div>
      <h4>{title}</h4>
      <div className="dept-donuts">
        {columns.map(({ side, word, of }) => {
          const slices = donutSlices(of, sel)
          const tipOf = sliceTip(side, word, at(of))
          return (
            <div key={side} className="dept-dcol">
              <h5 className={`is-${side}`}>{word}</h5>
              <Donut slices={slices} word={word} side={side} tipOf={tipOf} tip={tip} />
              <ul className="dept-legend" aria-label={word}>
                {slices.length === 0 ? (
                  <li>
                    <span />
                    <span>{total ? 'Nothing in this period' : 'Nothing this month'}</span>
                    <b />
                  </li>
                ) : (
                  slices.map((s) => (
                    <li key={s.code} {...follow(tip, () => tipOf(s))}>
                      <span className="dept-sw" style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <b>{shortMoney(s.value)}</b>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )
        })}
      </div>
      <div className="dept-figs">
        <div>
          <small>{words.in}</small>
          <b className="is-in">{formatMoneyBare(at(data.in))}</b>
        </div>
        <div>
          <small>{words.out}</small>
          <b className="is-out">{formatMoneyBare(at(data.out))}</b>
        </div>
        <div>
          <small>{words.net}</small>
          <b className={netV < 0 ? 'is-neg' : 'is-pos'}>{formatMoneyBare(netV)}</b>
        </div>
      </div>
    </div>
  )
}

// ── Where it came from and went: the ranked cards ──

/** A piece's months as small bars, the picked one darker (all alike for the Total). */
function Spark({ values, sel, color }: { values: number[]; sel: number; color: string }) {
  const W = 96
  const H = 24
  const n = Math.max(1, values.length)
  const gap = n > 6 ? 1.5 : 3
  const w = (W - gap * (n - 1)) / n
  const max = Math.max(...values.map((x) => Math.max(0, x)), 1e-9)
  return (
    <svg className="dept-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      {values.map((x, k) => {
        const h = x > 0 ? Math.max(1.5, (x / max) * (H - 2)) : 0
        return <rect key={k} x={k * (w + gap)} y={H - h} width={w} height={h} rx={1.5} fill={color} opacity={sel < 0 ? 0.85 : k === sel ? 1 : 0.32} />
      })}
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#e3ddd3" />
    </svg>
  )
}

function RankCard({ side, data, running, sel, tip, words }: {
  side: DeptSide
  data: DeptChartData
  running: string | null
  sel: number
  tip: RefObject<TipApi | null>
  words: Words
}) {
  const { rows, total } = rankRows(side === 'in' ? data.in : data.out, sel, 6)
  const max = Math.max(...rows.map((r) => Math.max(0, r.value)), 1e-9)
  const first = data.months[0]
  const last = data.months[data.months.length - 1]
  const when = sel < 0 ? 'Total' : monthLong(data.months[sel], running)
  // A row's box: each of its months, and what an Others holds.
  const rowTip = (r: DeptRankRow): Tip => ({
    title: r.name,
    sections: [
      {
        head: months(data.months.length),
        total: r.total,
        side,
        items: data.months.map((m, k) => ({ name: monthLong(m, running), value: r.months[k] ?? 0, color: sideColor(side) })).filter((i) => !nil(i.value)),
        empty: 'Nothing in this period',
      },
      ...(r.members ? [{ head: `In Others · ${when}`, total: r.value, items: r.members.map((m) => ({ ...m, color: OTHERS_COLOR })) }] : []),
    ],
  })
  return (
    <div className={`dept-card is-${side}`} role="group" aria-label={side === 'in' ? words.inSub : words.outSub}>
      <div className="dept-card-title">
        <h4>{side === 'in' ? words.inSub : words.outSub}</h4>
        <span>RM · {when} · largest first</span>
      </div>
      <div className="dept-rank">
        <div className="dept-rank-row is-head" aria-hidden>
          <span>{side === 'in' ? words.inCol : words.outCol}</span>
          <span />
          <span>RM</span>
          <span>Share</span>
          <span>{first === last ? monthShort(first, null) : `${monthShort(first, null)}–${monthShort(last, null)}`}</span>
        </div>
        {rows.length === 0 ? <div className="dept-rank-empty">{sel < 0 ? 'Nothing in this period.' : 'Nothing this month.'}</div> : null}
        {rows.map((r) => (
          <div key={r.code} className="dept-rank-row" {...follow(tip, () => rowTip(r))}>
            <span className="dept-rank-name">
              <i className="dept-sw" style={{ background: r.color }} />
              <span className="dept-rank-text">{r.name}</span>
            </span>
            <span className="dept-rank-bar">
              <i style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
            </span>
            <span className={`dept-rank-amt${r.value < 0 ? ' is-neg' : ''}`}>{formatMoneyBare(r.value)}</span>
            <span className="dept-rank-share">{shareOf(r.value, total)}</span>
            <span className="dept-rank-spark">
              <Spark values={r.months} sel={sel} color={sideColor(side)} />
            </span>
          </div>
        ))}
        <div className="dept-rank-row is-foot">
          <span>Total</span>
          <span />
          <span>{formatMoneyBare(total)}</span>
          <span>{nil(total) ? '—' : '100%'}</span>
          <span />
        </div>
      </div>
    </div>
  )
}

export default function DeptCharts({ view, data, running }: {
  view: DeptView
  data: DeptChartData
  /** The month still running ('YYYY-MM'), starred where it shows; null when the period has ended. */
  running: string | null
}) {
  const words = WORDS[view]
  const [picked, setPicked] = useState(-1)
  // A shorter period (a new From) may have lost the month picked: back to the Total.
  const sel = picked < data.months.length ? picked : -1
  const tip = useRef<TipApi>(null)
  const pick = (j: number) => {
    tip.current?.hide()
    setPicked(j)
  }
  const n = data.months.length
  if (n === 0) return null
  const first = data.months[0]
  const last = data.months[n - 1]

  return (
    <>
      <section className="dept-charts" aria-label={words.pair}>
        <div className="sect-head">
          <h2>{words.pair}</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {sel < 0 ? 'TOTAL' : monthLong(data.months[sel], running).toUpperCase()} · {months(n).toUpperCase()}
          </span>
        </div>
        <div className="dept-duo">
          <MonthPanel data={data} running={running} sel={sel} onPick={pick} tip={tip} words={words} />
          <div className="dept-panel">
            <h4>{words.pairSub}</h4>
            <div className="dept-psub">RM · point at a month for every {words.every} · click it to look at it on the left</div>
            <PairChart data={data} running={running} sel={sel} onPick={pick} tip={tip} words={words} />
            <div className="dept-keys">
              <span>
                <i className="dept-sw" style={{ background: IN_COLOR }} />
                {words.in}
              </span>
              <span>
                <i className="dept-sw" style={{ background: OUT_COLOR }} />
                {words.out}
              </span>
              <span>
                <i className="dept-ln" />
                {words.net}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="dept-pieces" aria-label={words.pieces}>
        <div className="sect-head">
          <h2>{words.pieces}</h2>
          <span className="rule" aria-hidden />
          <span className="count">{(sel < 0 ? `${rangeLabel(first, last)} · Total` : monthLong(data.months[sel], running)).toUpperCase()}</span>
        </div>
        <div className="dept-pair-cards">
          <RankCard side="in" data={data} running={running} sel={sel} tip={tip} words={words} />
          <RankCard side="out" data={data} running={running} sel={sel} tip={tip} words={words} />
        </div>
      </section>
      <TipBox ref={tip} />
    </>
  )
}
