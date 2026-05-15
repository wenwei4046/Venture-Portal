import React from 'react'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'

const COLUMNS = [
  { label: 'Voucher No', width: 70 },
  { label: 'Date', width: 55 },
  { label: 'Direction', width: 50 },
  { label: 'Type', width: 80 },
  { label: 'Status', width: 75 },
  { label: 'Payee', width: 100 },
  { label: 'Amount', width: 70, align: 'right' as const },
  { label: 'Category', width: 100 },
  { label: 'Pool', width: 100 },
]

interface VoucherExportRow {
  voucher_no: string | null
  date: string
  direction: 'credit' | 'debit'
  type: string
  status: string
  payee_name: string
  amount: number
  catLabel: string
  poolLabel: string
}

export function VouchersPdf({ rows }: { rows: VoucherExportRow[] }) {
  return (
    <PdfDocument
      title="Payment Vouchers"
      periodLabel={new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long' })}
      orientation="landscape"
    >
      <PdfTable
        columns={COLUMNS}
        numberFormat="money"
        rows={rows.map((row) => [
          row.voucher_no ?? '',
          row.date,
          row.direction === 'credit' ? 'OR' : 'PV',
          row.type,
          row.status.replace('_', ' '),
          row.payee_name,
          row.direction === 'credit' ? row.amount : -row.amount,
          row.catLabel,
          row.poolLabel,
        ])}
      />
    </PdfDocument>
  )
}
