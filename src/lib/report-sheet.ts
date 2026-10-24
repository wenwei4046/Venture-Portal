import type { MatrixColumn, MatrixRow } from './monthly-matrix'
import type { ReportBlock } from './gl-report-blocks'
import type { AccountNode, GlTxn } from './gl-reports'

// The reports' table as the user's Claude Design handoff draws it (2026-10-10,
// rptSection in the prototype): each block opens on a blue title, lists its
// groups (an account with accounts under it) and items, and closes on a tinted
// "Total …" row; the net rows follow. An open group shows its figure on a
// Subtotal row under its items instead of on its own line — that part is the
// table's (SheetReport); these only give the rows that shape. Figures, order
// and labels are the reports' own.

export interface SheetTxn {
  key: string
  /** The journal entry's number (empty when it has none) — Ref. 1. */
  ref: string
  date: string
  /** Description · party. */
  text: string
  value: number
  /** 2026-10-24 (the user's drill-down, "我想要这样的概念"): the line's debit and credit, the entry's other side,
   *  the source document's number (Ref. 2). */
  debit: number
  credit: number
  otherSide: string | null
  ref2: string | null
}

/** A row's journal lines as the drill-down lists them. */
export function sheetTxnsOf(rowKey: string, txns: GlTxn[]): SheetTxn[] {
  return txns.map((t, i) => ({
    key: `${rowKey}:t${i}`,
    ref: t.entryNo ?? '',
    date: t.date,
    text: [t.description, t.party].filter(Boolean).join(' · '),
    value: t.amount,
    debit: t.debit,
    credit: t.credit,
    otherSide: t.otherSide,
    ref2: t.refNo,
  }))
}

export interface SheetRow {
  key: string
  label: string
  code?: string
  /** title = a block's heading (no figures) · account = a group (depth 1) or an
   *  item under it (depth 2+) · total = a block's total, or a net row. */
  kind: 'title' | 'account' | 'total'
  depth: number
  isParent?: boolean
  /** One figure per column. */
  values: number[]
  /** Its journal lines, for the single month's drill-down. */
  txns?: SheetTxn[]
  /** A total drawn heavier. */
  strong?: boolean
}

/** A column of the table (SheetReport's): now = the current / chosen month,
 *  acc = the Accumulated. */
export interface SheetColumn {
  key: string
  label: string
  tone?: 'now' | 'acc'
}

/** The month-by-month columns: Accumulated, then the months, this one marked. */
export function sheetColumns(columns: MatrixColumn[], nowKey: string): SheetColumn[] {
  return columns.map((c) => ({
    key: c.key,
    label: c.label,
    ...(c.key === 'acc' ? { tone: 'acc' as const } : c.key === nowKey ? { tone: 'now' as const } : {}),
  }))
}

/** The block a total closes: "流入合计 · Total money in" → "Money in". */
export function sideTitle(totalLabel: string): string | null {
  const english = totalLabel.includes(' · ') ? totalLabel.split(' · ').pop() ?? '' : totalLabel
  const m = /^Total\s+(.+)$/i.exec(english.trim())
  if (!m) return null
  return m[1].charAt(0).toUpperCase() + m[1].slice(1)
}

const title = (key: string, label: string): SheetRow => ({ key: `title:${key}`, label, kind: 'title', depth: 0, values: [] })

/** The month-by-month reports' matrix rows, in the handoff's shape. */
export function sheetFromMatrix(rows: MatrixRow[]): SheetRow[] {
  const out: SheetRow[] = []
  // Where the open block's first row sits (its title goes there), or -1.
  let blockStart = -1
  // Inside a layout category its accounts sit one level in (cash flow).
  let shift = 0
  // A total that heads its own rows (the receivables) closes them at the end.
  let pending: MatrixRow | null = null

  const total = (r: MatrixRow, label = r.label): SheetRow => ({
    key: r.key,
    label,
    kind: 'total',
    depth: 0,
    values: r.values,
  })
  const closePending = () => {
    if (!pending) return
    out.push(total(pending))
    pending = null
    blockStart = -1
    shift = 0
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.kind === 'category') {
      if (blockStart < 0) blockStart = out.length
      shift = 1
      out.push({ key: r.key, label: r.label, code: r.code, kind: 'account', depth: 1, isParent: r.isParent, values: r.values })
      continue
    }
    if (r.kind === 'account') {
      if (blockStart < 0) blockStart = out.length
      out.push({ key: r.key, label: r.label, code: r.code, kind: 'account', depth: r.depth + shift, isParent: r.isParent, values: r.values })
      continue
    }

    // A subtotal.
    if (pending) closePending()
    if (blockStart >= 0) {
      // It closes the rows above it: a P&L category, or a cash-flow side.
      const isCategory = r.key.startsWith('cat:')
      const heading = isCategory ? r.label : sideTitle(r.label)
      if (heading) out.splice(blockStart, 0, title(r.key, heading))
      out.push(total(r, isCategory ? `Total ${r.label}` : r.label))
      blockStart = -1
      shift = 0
      continue
    }
    const next = rows[i + 1]
    // It heads rows of its own when nothing after them closes them — the
    // receivables, but not Gross Profit, whose next rows are Expenses'.
    let j = i + 1
    while (j < rows.length && rows[j].kind !== 'subtotal') j++
    const closer = rows[j]
    const closedLater = !!closer && (closer.key.startsWith('cat:') || sideTitle(closer.label) !== null)
    if (!r.key.startsWith('cat:') && next && next.kind === 'account' && !closedLater) {
      out.push(title(r.key, r.label))
      pending = r
      blockStart = out.length
      continue
    }
    out.push(total(r))
  }
  closePending()
  return out
}

function accountLabel(n: AccountNode): string {
  return n.code && n.code !== '—' ? `${n.code} ${n.name}` : n.name
}

function txnsOf(rowKey: string, n: AccountNode): SheetTxn[] | undefined {
  if (n.children.length > 0 || n.txns.length === 0) return undefined
  return sheetTxnsOf(rowKey, n.txns)
}

/** The single-month statements' blocks (GlReportView's), in the handoff's shape. */
export function sheetFromBlocks(blocks: ReportBlock[], withCompare: boolean): SheetRow[] {
  const out: SheetRow[] = []
  const vals = (current: number, previous: number) => (withCompare ? [current, previous] : [current])

  const pushNode = (sectionKey: string, n: AccountNode, depth: number) => {
    const key = `${sectionKey}:${n.code}`
    const txns = txnsOf(key, n)
    out.push({
      key,
      label: accountLabel(n),
      code: n.code !== '—' ? n.code : undefined,
      kind: 'account',
      depth,
      ...(n.children.length > 0 ? { isParent: true } : {}),
      values: vals(n.current, n.previous),
      ...(txns ? { txns } : {}),
    })
    for (const c of n.children) pushNode(sectionKey, c, depth + 1)
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.kind === 'summary') {
      out.push({
        key: `sum:${i}`,
        label: b.row.label,
        kind: 'total',
        depth: 0,
        values: vals(b.row.current, b.row.previous),
      })
      continue
    }
    const s = b.section
    if (!s.headed) {
      out.push(title(s.key, s.label))
      for (const n of s.nodes) pushNode(s.key, n, 1)
      continue
    }
    // A run of laid-out categories is one block (a cash-flow side): titled once,
    // after the total that closes it; each category is a group.
    const prev = blocks[i - 1]
    if (!(prev && prev.kind === 'section' && prev.section.headed)) {
      const closing = blocks.slice(i).find((x) => x.kind === 'summary')
      const heading = closing && closing.kind === 'summary' ? sideTitle(closing.row.label) : null
      if (heading) out.push(title(s.key, heading))
    }
    const kids = s.root ? s.root.children : s.nodes
    const key = s.root ? `${s.key}:${s.root.code}` : `sect:${s.key}`
    const txns = s.root ? txnsOf(key, s.root) : undefined
    out.push({
      key,
      label: s.label,
      ...(s.root ? { code: s.root.code } : {}),
      kind: 'account',
      depth: 1,
      ...(kids.length > 0 ? { isParent: true } : {}),
      values: vals(s.current, s.previous),
      ...(txns ? { txns } : {}),
    })
    for (const n of kids) pushNode(s.key, n, 2)
  }
  return out
}
