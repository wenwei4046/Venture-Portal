// Custom (user-arranged) monthly P&L matrix. P&L accounts are pulled per month +
// accumulated from buildPnl, signed for display (revenue / other income +, cost /
// expense −), then grouped under user-defined categories with auto subtotals and
// a Net Income / (Loss) grand total. % column is each line vs that column's sales.

import type { GlLine, CoaAccount, PnlReport, ReportSection, AccountNode } from './gl-reports'
import { buildPnl, monthPeriod } from './gl-reports'
import {
  type MatrixRow,
  type MatrixColumn,
  EMPTY_PERIOD,
  collectNodeValues,
  buildHierarchyRows,
  monthColumns,
  r2,
} from './monthly-matrix'
import type { ReportLayout } from './report-layouts'

export type PnlDefaultCategory = 'revenue' | 'cost' | 'other_income' | 'expense'

export interface PnlAccount {
  code: string
  name: string
  defaultCategory: PnlDefaultCategory
  values: number[] // already signed for display
  ancestry: { code: string; name: string }[] // COA parents, top → down
}

export interface MonthlyPnlAccounts {
  columns: MatrixColumn[]
  accounts: PnlAccount[]
  salesByColumn: number[]
}

export function buildPnlAccounts(
  lines: GlLine[],
  accounts: CoaAccount[],
  args: { year: number; throughMonth: number; segment?: string | string[] },
): MonthlyPnlAccounts {
  const { year, segment } = args
  const { months, columns, accPeriod } = monthColumns(year, args.throughMonth)

  const reportAcc = buildPnl(lines, accounts, { current: accPeriod, previous: EMPTY_PERIOD, segment })
  const reportByMonth = months.map((ym) =>
    buildPnl(lines, accounts, { current: monthPeriod(ym), previous: EMPTY_PERIOD, segment }),
  )
  const reports: PnlReport[] = [reportAcc, ...reportByMonth]

  const codeMaps = reports.map((rep) => {
    const map = new Map<string, number>()
    collectNodeValues(rep.revenue, map)
    collectNodeValues(rep.cost, map)
    collectNodeValues(rep.otherIncome, map)
    collectNodeValues(rep.expense, map)
    return map
  })

  const list: PnlAccount[] = []
  const seen = new Set<string>()
  const collectLeaves = (section: ReportSection, cat: PnlDefaultCategory, sign: 1 | -1) => {
    const walk = (n: AccountNode, ancestors: { code: string; name: string }[]) => {
      if (n.children.length === 0) {
        if (!seen.has(n.code)) {
          seen.add(n.code)
          list.push({
            code: n.code,
            name: n.name,
            defaultCategory: cat,
            values: codeMaps.map((cm) => r2((cm.get(n.code) ?? 0) * sign)),
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
  collectLeaves(reportAcc.revenue, 'revenue', 1)
  collectLeaves(reportAcc.cost, 'cost', -1)
  collectLeaves(reportAcc.otherIncome, 'other_income', 1)
  collectLeaves(reportAcc.expense, 'expense', -1)

  return { columns, accounts: list, salesByColumn: reports.map((r) => r.revenue.current) }
}

const DEFAULT_NAMES: Record<PnlDefaultCategory, string> = {
  revenue: 'Revenue',
  cost: 'Cost of Goods Sold',
  other_income: 'Other Income',
  expense: 'Expenses',
}

export function defaultPnlLayout(list: PnlAccount[]): ReportLayout {
  const order: PnlDefaultCategory[] = ['revenue', 'cost', 'other_income', 'expense']
  return {
    categories: order.map((cat) => ({
      id: cat,
      name: DEFAULT_NAMES[cat],
      accounts: list.filter((a) => a.defaultCategory === cat).map((a) => a.code),
    })),
  }
}

const colSum = (rows: number[][], n: number): number[] => {
  const out = new Array(n).fill(0)
  for (const r of rows) for (let i = 0; i < n; i++) out[i] = r2(out[i] + (r[i] ?? 0))
  return out
}

export function buildCustomPnlRows(data: MonthlyPnlAccounts, layout: ReportLayout): MatrixRow[] {
  const n = data.columns.length
  const byCode = new Map(data.accounts.map((a) => [a.code, a]))
  const assigned = new Set<string>()
  const rows: MatrixRow[] = []

  // Gross Profit = Revenue − COGS, where "COGS" is whatever the user dropped
  // into the COGS category — NOT just COA cost-type accounts. So we run a tally
  // of the category subtotals down to (and including) the COGS line and snapshot
  // it there. The COGS line is the default 'cost' category if present, else the
  // first category carrying a COA cost-type account, else the revenue line.
  // (% column renders it as gross margin automatically.)
  const cogsId = layout.categories.find((c) => c.id === 'cost')?.id
  let grossInsertAt = -1
  let grossValues: number[] | null = null
  const running = new Array(n).fill(0)

  for (const cat of layout.categories) {
    const accs = cat.accounts.map((c) => byCode.get(c)).filter((a): a is PnlAccount => !!a)
    accs.forEach((a) => assigned.add(a.code))
    const sub = colSum(accs.map((a) => a.values), n)
    rows.push(...buildHierarchyRows(accs, cat.id, 1))
    rows.push({ key: `cat:${cat.id}`, label: cat.name, depth: 0, kind: 'subtotal', tone: 'auto', values: sub })
    for (let i = 0; i < n; i++) running[i] = r2(running[i] + (sub[i] ?? 0))

    const isCogsLine = cogsId ? cat.id === cogsId : accs.some((a) => a.defaultCategory === 'cost')
    if (isCogsLine) {
      grossInsertAt = rows.length
      grossValues = [...running]
    } else if (grossInsertAt === -1 && accs.some((a) => a.defaultCategory === 'revenue')) {
      grossInsertAt = rows.length
      grossValues = [...running]
    }
  }

  if (grossInsertAt >= 0 && grossValues) {
    rows.splice(grossInsertAt, 0, {
      key: 'GROSS_PROFIT',
      label: 'Gross Profit',
      depth: 0,
      kind: 'subtotal',
      tone: 'auto',
      values: grossValues,
    })
  }

  const leftovers = data.accounts.filter((a) => !assigned.has(a.code))
  if (leftovers.length > 0) {
    rows.push(...buildHierarchyRows(leftovers, 'unassigned', 1))
    rows.push({ key: 'cat:unassigned', label: 'Unassigned', depth: 0, kind: 'subtotal', tone: 'danger', values: colSum(leftovers.map((a) => a.values), n) })
  }

  // Net Income = sum of every account, regardless of how they're grouped.
  rows.push({
    key: 'NET_INCOME',
    label: 'Net Income / (Loss)',
    depth: 0,
    kind: 'subtotal',
    tone: 'auto',
    values: colSum(data.accounts.map((a) => a.values), n),
  })

  return rows
}
