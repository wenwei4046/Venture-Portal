import type { MatrixColumn, MatrixRow } from './monthly-matrix'
import type { PnlAccount } from './pnl-custom'
import type { SheetColumn, SheetRow } from './report-sheet'
import { OTHERS_COLOR, type DeptSide } from './dept-charts'

// A department's statement (2026-10-25, the mockup's rounds 11–12 — the user: "保留 monthly P&L 但是格式像上面 …
// month by month 这样显示", "latest month 要在最左, total 后面, 每月要有 percentage", "account number 能去掉？"): the
// Monthly cash flow / P&L as Reports reads it, dressed as the charts above it. Each block opens on its side's total
// (money in green, money out orange), its categories and accounts under it, money out and expenses as positive; a %
// beside every figure — of that month's money in or out (the net change: of money in), on the P&L of that month's
// revenue — and a dash where there is nothing to be a share of. The figures are the matrix's; only their order,
// sign and dress are the page's. Reports keeps its own table.

type Colors = Record<DeptSide, ReadonlyMap<string, string>>

const nil = (v: number) => Math.abs(v) < 0.005
const live = (values: number[]) => values.some((v) => !nil(v))
// `0 - v`, not `-v`: a nil month stays 0, not -0.
const flipped = (values: number[]) => values.map((v) => 0 - v)

/** Total (the Accumulated) first, then the months latest first, the one still running starred. */
export function deptSheetColumns(columns: MatrixColumn[], nowYM: string): SheetColumn[] {
  return columns.map((c) =>
    c.key === 'acc' ? { key: c.key, label: 'Total', tone: 'acc' as const } : c.key === nowYM ? { key: c.key, label: `${c.label} *`, tone: 'now' as const } : { key: c.key, label: c.label },
  )
}

/** An account row of a block, squared in its chart colour when it is one of the accounts the charts draw. */
function accountRow(r: MatrixRow, depth: number, values: number[], side: DeptSide, base: number[], color: string | undefined): SheetRow {
  const leaf = !r.isParent && !!r.code
  return {
    key: r.key,
    label: r.label,
    ...(r.code ? { code: r.code } : {}),
    kind: 'account',
    depth,
    ...(r.isParent ? { isParent: true } : {}),
    values,
    side,
    pctBase: base,
    ...(leaf ? { swatch: color ?? OTHERS_COLOR } : {}),
  }
}

/** Opening cash; Money in and its sources; Money out and its uses; Net change; Closing cash. */
export function deptCashFlowSheet(rows: MatrixRow[], colors: Colors): SheetRow[] {
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const n = rows[0]?.values.length ?? 0
  const none = new Array<number>(n).fill(0)
  // A side's total: the subtotal that closes it ("in:total").
  const sideTotal = (side: DeptSide) => rows.find((r) => r.kind === 'subtotal' && r.key.startsWith(`${side}:`))?.values ?? none
  const totalIn = sideTotal('in')
  const totalOut = flipped(sideTotal('out'))
  const out: SheetRow[] = []

  const opening = byKey.get('OPENING_CASH')
  if (opening) out.push({ key: opening.key, label: 'Opening cash', kind: 'total', depth: 0, values: opening.values, pctBase: null })

  const block = (side: DeptSide, label: string, total: number[]) => {
    out.push({ key: `title:${side}`, label, kind: 'title', depth: 0, values: total, side, pctBase: total })
    // Inside a layout category its accounts sit one level in (sheetFromMatrix's rule).
    let shift = 0
    for (const r of rows) {
      if (!r.key.startsWith(`${side}:`) || r.kind === 'subtotal') continue
      if (r.kind === 'category') shift = 1
      const values = side === 'out' ? flipped(r.values) : r.values
      if (!live(values)) continue
      const depth = r.kind === 'category' ? 1 : r.depth + shift
      out.push(accountRow(r, depth, values, side, total, r.code ? colors[side].get(r.code) : undefined))
    }
  }
  block('in', 'Money in', totalIn)
  block('out', 'Money out', totalOut)

  const net = byKey.get('NET_CHANGE')
  if (net) out.push({ key: net.key, label: 'Net change', kind: 'total', depth: 0, values: net.values, pctBase: totalIn, strong: true })
  const closing = byKey.get('CLOSING_CASH')
  if (closing) out.push({ key: closing.key, label: 'Closing cash', kind: 'total', depth: 0, values: closing.values, pctBase: null })
  return out
}

const IN_KINDS: ReadonlySet<PnlAccount['defaultCategory']> = new Set(['revenue', 'other_income'])

/** Each layout category a block on the side its accounts are (Revenue, Other Income in; Cost, Expenses out), a
 *  block with nothing in the period left out — and with it a Gross profit that would only repeat the revenue —
 *  then Net profit; every % of that month's revenue (`base`). */
export function deptPnlSheet(rows: MatrixRow[], accounts: PnlAccount[], colors: Colors, base: number[]): SheetRow[] {
  const sideOfCode = new Map(accounts.map((a) => [a.code, IN_KINDS.has(a.defaultCategory) ? ('in' as const) : ('out' as const)]))
  const out: SheetRow[] = []
  let block: MatrixRow[] = []
  // Whether a cost block stands above the Gross profit (without one it is the revenue again).
  let costShown = false
  // Accounts no category closes (the builder always closes them; kept, never lost), each on its own side.
  const loose = () => {
    for (const b of block) {
      const side = (b.code && sideOfCode.get(b.code)) || 'out'
      const values = side === 'out' ? flipped(b.values) : b.values
      if (live(values)) out.push(accountRow(b, b.depth, values, side, base, b.code ? colors[side].get(b.code) : undefined))
    }
    block = []
  }

  for (const r of rows) {
    if (r.kind !== 'subtotal') {
      block.push(r)
      continue
    }
    if (r.key.startsWith('cat:')) {
      const leaves = block.filter((b) => !b.isParent && b.code)
      const ins = leaves.filter((b) => sideOfCode.get(b.code!) === 'in').length
      const side: DeptSide = leaves.length > 0 ? (ins * 2 >= leaves.length ? 'in' : 'out') : /^cat:(revenue|other_income)$/.test(r.key) ? 'in' : 'out'
      const sign = (values: number[]) => (side === 'out' ? flipped(values) : values)
      const total = sign(r.values)
      if (live(total) || block.some((b) => live(b.values))) {
        out.push({ key: `title:${r.key}`, label: r.label, kind: 'title', depth: 0, values: total, side, pctBase: base })
        for (const b of block) {
          const values = sign(b.values)
          if (!live(values)) continue
          out.push(accountRow(b, b.depth, values, side, base, b.code ? colors[sideOfCode.get(b.code) ?? side].get(b.code) : undefined))
        }
        if (side === 'out') costShown = true
      }
      block = []
      continue
    }
    loose()
    if (r.key === 'GROSS_PROFIT') {
      if (costShown) out.push({ key: r.key, label: 'Gross profit', kind: 'total', depth: 0, values: r.values, pctBase: base })
      continue
    }
    if (r.key === 'NET_INCOME') {
      out.push({ key: r.key, label: 'Net profit', kind: 'total', depth: 0, values: r.values, pctBase: base, strong: true })
      continue
    }
    out.push({ key: r.key, label: r.label, kind: 'total', depth: 0, values: r.values, pctBase: base })
  }
  loose()
  return out
}
