// Shared building blocks for the month-matrix reports (Monthly P&L / Cash Flow):
// the row/column types the view renders, plus helpers to lay out the columns
// (Accumulated + each month, latest-first) and flatten a report section's tree.

import dayjs from 'dayjs'
import type { ReportSection, AccountNode } from './gl-reports'

export interface MatrixColumn {
  key: string // 'acc' | 'YYYY-MM'
  label: string // 'Accumulated' | 'Jan 2026'
}

export interface MatrixRow {
  key: string // account code, or subtotal id
  label: string
  /** Account code, when this row is one. `key` is prefixed on some reports to
   *  stay unique across sections, so search needs the bare code separately. */
  code?: string
  depth: number // indent level (0 = top)
  /** 'category' = a layout section's own row: carries the section totals, sits
   *  ABOVE its accounts and collapses them like a parent (Cash Flow, 2026-09-18). */
  kind: 'account' | 'subtotal' | 'category'
  /** true when this account (or category) rolls up rows beneath it. */
  isParent?: boolean
  tone?: 'ledger' | 'danger' | 'auto'
  /** Headline total (side totals, net change, opening/closing, net income) —
   *  rendered with the accent wash the GL statements use for the same rows, so
   *  a matrix and its statement read alike (user 2026-07-30). */
  emphasis?: 'strong'
  /** display values aligned to columns. */
  values: number[]
}

export interface MonthlyMatrixData {
  columns: MatrixColumn[]
  rows: MatrixRow[]
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// An empty range so the report engines' unused `previous` bucket is always 0.
export const EMPTY_PERIOD = { from: '2099-12-31', to: '2099-01-01' }

/** Columns = Accumulated + each month of the year up to `throughMonth`,
 *  latest month first (next to Accumulated). */
export function monthColumns(
  year: number,
  throughMonth: number,
): { months: string[]; columns: MatrixColumn[]; accPeriod: { from: string; to: string } } {
  const tm = Math.min(12, Math.max(1, throughMonth))
  const months: string[] = []
  for (let m = tm; m >= 1; m--) months.push(`${year}-${String(m).padStart(2, '0')}`)
  const accPeriod = {
    from: `${year}-01-01`,
    to: dayjs(`${year}-${String(tm).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD'),
  }
  const columns: MatrixColumn[] = [
    { key: 'acc', label: 'Accumulated' },
    ...months.map((ym) => ({ key: ym, label: dayjs(`${ym}-01`).format('MMM YYYY') })),
  ]
  return { months, columns, accPeriod }
}

/** account_code → its `current` value, walking the whole node tree. */
export function collectNodeValues(section: ReportSection, out: Map<string, number>): void {
  const walk = (n: AccountNode) => {
    out.set(n.code, n.current)
    n.children.forEach(walk)
  }
  section.nodes.forEach(walk)
}

/** A leaf account plus its COA ancestor chain (top parent → down, excluding the
 *  leaf itself). Used to re-nest a flat account list back into its hierarchy. */
export interface HierAccount {
  code: string
  name: string
  values: number[]
  ancestry: { code: string; name: string }[]
}

/** Render a flat list of leaf accounts as their COA parent→child hierarchy:
 *  every parent that has ≥1 child present becomes a bold roll-up row (sum of its
 *  descendants), with children indented beneath it. `baseDepth` is the indent
 *  of the top level; children go deeper.
 *
 *  Order within a level: the layout's own order first, then A→Z by name for
 *  whatever the layout does not list (user 2026-09-28 — the P&L put "Discount
 *  Allowed" at the top of Revenue because D sorts before S, and dragging it in
 *  Edit layout did nothing since this sorted by name regardless). `order` is
 *  the category's account codes as the layout holds them; a parent takes the
 *  best rank of anything beneath it, so pinning one child lifts its group. */
export function buildHierarchyRows(
  accounts: HierAccount[],
  keyPrefix: string,
  baseDepth: number,
  order?: string[],
): MatrixRow[] {
  if (accounts.length === 0) return []
  const n = accounts[0].values.length

  interface Node {
    code: string
    name: string
    leaf?: HierAccount
    children: Map<string, Node>
  }
  const roots = new Map<string, Node>()
  const child = (level: Map<string, Node>, code: string, name: string): Node => {
    let node = level.get(code)
    if (!node) {
      node = { code, name, children: new Map() }
      level.set(code, node)
    }
    return node
  }

  for (const a of accounts) {
    let level = roots
    for (const anc of a.ancestry) level = child(level, anc.code, anc.name).children
    child(level, a.code, a.name).leaf = a
  }

  const sum = (node: Node): number[] => {
    const out = new Array(n).fill(0)
    if (node.leaf) for (let i = 0; i < n; i++) out[i] = r2(out[i] + (node.leaf.values[i] ?? 0))
    for (const c of node.children.values()) {
      const v = sum(c)
      for (let i = 0; i < n; i++) out[i] = r2(out[i] + (v[i] ?? 0))
    }
    return out
  }

  const rankOf = new Map((order ?? []).map((code, i) => [code, i]))
  const nodeRank = (node: Node): number => {
    let best = node.leaf ? (rankOf.get(node.code) ?? Infinity) : Infinity
    for (const c of node.children.values()) best = Math.min(best, nodeRank(c))
    return best
  }
  const rankCache = new Map<Node, number>()
  const rank = (node: Node): number => {
    let r = rankCache.get(node)
    if (r === undefined) { r = nodeRank(node); rankCache.set(node, r) }
    return r
  }
  const sorted = (level: Map<string, Node>) =>
    [...level.values()].sort((a, b) => {
      const ra = rank(a), rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })

  const rows: MatrixRow[] = []
  const emit = (node: Node, depth: number) => {
    if (node.children.size > 0) {
      rows.push({ key: `${keyPrefix}:${node.code}`, code: node.code, label: node.name, depth, kind: 'account', isParent: true, values: sum(node) })
      for (const c of sorted(node.children)) emit(c, depth + 1)
    } else {
      rows.push({ key: `${keyPrefix}:${node.code}`, code: node.code, label: node.name, depth, kind: 'account', values: node.leaf!.values })
    }
  }
  for (const node of sorted(roots)) emit(node, baseDepth)
  return rows
}
