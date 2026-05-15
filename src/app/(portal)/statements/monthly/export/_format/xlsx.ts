import { buildXlsxBuffer } from '@/lib/export/excel'

interface StatementRow {
  period: string
  companyName: string
  totalInvoice: number
  totalContra: number
  netAmount: number
  status: string
  issuedAt: string
  paidAt: string
}

export function buildStatementsXlsx(rows: StatementRow[]): Buffer {
  const xlsxRows = rows.map((row) => [
    row.period,
    row.companyName,
    row.totalInvoice,
    row.totalContra,
    row.netAmount,
    row.status,
    row.issuedAt,
    row.paidAt,
  ])

  return buildXlsxBuffer({
    sheetName: 'Statements',
    headerRow: ['Period', 'Subsidiary', 'Total Invoice', 'Total Contra', 'Net Amount', 'Status', 'Issued At', 'Paid At'],
    rows: xlsxRows,
    columnWidths: [14, 20, 16, 16, 16, 12, 14, 14],
  })
}
