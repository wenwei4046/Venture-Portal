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
  monthColumns,
  r2,
} from './monthly-matrix'

export type CashFlowDefaultCategory = 'operating' | 'investing' | 'financing'

export interface CashFlowAccount {
  code: string
  name: string
  defaultCategory: CashFlowDefaultCategory
  values: number[] // aligned to columns
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
    const walk = (n: AccountNode) => {
      if (n.children.length === 0) {
        if (!seen.has(n.code)) {
          seen.add(n.code)
          list.push({
            code: n.code,
            name: n.name,
            defaultCategory: cat,
            values: codeMaps.map((cm) => r2(cm.get(n.code) ?? 0)),
          })
        }
      } else {
        n.children.forEach(walk)
      }
    }
    section.nodes.forEach(walk)
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
  const assigned = new Set<string>()
  const rows: MatrixRow[] = []

  for (const cat of layout.categories) {
    const catAccounts = cat.accounts.map((code) => byCode.get(code)).filter((a): a is CashFlowAccount => !!a)
    for (const a of catAccounts) {
      assigned.add(a.code)
      rows.push({ key: `${cat.id}:${a.code}`, label: a.name, depth: 1, kind: 'account', values: a.values })
    }
    rows.push({
      key: `cat:${cat.id}`,
      label: cat.name,
      depth: 0,
      kind: 'subtotal',
      tone: 'auto',
      values: colSum(catAccounts.map((a) => a.values), nCols),
    })
  }

  // Anything not placed in a category → Unassigned (so no account silently drops).
  const leftovers = data.accounts.filter((a) => !assigned.has(a.code))
  if (leftovers.length > 0) {
    for (const a of leftovers) {
      rows.push({ key: `unassigned:${a.code}`, label: a.name, depth: 1, kind: 'account', values: a.values })
    }
    rows.push({
      key: 'cat:unassigned',
      label: 'Unassigned',
      depth: 0,
      kind: 'subtotal',
      tone: 'danger',
      values: colSum(leftovers.map((a) => a.values), nCols),
    })
  }

  rows.push({ key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', values: data.netChangeByCol })
  rows.push({ key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol })
  rows.push({ key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.closingByCol })

  return rows
}
