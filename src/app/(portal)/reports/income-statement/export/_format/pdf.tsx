import React from 'react'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { IncomeStatement, PoolPnl } from '@/lib/cfo-reports'

const COLUMNS = [
  { label: 'Line',         width: 220 },
  { label: 'Revenue',      width: 70, align: 'right' as const },
  { label: 'Cost',         width: 70, align: 'right' as const },
  { label: 'Other Income', width: 80, align: 'right' as const },
  { label: 'Expense',      width: 70, align: 'right' as const },
]

export function IncomeStatementPdf({ stmt, periodLabel, pool }: { stmt: IncomeStatement; periodLabel: string; pool: PoolPnl | null }) {
  function poolRows(p: PoolPnl): (string | number | null)[][] {
    const out: (string | number | null)[][] = []
    for (const g of p.revenueGroups) {
      out.push([g.accountName, g.subtotal, null, null, null])
      for (const it of g.items) {
        out.push([`  ${it.label}`, it.amount, null, null, null])
      }
    }
    if (p.revenue !== 0)                 out.push(['Total revenue', p.revenue, null, null, null])
    for (const l of p.costLines)         out.push([l.label, null, l.amount, null, null])
    if (p.cost !== 0)                    out.push(['Total cost', null, p.cost, null, null])
    if (p.grossProfit !== 0)             out.push(['Gross profit', null, null, p.grossProfit, null])
    for (const l of p.otherIncomeLines)  out.push([l.label, null, null, l.amount, null])
    for (const l of p.expenseLines)      out.push([l.label, null, null, null, l.amount])
    if (p.expense !== 0)                 out.push(['Total expense', null, null, null, p.expense])
    out.push(['Margin', null, null, null, p.margin])
    return out
  }

  return (
    <PdfDocument title="Income Statement" periodLabel={periodLabel}>
      {pool ? (
        <>
          <PdfSectionHead label={`${pool.poolLabel} Pool`} />
          <PdfTable columns={COLUMNS} rows={poolRows(pool)} numberFormat="money" />
        </>
      ) : (
        <>
          <PdfSectionHead label="Group Totals" />
          <PdfTable
            columns={COLUMNS}
            rows={[
              ['Group revenue',      stmt.groupRevenue, null, null, null],
              ['Group cost',         null, stmt.groupCost, null, null],
              ['Group gross profit', null, null, stmt.groupGrossProfit, null],
              ['Group other income', null, null, stmt.groupOtherIncome, null],
              ['Group expense',      null, null, null, stmt.groupExpense],
              ['Group net profit',   null, null, null, stmt.groupNetProfit],
            ]}
            numberFormat="money"
          />
        </>
      )}
    </PdfDocument>
  )
}
