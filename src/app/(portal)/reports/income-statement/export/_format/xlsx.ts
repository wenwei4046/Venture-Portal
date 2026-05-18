import { buildXlsxBuffer } from '@/lib/export/excel'
import type { IncomeStatement, PoolPnl } from '@/lib/cfo-reports'

export function buildIncomeStatementXlsx(stmt: IncomeStatement, opts: { pool: PoolPnl | null }): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []

  function appendPool(p: PoolPnl) {
    breaks.push({ afterRow: rows.length, title: `${p.poolLabel.toUpperCase()} POOL` })
    for (const g of p.revenueGroups) {
      rows.push([g.accountName, g.subtotal, null, null, null])
      for (const it of g.items) {
        rows.push([`  ${it.label}`, it.amount, null, null, null])
      }
    }
    if (p.revenue !== 0)                  rows.push(['Total revenue', p.revenue, null, null, null])
    for (const l of p.costLines)          rows.push([l.label, null, l.amount, null, null])
    if (p.cost !== 0)                     rows.push(['Total cost',    null, p.cost, null, null])
    if (p.grossProfit !== 0)              rows.push(['Gross profit',  null, null, p.grossProfit, null])
    for (const l of p.otherIncomeLines)   rows.push([l.label, null, null, l.amount, null])
    for (const l of p.expenseLines)       rows.push([l.label, null, null, null, l.amount])
    if (p.expense !== 0)                  rows.push(['Total expense', null, null, null, p.expense])
    rows.push([`Margin`, null, null, null, p.margin])
  }

  if (opts.pool) {
    appendPool(opts.pool)
  } else {
    breaks.push({ afterRow: rows.length, title: 'GROUP TOTALS' })
    rows.push(['Group revenue',      stmt.groupRevenue,     null, null, null])
    rows.push(['Group cost',         null, stmt.groupCost,  null, null])
    rows.push(['Group gross profit', null, null, stmt.groupGrossProfit, null])
    rows.push(['Group other income', null, null, stmt.groupOtherIncome, null])
    rows.push(['Group expense',      null, null, null, stmt.groupExpense])
    rows.push(['Group net profit',   null, null, null, stmt.groupNetProfit])
  }

  return buildXlsxBuffer({
    sheetName: 'Income Statement',
    headerRow: ['Line', 'Revenue', 'Cost', 'Other Income', 'Expense'],
    rows,
    columnWidths: [38, 14, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
