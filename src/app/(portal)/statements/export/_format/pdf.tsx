import React from 'react'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'

const COLUMNS = [
  { label: 'Invoice #', width: 80 },
  { label: 'Company', width: 120 },
  { label: 'Mode', width: 120 },
  { label: 'Amount', width: 90, align: 'right' as const },
  { label: 'Status', width: 70 },
  { label: 'Due Date', width: 70 },
]

interface InvoiceRow {
  invoice_no: string
  company: string
  mode: string
  amount: number
  status: string
  due_date: string
}

export function InvoicesPdf({ rows, periodLabel }: { rows: InvoiceRow[]; periodLabel: string }) {
  return (
    <PdfDocument
      title="Invoices"
      periodLabel={periodLabel}
      orientation="landscape"
    >
      <PdfTable
        columns={COLUMNS}
        numberFormat="money"
        rows={rows.map((row) => [
          row.invoice_no,
          row.company,
          row.mode,
          row.amount,
          row.status,
          row.due_date,
        ])}
      />
    </PdfDocument>
  )
}
