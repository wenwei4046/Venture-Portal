// Monthly Cash Flow matrix — reuses the single-period buildCashFlow (direct
// method) engine, run once per month of the fiscal (calendar) year plus an
// Accumulated column, aligned into a rows × columns matrix. Pure: no DB access.

import type { GlLine, CoaAccount, CashFlowReport, ReportSection, AccountNode } from './gl-reports'
import { buildCashFlow, monthPeriod } from './gl-reports'
import {
  type MatrixRow,
  type MonthlyMatrixData,
  EMPTY_PERIOD,
  collectNodeValues,
  monthColumns,
  r2,
} from './monthly-matrix'

/** Build the monthly cash-flow matrix for a fiscal (calendar) year. */
export function buildMonthlyCashFlow(
  lines: GlLine[],
  accounts: CoaAccount[],
  bankCodes: ReadonlySet<string>,
  args: { year: number; throughMonth: number; segment?: string | string[] },
): MonthlyMatrixData {
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

  const rows: MatrixRow[] = []

  // Cash-flow values are already signed (inflow +, outflow −), so no sign flip.
  const emitSection = (
    accSection: ReportSection,
    subtotal: { key: string; label: string; pick: (r: CashFlowReport) => number; tone?: MatrixRow['tone'] },
  ) => {
    const walk = (n: AccountNode, depth: number) => {
      rows.push({
        key: `${subtotal.key}:${n.code}`,
        label: n.name,
        depth,
        kind: 'account',
        isParent: n.children.length > 0,
        values: codeMaps.map((cm) => r2(cm.get(n.code) ?? 0)),
      })
      n.children.forEach((c) => walk(c, depth + 1))
    }
    accSection.nodes.forEach((n) => walk(n, 0))
    rows.push({
      key: subtotal.key,
      label: subtotal.label,
      depth: 0,
      kind: 'subtotal',
      tone: subtotal.tone,
      values: reports.map((r) => r2(subtotal.pick(r))),
    })
  }

  emitSection(reportAcc.operating, {
    key: 'NET_OPERATING', label: 'Net cash from operating', pick: (r) => r.operating.current, tone: 'auto',
  })
  emitSection(reportAcc.investing, {
    key: 'NET_INVESTING', label: 'Net cash from investing', pick: (r) => r.investing.current, tone: 'auto',
  })
  emitSection(reportAcc.financing, {
    key: 'NET_FINANCING', label: 'Net cash from financing', pick: (r) => r.financing.current, tone: 'auto',
  })
  rows.push({
    key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto',
    values: reports.map((r) => r2(r.netChange.current)),
  })
  rows.push({
    key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger',
    values: reports.map((r) => r2(r.openingCash.current)),
  })
  rows.push({
    key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger',
    values: reports.map((r) => r2(r.closingCash.current)),
  })

  return { columns, rows }
}
