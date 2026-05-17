import { buildXlsxBuffer } from '@/lib/export/excel'

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

export function buildVouchersXlsx(rows: VoucherExportRow[]): Buffer {
  const xlsxRows = rows.map((row) => [
    row.voucher_no ?? '',
    row.date,
    row.direction === 'credit' ? 'OR' : 'PV',
    row.type,
    row.status.replace('_', ' '),
    row.payee_name,
    row.direction === 'credit' ? row.amount : -row.amount,
    row.catLabel,
    row.poolLabel,
  ])

  return buildXlsxBuffer({
    sheetName: 'Payment Vouchers',
    headerRow: [
      'Voucher No',
      'Date',
      'Direction',
      'Type',
      'Status',
      'Payee',
      'Amount',
      'Category',
      'Pool',
    ],
    rows: xlsxRows,
    columnWidths: [16, 14, 12, 18, 16, 24, 16, 24, 24],
  })
}
