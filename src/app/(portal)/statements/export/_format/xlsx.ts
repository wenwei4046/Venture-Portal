import { buildXlsxBuffer } from '@/lib/export/excel'

interface Invoice {
  id: string
  invoice_no: string | null
  company_id: string | null
  period_month: string
  billing_mode: string
  total_amount: number
  status: string
  billable_to_type?: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
  billable_to_department_id?: string | null
  billable_to_freetext_name?: string | null
}

interface InvoiceRow {
  invoice_no: string
  company: string
  mode: string
  amount: number
  status: string
  due_date: string
}

export function buildInvoicesXlsx(rows: InvoiceRow[]): Buffer {
  const xlsxRows = rows.map((row) => [
    row.invoice_no,
    row.company,
    row.mode,
    row.amount,
    row.status,
    row.due_date,
  ])

  return buildXlsxBuffer({
    sheetName: 'Invoices',
    headerRow: ['Invoice #', 'Company', 'Mode', 'Amount', 'Status', 'Due Date'],
    rows: xlsxRows,
    columnWidths: [16, 24, 24, 16, 14, 14],
  })
}
