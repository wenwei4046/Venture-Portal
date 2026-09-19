// User-arranged sections for the Cash Flow STATEMENT's 收 / 出 halves
// (user 2026-07-30: "money out 这边再分多几层父子account…借贷和repayment 一个
// section,日常或 monthly 开销一个 section" + "顺序可以让我自由自己排").
//
// Two independent layouts — report_key `cash_flow_in` / `cash_flow_out` — each
// a plain ordered category list, so the existing ReportLayoutEditor drives both
// with no changes. A category lists leaf codes AND/OR COA parent codes (2026-09-18):
// a parent claims every leaf beneath it that no category lists explicitly, so
// e.g. `3020` alone keeps all ten loan debtors together and files the next new
// debtor automatically (lib/report-layouts placeLeavesInLayout). The COA
// parent/child tree is rebuilt INSIDE each section, so a section shows e.g.
//   借贷与还款
//     ▼ 3020 Loans Receivable
//         3053 · 3054
// Anything the layout doesn't mention lands in a trailing 其他 section — never
// dropped, so the side total always equals the raw side total.

import { buildTree, type CashFlowLeaf, type CoaAccount, type ReportSection, type AccountNode } from './gl-reports'
import { ACCOUNT_TYPES, type AccountType } from './coa'
import { ancestorChain, placeLeavesInLayout, type ReportLayout } from './report-layouts'

const r2 = (n: number) => Math.round(n * 100) / 100
const ALL_TYPES: ReadonlySet<AccountType> = new Set(ACCOUNT_TYPES)

export const OTHER_SECTION_LABEL = '其他 · Other'

/** Section and COA names compare loosely: "Loans Receivable" = "loans receivable ". */
export const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/** Group one side's leaves into the layout's ordered sections, COA tree inside
 *  each. `layout` null/empty → a single section holding everything, which is
 *  exactly today's behaviour.
 *  `sideKey` namespaces the section keys ('in:other' vs 'out:other') — the
 *  in/out halves render in ONE GlReportView list, and identical keys across
 *  sides ('other', 'all', or a layout id reused in both saved layouts) made
 *  React keep stale rows from the previous period on navigation (2026-08-29:
 *  August repayments ghosting into July's inflow).
 *  Leaves with no amount in either column are left out (user 2026-09-18:
 *  "如果没有 amount 的就直接别显示"). */
export function buildCashFlowSideSections(
  leaves: CashFlowLeaf[],
  accounts: CoaAccount[],
  layout: ReportLayout | null,
  fallbackLabel: string,
  sideKey: string = 'side',
): ReportSection[] {
  const live = leaves.filter((l) => Math.abs(l.current) >= 0.005 || Math.abs(l.previous) >= 0.005)
  const byCode = new Map(live.map((l) => [l.code, l]))
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

  const parentOf = new Map(accounts.map((a) => [a.code, a.parent_code]))
  const placed = placeLeavesInLayout([...byCode.keys()], cats, (code) => ancestorChain(code, (c) => parentOf.get(c)))

  const out: ReportSection[] = []
  for (const c of cats) {
    const s = sectionFor(c.id, c.name || 'Untitled', placed.byCategory.get(c.id) ?? [])
    if (s) out.push(headSection(s))
  }
  if (placed.leftovers.length > 0) {
    const s = sectionFor('other', OTHER_SECTION_LABEL, placed.leftovers)
    if (s) out.push(headSection(s))
  }
  return out
}

/** The section row carries its own total; when the section is exactly one COA
 *  root named like the section, that root becomes the row (and its children the
 *  section's nodes) instead of printing "Loans Receivable" twice. A lone LEAF
 *  is merged the same way so its transactions stay one click away. */
function headSection(s: ReportSection): ReportSection {
  const headed: ReportSection = { ...s, headed: true }
  if (s.nodes.length === 1 && sameName(s.nodes[0].name, s.label)) {
    const root = s.nodes[0]
    return { ...headed, root, nodes: root.children }
  }
  return headed
}

/** Default layout offered by the editor when nothing is saved yet: one section
 *  per COA top-level parent present on that side, named after the parent and
 *  holding the PARENT code (a leaf with no parent holds itself), so every
 *  account under it — now or later — follows the section. */
export function defaultSideLayout(leaves: CashFlowLeaf[], accounts: CoaAccount[]): ReportLayout {
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const rootOf = (code: string): { code: string; name: string } => {
    let acc = byCode.get(code)
    if (!acc) return { code, name: code }
    while (acc.parent_code && byCode.get(acc.parent_code)) acc = byCode.get(acc.parent_code)!
    return { code: acc.code, name: acc.name }
  }
  const groups = new Map<string, { name: string }>()
  for (const l of leaves) {
    const root = rootOf(l.code)
    if (!groups.has(root.code)) groups.set(root.code, { name: root.name })
  }
  return {
    categories: [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([code, g]) => ({ id: `grp-${code}`, name: g.name, accounts: [code] })),
  }
}
