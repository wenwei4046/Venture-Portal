import { buildXlsxBuffer } from '@/lib/export/excel'
import type { Database } from '@/lib/supabase/database.types'
import dayjs from 'dayjs'

type Claim = Database['public']['Tables']['claims']['Row']

export function buildClaimsXlsx(rows: Claim[]): Buffer {
  const excelRows: (string | number | null)[][] = []

  excelRows.push(['Claimant Name', 'Type', 'Amount', 'Status', 'Submitted At', 'Approved At'])

  for (const row of rows) {
    excelRows.push([
      row.claimant_name || '',
      row.claim_type === 'benefit' ? 'Benefit' : 'Pool',
      row.amount,
      row.status === 'pending'
        ? 'Pending'
        : row.status === 'approved'
          ? 'Approved'
          : row.status === 'rejected'
            ? 'Rejected'
            : 'Paid',
      row.created_at ? dayjs(row.created_at).format('D MMM YYYY') : '',
      row.approved_at ? dayjs(row.approved_at).format('D MMM YYYY') : '',
    ])
  }

  return buildXlsxBuffer({
    sheetName: 'Claims',
    headerRow: ['Claimant Name', 'Type', 'Amount', 'Status', 'Submitted At', 'Approved At'],
    rows: excelRows,
    columnWidths: [30, 12, 15, 12, 15, 15],
  })
}
