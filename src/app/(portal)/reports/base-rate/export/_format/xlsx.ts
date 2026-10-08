import { buildXlsxBuffer } from '@/lib/export/excel'
import { officeTime } from '@/lib/office-time'
import type { Database } from '@/lib/supabase/database.types'

type BaseRateHistory = Database['public']['Tables']['base_rate_history']['Row']

export function buildBaseRateXlsx(rows: BaseRateHistory[]): Buffer {
  const headerRow = ['Quarter', 'Weighted Cost', 'Op Margin', 'Base Rate', 'Approved']
  const data: (string | number | null)[][] = rows.map(row => [
    row.quarter,
    Number(row.weighted_cost) * 100,
    Number(row.op_margin) * 100,
    Number(row.base_rate) * 100,
    row.approved_at ? officeTime(row.approved_at).format('M/D/YYYY') : '',
  ])

  return buildXlsxBuffer({
    sheetName: 'Base Rate History',
    headerRow,
    rows: data,
    columnWidths: [15, 18, 15, 15, 18],
  })
}
