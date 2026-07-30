// Custom (user-arranged) cash-flow matrix. The cash-flow line accounts are
// pulled per month + accumulated from the buildCashFlow engine, then grouped
// under user-defined categories (a saved layout). Subtotals per category are
// computed automatically; opening → net change → closing cash close it off.

import type { GlLine, CoaAccount, CashFlowReport, ReportSection, AccountNode } from './gl-reports'
import { buildCashFlow, monthPeriod } from './gl-reports'
import {
  type MatrixRow,
  type MatrixColumn,
  EMPTY_PERIOD,
  collectNodeValues,
  buildHierarchyRows,
  monthColumns,
  r2,
} from './monthly-matrix'

export type CashFlowDefaultCategory = 'operating' | 'investing' | 'financing'

export interface CashFlowAccount {
  code: string
  name: string
  defaultCategory: CashFlowDefaultCategory
  values: number[] // aligned to columns
  ancestry: { code: string; name: string }[] // COA parents, top → down
}

export interface MonthlyCashFlowAccounts {
  columns: MatrixColumn[]
  accounts: CashFlowAccount[]
  openingByCol: number[]
  closingByCol: number[]
  netChangeByCol: number[]
}

// A saved layout: ordered categories, each holding an ordered list of account
// codes. Accounts not listed anywhere fall into an "Unassigned" group.
export interface CashFlowCategory {
  id: string
  name: string
  accounts: string[] // account codes, in display order
}
export interface CashFlowLayout {
  categories: CashFlowCategory[]
}

const DEFAULT_CATEGORY_NAMES: Record<CashFlowDefaultCategory, string> = {
  operating: 'Operating Activities',
  investing: 'Investing Activities',
  financing: 'Financing Activities',
}

/** Per-account cash-flow values across the matrix columns. */
export function buildCashFlowAccounts(
  lines: GlLine[],
  accounts: CoaAccount[],
  bankCodes: ReadonlySet<string>,
  args: { year: number; throughMonth: number; segment?: string | string[] },
): MonthlyCashFlowAccounts {
  const { year, segment } = args
  const { months, columns, accPeriod } = monthColumns(year, args.throughMonth)

  const reportAcc = buildCashFlow(lines, accounts, { current: accPeriod, previous: EMPTY_PERIOD, segment }, bankCodes)
  const reportByMonth = months.map((ym) =>
    buildCashFlow(lines, accounts, { current: monthPeriod(ym), previous: EMPTY_PERIOD, segment }, bankCodes),
  )
  const reports: CashFlowReport[] = [reportAcc, ...reportByMonth]

  const codeMaps = reports.map((rep) => {
    const map = new Map<string, number>()
    collectNodeValues(rep.operating, map)
    collectNodeValues(rep.investing, map)
    collectNodeValues(rep.financing, map)
    return map
  })

  const list: CashFlowAccount[] = []
  const seen = new Set<string>()
  const collectLeaves = (section: ReportSection, cat: CashFlowDefaultCategory) => {
    const walk = (n: AccountNode, ancestors: { code: string; name: string }[]) => {
      if (n.children.length === 0) {
        if (!seen.has(n.code)) {
          seen.add(n.code)
          list.push({
            code: n.code,
            name: n.name,
            defaultCategory: cat,
            values: codeMaps.map((cm) => r2(cm.get(n.code) ?? 0)),
            ancestry: ancestors,
          })
        }
      } else {
        const next = [...ancestors, { code: n.code, name: n.name }]
        n.children.forEach((c) => walk(c, next))
      }
    }
    section.nodes.forEach((n) => walk(n, []))
  }
  collectLeaves(reportAcc.operating, 'operating')
  collectLeaves(reportAcc.investing, 'investing')
  collectLeaves(reportAcc.financing, 'financing')

  return {
    columns,
    accounts: list,
    openingByCol: reports.map((r) => r2(r.openingCash.current)),
    closingByCol: reports.map((r) => r2(r.closingCash.current)),
    netChangeByCol: reports.map((r) => r2(r.netChange.current)),
  }
}

// ─── 收 / 出 matrix, mirroring the Cash Flow STATEMENT ───────────────────────
// User 2026-07-30: "monthly cash flow 和 cash flow 显示的是一样,以 cash flow
// 为准." Same gross split, same `cash_flow_in` / `cash_flow_out` layouts, same
// COA nesting and per-section subtotals — only the columns differ (months).

export interface SideAccount {
  code: string
  name: string
  values: number[] // aligned to columns
  ancestry: { code: string; name: string }[]
}

export interface MonthlyCashFlowSides {
  columns: MatrixColumn[]
  inflow: SideAccount[]
  outflow: SideAccount[]
  inflowTotalByCol: number[]
  outflowTotalByCol: number[]
  openingByCol: number[]
  closingByCol: number[]
  netChangeByCol: number[]
}

/** Per-account, per-column values split by direction. Rows are anchored on the
 *  ACCUMULATED column's side classification (an account that flips direction
 *  mid-year simply reads 0 in the columns where it sat on the other side). */
export function buildMonthlyCashFlowSides(
  lines: GlLine[],
  accounts: CoaAccount[],
  bankCodes: ReadonlySet<string>,
  args: { year: number; throughMonth: number; segment?: string | string[] },
): MonthlyCashFlowSides {
  const { year, segment } = args
  const { months, columns, accPeriod } = monthColumns(year, args.throughMonth)

  const reportAcc = buildCashFlow(lines, accounts, { current: accPeriod, previous: EMPTY_PERIOD, segment }, bankCodes)
  const reports: CashFlowReport[] = [
    reportAcc,
    ...months.map((ym) =>
      buildCashFlow(lines, accounts, { current: monthPeriod(ym), previous: EMPTY_PERIOD, segment }, bankCodes),
    ),
  ]

  const inByCol = reports.map((r) => new Map(r.inflowLeaves.map((l) => [l.code, l.current])))
  const outByCol = reports.map((r) => new Map(r.outflowLeaves.map((l) => [l.code, l.current])))

  const sideAccounts = (root: ReportSection, byCol: Map<string, number>[]): SideAccount[] => {
    const out: SideAccount[] = []
    const walk = (n: AccountNode, ancestors: { code: string; name: string }[]) => {
      if (n.children.length === 0) {
        out.push({
          code: n.code,
          name: n.name,
          values: byCol.map((m) => r2(m.get(n.code) ?? 0)),
          ancestry: ancestors,
        })
      } else {
        const next = [...ancestors, { code: n.code, name: n.name }]
        n.children.forEach((c) => walk(c, next))
      }
    }
    root.nodes.forEach((n) => walk(n, []))
    return out
  }

  const inflow = sideAccounts(reportAcc.inflow, inByCol)
  const outflow = sideAccounts(reportAcc.outflow, outByCol)
  const nCols = columns.length

  return {
    columns,
    inflow,
    outflow,
    inflowTotalByCol: colSum(inflow.map((a) => a.values), nCols),
    outflowTotalByCol: colSum(outflow.map((a) => a.values), nCols),
    openingByCol: reports.map((r) => r2(r.openingCash.current)),
    closingByCol: reports.map((r) => r2(r.closingCash.current)),
    netChangeByCol: reports.map((r) => r2(r.netChange.current)),
  }
}

/** Rows for one side: the layout's ordered sections (COA tree inside each) with
 *  a subtotal per section, then the side total. Unlisted accounts sweep into
 *  其他 so a side total can never silently drop one. */
export function buildSideMatrixRows(
  side: SideAccount[],
  layout: { categories: { id: string; name: string; accounts: string[] }[] } | null,
  nCols: number,
  sideKey: string,
  sideLabel: string,
  sideTotal: number[],
): MatrixRow[] {
  const rows: MatrixRow[] = []
  const cats = layout?.categories?.filter((c) => c && typeof c.id === 'string') ?? []
  const byCode = new Map(side.map((a) => [a.code, a]))
  const placed = new Set<string>()

  if (cats.length === 0) {
    rows.push(...buildHierarchyRows(side, sideKey, 1))
  } else {
    for (const c of cats) {
      const accs = (c.accounts ?? []).map((code) => byCode.get(code)).filter((a): a is SideAccount => !!a)
      accs.forEach((a) => placed.add(a.code))
      if (accs.length === 0) continue
      rows.push(...buildHierarchyRows(accs, `${sideKey}:${c.id}`, 1))
      rows.push({
        key: `${sideKey}:${c.id}:sub`,
        label: `${c.name || 'Untitled'} — 小计`,
        depth: 0,
        kind: 'subtotal',
        tone: 'auto',
        values: colSum(accs.map((a) => a.values), nCols),
      })
    }
    const leftovers = side.filter((a) => !placed.has(a.code))
    if (leftovers.length > 0) {
      rows.push(...buildHierarchyRows(leftovers, `${sideKey}:other`, 1))
      rows.push({
        key: `${sideKey}:other:sub`,
        label: '其他 · Other — 小计',
        depth: 0,
        kind: 'subtotal',
        tone: 'auto',
        values: colSum(leftovers.map((a) => a.values), nCols),
      })
    }
  }

  rows.push({ key: `${sideKey}:total`, label: sideLabel, depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: sideTotal })
  return rows
}

/** Default layout when nothing is saved: the three standard activity buckets. */
export function defaultCashFlowLayout(accountsList: CashFlowAccount[]): CashFlowLayout {
  const order: CashFlowDefaultCategory[] = ['operating', 'investing', 'financing']
  return {
    categories: order.map((cat) => ({
      id: cat,
      name: DEFAULT_CATEGORY_NAMES[cat],
      accounts: accountsList.filter((a) => a.defaultCategory === cat).map((a) => a.code),
    })),
  }
}

const colSum = (rows: number[][], nCols: number): number[] => {
  const out = new Array(nCols).fill(0)
  for (const r of rows) for (let i = 0; i < nCols; i++) out[i] = r2(out[i] + (r[i] ?? 0))
  return out
}

/** Group the cash-flow accounts under a layout's categories and emit matrix
 *  rows with auto subtotals, then net change + opening/closing cash. */
export function buildCustomCashFlowRows(
  data: MonthlyCashFlowAccounts,
  layout: CashFlowLayout,
): MatrixRow[] {
  const nCols = data.columns.length
  const byCode = new Map(data.accounts.map((a) => [a.code, a]))
  const rows: MatrixRow[] = []

  // Auto-file un-placed cash-flow accounts into the category whose id matches
  // their accounting default (operating / investing / financing), so a newly-seen
  // or synthetic account doesn't fall into the red "Unassigned" bucket. Only an
  // account whose default category has no matching category stays Unassigned.
  const placed = new Set(layout.categories.flatMap((c) => c.accounts))
  const catIds = new Set(layout.categories.map((c) => c.id))
  const autoByCat = new Map<string, CashFlowAccount[]>()
  const orphans: CashFlowAccount[] = []
  for (const a of data.accounts) {
    if (placed.has(a.code)) continue
    if (catIds.has(a.defaultCategory)) {
      const arr = autoByCat.get(a.defaultCategory) ?? []
      arr.push(a)
      autoByCat.set(a.defaultCategory, arr)
    } else {
      orphans.push(a)
    }
  }

  for (const cat of layout.categories) {
    const listed = cat.accounts
      .map((code) => byCode.get(code))
      .filter((a): a is CashFlowAccount => !!a)
    const catAccounts = [...listed, ...(autoByCat.get(cat.id) ?? [])]
    rows.push(...buildHierarchyRows(catAccounts, cat.id, 1))
    rows.push({
      key: `cat:${cat.id}`,
      label: cat.name,
      depth: 0,
      kind: 'subtotal',
      tone: 'auto',
      values: colSum(catAccounts.map((a) => a.values), nCols),
    })
  }

  // Only reached if a default category has no matching layout category.
  if (orphans.length > 0) {
    rows.push(...buildHierarchyRows(orphans, 'unassigned', 1))
    rows.push({
      key: 'cat:unassigned',
      label: 'Unassigned',
      depth: 0,
      kind: 'subtotal',
      tone: 'danger',
      values: colSum(orphans.map((a) => a.values), nCols),
    })
  }

  rows.push({ key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', values: data.netChangeByCol })
  rows.push({ key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol })
  rows.push({ key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.closingByCol })

  return rows
}
