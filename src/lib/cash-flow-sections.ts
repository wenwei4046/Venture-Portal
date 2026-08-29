// User-arranged sections for the Cash Flow STATEMENT's 收 / 出 halves
// (user 2026-07-30: "money out 这边再分多几层父子account…借贷和repayment 一个
// section,日常或 monthly 开销一个 section" + "顺序可以让我自由自己排").
//
// Two independent layouts — report_key `cash_flow_in` / `cash_flow_out` — each
// a plain ordered category list, so the existing ReportLayoutEditor drives both
// with no changes. Accounts are assigned as LEAVES; the COA parent/child tree is
// rebuilt INSIDE each section, so a section shows e.g.
//   借贷与还款
//     ▼ 3020 Loans Receivable
//         3053 · 3054
// Anything the layout doesn't mention lands in a trailing 其他 section — never
// dropped, so the side total always equals the raw side total.

import { buildTree, type CashFlowLeaf, type CoaAccount, type ReportSection, type AccountNode } from './gl-reports'
import { ACCOUNT_TYPES, type AccountType } from './coa'
import type { ReportLayout } from './report-layouts'

const r2 = (n: number) => Math.round(n * 100) / 100
const ALL_TYPES: ReadonlySet<AccountType> = new Set(ACCOUNT_TYPES)

export const OTHER_SECTION_LABEL = '其他 · Other'

/** Group one side's leaves into the layout's ordered sections, COA tree inside
 *  each. `layout` null/empty → a single section holding everything, which is
 *  exactly today's behaviour.
 *  `sideKey` namespaces the section keys ('in:other' vs 'out:other') — the
 *  in/out halves render in ONE GlReportView list, and identical keys across
 *  sides ('other', 'all', or a layout id reused in both saved layouts) made
 *  React keep stale rows from the previous period on navigation (2026-08-29:
 *  August repayments ghosting into July's inflow). */
export function buildCashFlowSideSections(
  leaves: CashFlowLeaf[],
  accounts: CoaAccount[],
  layout: ReportLayout | null,
  fallbackLabel: string,
  sideKey: string = 'side',
): ReportSection[] {
  const byCode = new Map(leaves.map((l) => [l.code, l]))
  const cats = layout?.categories?.filter((c) => c && typeof c.id === 'string') ?? []

  const sectionFor = (rawId: string, label: string, codes: string[]): ReportSection | null => {
    const id = `${sideKey}:${rawId}`
    const buckets = new Map<string, { current: number; previous: number; txns: CashFlowLeaf['txns'] }>()
    for (const code of codes) {
      const leaf = byCode.get(code)
      if (!leaf) continue
      buckets.set(code, { current: leaf.current, previous: leaf.previous, txns: leaf.txns })
    }
    if (buckets.size === 0) return null
    const nodes: AccountNode[] = buildTree(accounts, buckets, ALL_TYPES)
    return {
      key: id,
      label,
      nodes,
      current: r2(nodes.reduce((s, n) => s + n.current, 0)),
      previous: r2(nodes.reduce((s, n) => s + n.previous, 0)),
    }
  }

  if (cats.length === 0) {
    const all = sectionFor('all', fallbackLabel, [...byCode.keys()])
    return all ? [all] : []
  }

  const out: ReportSection[] = []
  const placed = new Set<string>()
  for (const c of cats) {
    const codes = (c.accounts ?? []).filter((code) => byCode.has(code))
    codes.forEach((code) => placed.add(code))
    const s = sectionFor(c.id, c.name || 'Untitled', codes)
    if (s) out.push(s)
  }
  const leftovers = [...byCode.keys()].filter((code) => !placed.has(code))
  if (leftovers.length > 0) {
    const s = sectionFor('other', OTHER_SECTION_LABEL, leftovers)
    if (s) out.push(s)
  }
  return out
}

/** Default layout offered by the editor when nothing is saved yet: one section
 *  per COA top-level parent present on that side, named after the parent. */
export function defaultSideLayout(leaves: CashFlowLeaf[], accounts: CoaAccount[]): ReportLayout {
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const rootOf = (code: string): { code: string; name: string } => {
    let acc = byCode.get(code)
    if (!acc) return { code, name: code }
    while (acc.parent_code && byCode.get(acc.parent_code)) acc = byCode.get(acc.parent_code)!
    return { code: acc.code, name: acc.name }
  }
  const groups = new Map<string, { name: string; accounts: string[] }>()
  for (const l of leaves) {
    const root = rootOf(l.code)
    const g = groups.get(root.code) ?? { name: root.name, accounts: [] }
    g.accounts.push(l.code)
    groups.set(root.code, g)
  }
  return {
    categories: [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([code, g]) => ({ id: `grp-${code}`, name: g.name, accounts: g.accounts })),
  }
}
