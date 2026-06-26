// Monthly P&L matrix — reuses the single-period buildPnl engine, run once per
// month of the fiscal (calendar) year plus an Accumulated (FY-to-date) column,
// then aligned into a rows × columns matrix. Pure: no DB access.

import type { GlLine, CoaAccount, PnlReport, ReportSection, AccountNode } from './gl-reports'
import { buildPnl, monthPeriod } from './gl-reports'
import {
  type MatrixRow,
  type MonthlyMatrixData,
  EMPTY_PERIOD,
  collectNodeValues,
  monthColumns,
  r2,
} from './monthly-matrix'

export interface MonthlyPnl extends MonthlyMatrixData {
  /** Revenue total per column — the base for the % column. */
  salesByColumn: number[]
}

/** Build the monthly P&L matrix for a fiscal (calendar) year, Jan → throughMonth. */
export function buildMonthlyPnl(
  lines: GlLine[],
  accounts: CoaAccount[],
  args: { year: number; throughMonth: number; segment?: string | string[] },
): MonthlyPnl {
  const { year, segment } = args
  const { months, columns, accPeriod } = monthColumns(year, args.throughMonth)

  // One report per column. buildPnl is pure over (lines, period).
  const reportAcc = buildPnl(lines, accounts, { current: accPeriod, previous: EMPTY_PERIOD, segment })
  const reportByMonth = months.map((ym) =>
    buildPnl(lines, accounts, { current: monthPeriod(ym), previous: EMPTY_PERIOD, segment }),
  )
  const reports: PnlReport[] = [reportAcc, ...reportByMonth]

  // account_code → value, per column.
  const codeMaps = reports.map((rep) => {
    const map = new Map<string, number>()
    collectNodeValues(rep.revenue, map)
    collectNodeValues(rep.cost, map)
    collectNodeValues(rep.otherIncome, map)
    collectNodeValues(rep.expense, map)
    return map
  })

  const salesByColumn = reports.map((rep) => rep.revenue.current)
  const rows: MatrixRow[] = []

  // Emit a section's account tree (from the Accumulated structure so every
  // account active during the year gets a row), then a subtotal line.
  // `sign` flips cost / expense to negative for display.
  const emitSection = (
    accSection: ReportSection,
    sign: 1 | -1,
    subtotal: { key: string; label: string; pick: (r: PnlReport) => number; tone?: MatrixRow['tone'] },
  ) => {
    const walk = (n: AccountNode, depth: number) => {
      rows.push({
        key: n.code,
        label: n.name,
        depth,
        kind: 'account',
        isParent: n.children.length > 0,
        values: codeMaps.map((cm) => r2((cm.get(n.code) ?? 0) * sign)),
      })
      n.children.forEach((c) => walk(c, depth + 1))
    }
    accSection.nodes.forEach((n) => walk(n, 0))
    // Subtotal `pick` returns the already-signed value — Gross Profit / Net
    // Income are net figures and must NOT take the section's account sign.
    rows.push({
      key: subtotal.key,
      label: subtotal.label,
      depth: 0,
      kind: 'subtotal',
      tone: subtotal.tone,
      values: reports.map((r) => r2(subtotal.pick(r))),
    })
  }

  emitSection(reportAcc.revenue, 1, {
    key: 'TOTAL_REVENUE', label: 'Total Revenue', pick: (r) => r.revenue.current, tone: 'ledger',
  })
  emitSection(reportAcc.cost, -1, {
    key: 'GROSS_PROFIT', label: 'Gross Profit', pick: (r) => r.grossProfit.current, tone: 'auto',
  })
  emitSection(reportAcc.otherIncome, 1, {
    key: 'TOTAL_OTHER_INCOME', label: 'Total Other Income', pick: (r) => r.otherIncome.current, tone: 'ledger',
  })
  emitSection(reportAcc.expense, -1, {
    key: 'TOTAL_EXPENSES', label: 'Total Expenses', pick: (r) => -r.expense.current, tone: 'danger',
  })
  rows.push({
    key: 'NET_INCOME',
    label: 'Net Income / (Loss)',
    depth: 0,
    kind: 'subtotal',
    tone: 'auto',
    values: reports.map((r) => r2(r.netIncome.current)),
  })

  return { columns, rows, salesByColumn }
}
