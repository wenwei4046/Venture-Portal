import { r2, sliceMatrixMonths, type MatrixColumn } from './monthly-matrix'
import type { MonthlyCashFlowSides } from './cash-flow-custom'
import type { MonthlyPnlAccounts } from './pnl-custom'

// A department's charts (2026-10-25, the user: "department 那边我要做成像 venture pool 这样用 diagram 和 chart 的 …
// 别只是 in 和 out, 可以在细分一点"; the mockup's twelfth round, "这一版可以了，开始做"): what came in and what went
// out, month by month and account by account. Read off the statement's own matrix (the loaders') and cut to the
// period as the table under them is, so a chart never says what the table does not: each month's figure is that
// month's column, the Total the table's Total.
//
// Money in green, money out orange, always (round 6: "颜色重叠了"); the accounts in palette A, each side's largest in
// its side's colour, the two sides never sharing one (rounds 4–6); past the six largest, grey.

export const IN_COLOR = '#3f7a64'
export const OUT_COLOR = '#e99a53'
export const OTHERS_COLOR = '#cfc8bf'
const PALETTE = {
  in: ['#3f7a64', '#5b7ba6', '#dcae3f', '#8e7dbe', '#7fb7be', '#c08497'],
  out: ['#e99a53', '#2f6e7c', '#9b5c8f', '#86a8d8', '#8a5a3c', '#9aa15a'],
}

export type DeptSide = 'in' | 'out'

/** One account on its side: money out and expenses as positive. */
export interface DeptPiece {
  code: string
  name: string
  /** The period — the statement's Total column. */
  total: number
  /** Each month, oldest first. */
  months: number[]
  color: string
}

export interface DeptChartSide {
  total: number
  /** Each month, oldest first. */
  months: number[]
  /** Every account with a figure, the largest Total first. */
  pieces: DeptPiece[]
}

export interface DeptChartData {
  /** 'YYYY-MM', oldest first. */
  months: string[]
  in: DeptChartSide
  out: DeptChartSide
  /** Net change (Cash Flow) or net profit (P&L): the statement's own net row. */
  net: { total: number; months: number[] }
}

interface Raw {
  code: string
  name: string
  values: number[]
}

const nil = (v: number) => Math.abs(v) < 0.005
// `0 - v`, not `-v`: a nil month stays 0, not -0.
const flipped = (values: number[]) => values.map((v) => 0 - v)
const colSum = (rows: number[][], n: number) => {
  const out = new Array<number>(n).fill(0)
  for (const r of rows) for (let i = 0; i < n; i++) out[i] = r2(out[i] + (r[i] ?? 0))
  return out
}

/** The period's months (oldest first) and a cutter: a line's Total and months, as the statement cuts it. */
function periodOf(columns: MatrixColumn[], from: string) {
  const flow = () => false
  const cut = (values: number[]) => {
    const [total, ...latestFirst] = sliceMatrixMonths(columns, [{ key: 'line', values }], from, { isStart: flow, isEnd: flow }).rows[0].values
    return { total, months: latestFirst.reverse() }
  }
  const months = sliceMatrixMonths(columns, [], from)
    .columns.slice(1)
    .map((c) => c.key)
    .reverse()
  return { months, cut }
}

function sideOf(cut: (values: number[]) => { total: number; months: number[] }, raws: Raw[], totals: number[], side: DeptSide): DeptChartSide {
  const pieces = raws
    .map((a) => ({ code: a.code, name: a.name, ...cut(a.values) }))
    .filter((p) => !nil(p.total) || p.months.some((v) => !nil(v)))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((p, i) => ({ ...p, color: PALETTE[side][i] ?? OTHERS_COLOR }))
  return { ...cut(totals), pieces }
}

/** The Cash Flow's: money in by source, money out by use, the net change. */
export function cashFlowCharts(data: MonthlyCashFlowSides, from: string): DeptChartData {
  const { months, cut } = periodOf(data.columns, from)
  return {
    months,
    in: sideOf(cut, data.inflow, data.inflowTotalByCol, 'in'),
    out: sideOf(cut, data.outflow.map((a) => ({ ...a, values: flipped(a.values) })), flipped(data.outflowTotalByCol), 'out'),
    net: cut(data.netChangeByCol),
  }
}

/** The P&L's: revenue and other income in, cost and expenses out, the net profit (`net`, the statement's row). */
export function pnlCharts(data: MonthlyPnlAccounts, net: number[], from: string): DeptChartData {
  const { months, cut } = periodOf(data.columns, from)
  const n = data.columns.length
  const ins = data.accounts.filter((a) => a.defaultCategory === 'revenue' || a.defaultCategory === 'other_income')
  const outs = data.accounts.filter((a) => a.defaultCategory === 'cost' || a.defaultCategory === 'expense').map((a) => ({ ...a, values: flipped(a.values) }))
  return {
    months,
    in: sideOf(cut, ins, colSum(ins.map((a) => a.values), n), 'in'),
    out: sideOf(cut, outs, colSum(outs.map((a) => a.values), n), 'out'),
    net: cut(net),
  }
}

/** Account code → its colour on the charts, for the statement's squares. */
export function pieceColors(side: DeptChartSide): Map<string, string> {
  return new Map(side.pieces.map((p) => [p.code, p.color]))
}

// ── What the charts draw, month `j` (oldest first) or the period (-1) ──

const valueAt = (p: { total: number; months: number[] }, j: number) => (j < 0 ? p.total : (p.months[j] ?? 0))

export interface DeptSlice {
  code: string
  name: string
  value: number
  color: string
  /** A grey rest's members, each with its figure. */
  members?: Array<{ name: string; value: number }>
}

/** A donut's slices: the five largest of at least 4% in their own colours, the rest one grey "Others" — what
 *  went in or out, so only what moved that way. */
export function donutSlices(side: DeptChartSide, j: number): DeptSlice[] {
  const pos = side.pieces
    .map((p) => ({ code: p.code, name: p.name, value: valueAt(p, j), color: p.color }))
    .filter((d) => d.value >= 0.005)
    .sort((a, b) => b.value - a.value)
  const sum = pos.reduce((s, d) => s + d.value, 0)
  const keep = pos.filter((d, i) => i < 5 && d.value >= sum * 0.04 && d.color !== OTHERS_COLOR)
  const left = pos.filter((d) => !keep.includes(d))
  const rest = r2(left.reduce((s, d) => s + d.value, 0))
  const out: DeptSlice[] = [...keep]
  if (rest >= 0.005) {
    out.push(
      left.length === 1
        ? { ...left[0], color: OTHERS_COLOR }
        : { code: 'others', name: `Others (${left.length})`, value: rest, color: OTHERS_COLOR, members: left.map((d) => ({ name: d.name, value: d.value })) },
    )
  }
  return out
}

export interface DeptRankRow {
  code: string
  name: string
  /** Its figure for the month picked (or the period). */
  value: number
  /** The period's, and each month, oldest first — the row's small bars. */
  total: number
  months: number[]
  color: string
  /** A grey Others' members, each with its figure for the month picked (or the period). */
  members?: Array<{ name: string; value: number }>
}

/** The ranked bars: the largest first by month `j` (or the period), past `keep` one grey Others; `total` is what
 *  the shares are of. */
export function rankRows(side: DeptChartSide, j: number, keep = 6): { rows: DeptRankRow[]; total: number } {
  const live = side.pieces.filter((p) => !nil(valueAt(p, j))).sort((a, b) => valueAt(b, j) - valueAt(a, j))
  const rows: DeptRankRow[] = live
    .slice(0, keep)
    .map((p) => ({ code: p.code, name: p.name, value: valueAt(p, j), total: p.total, months: p.months, color: p.color }))
  const rest = live.slice(keep)
  if (rest.length > 0) {
    rows.push({
      code: 'others',
      name: `Others (${rest.length})`,
      value: r2(rest.reduce((s, p) => s + valueAt(p, j), 0)),
      total: r2(rest.reduce((s, p) => s + p.total, 0)),
      months: colSum(rest.map((p) => p.months), rest[0].months.length),
      color: OTHERS_COLOR,
      members: rest.map((p) => ({ name: p.name, value: valueAt(p, j) })),
    })
  }
  return { rows, total: r2(live.reduce((s, p) => s + valueAt(p, j), 0)) }
}

/** Every account with a figure in month `j` (or the period), largest first — a month's hover box. */
export function sideItems(side: DeptChartSide, j: number): DeptSlice[] {
  return side.pieces
    .map((p) => ({ code: p.code, name: p.name, value: valueAt(p, j), color: p.color }))
    .filter((d) => !nil(d.value))
    .sort((a, b) => b.value - a.value)
}

/** An axis: round steps of 1, 2, 2.5 or 5 × a power of ten from at most `lo` to at least `hi`. */
export function niceScale(lo: number, hi: number, n = 4): { lo: number; hi: number; ticks: number[] } {
  if (hi - lo < 1e-9) hi = lo + 1
  const raw = (hi - lo) / n
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= raw - 1e-9) ?? 10 * pow
  const t0 = Math.floor(lo / step + 1e-9) * step
  const t1 = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let t = t0; t <= t1 + step / 2; t += step) ticks.push(r2(t))
  return { lo: t0, hi: t1, ticks }
}

/** "1.25m", "45.3k", "950" — a chart's figure; the tables keep their cents. */
export function shortMoney(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}m` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : `${Math.round(a)}`
  return (v < 0 && s !== '0' ? '-' : '') + s
}

/** "x% of base" to one place, or '' with nothing to be a share of. */
export function shareOf(v: number, base: number): string {
  if (nil(base)) return ''
  const p = (v / base) * 100
  return `${Math.abs(p) < 0.05 ? '0.0' : p.toFixed(1)}%`
}
