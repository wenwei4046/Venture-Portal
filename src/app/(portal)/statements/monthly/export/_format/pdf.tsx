import React from 'react'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'

const COLUMNS = [
  { label: 'Period', width: 80 },
  { label: 'Subsidiary', width: 140 },
  { label: 'Total Invoice', width: 100, align: 'right' as const },
  { label: 'Total Contra', width: 100, align: 'right' as const },
  { label: 'Net Amount', width: 100, align: 'right' as const },
  { label: 'Status', width: 80 },
  { label: 'Issued At', width: 90 },
]

interface StatementRow {
  period: string
  companyName: string
  totalInvoice: number
  totalContra: number
  netAmount: number
  status: string
  issuedAt: string
}

export function StatementsPdf({ rows, periodLabel }: { rows: StatementRow[]; periodLabel: string }) {
  return (
    <PdfDocument
      title="Monthly Statements"
      periodLabel={periodLabel}
      orientation="landscape"
    >
      <PdfTable
        columns={COLUMNS}
        numberFormat="money"
        rows={rows.map((row) => [
          row.period,
          row.companyName,
          row.totalInvoice,
          row.totalContra,
          row.netAmount,
          row.status,
          row.issuedAt,
        ])}
      />
    </PdfDocument>
  )
}
