import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { Database } from '@/lib/supabase/database.types'

type BaseRateHistory = Database['public']['Tables']['base_rate_history']['Row']

export function BaseRatePdf({ rows }: { rows: BaseRateHistory[] }) {
  const tableRows = rows.map(row => [
    row.quarter,
    Number(row.weighted_cost) * 100,
    Number(row.op_margin) * 100,
    Number(row.base_rate) * 100,
    row.approved_at ? dayjs(row.approved_at).format('D MMM YYYY') : '—',
  ])

  return (
    <PdfDocument title="Base Rate History" periodLabel={dayjs().format('D MMMM YYYY')}>
      <PdfTable
        columns={[
          { label: 'Quarter', width: 80 },
          { label: 'Weighted Cost', width: 100, align: 'right' },
          { label: 'Op Margin', width: 100, align: 'right' },
          { label: 'Base Rate', width: 100, align: 'right' },
          { label: 'Approved', width: 120 },
        ]}
        numberFormat="plain"
        rows={tableRows}
      />
    </PdfDocument>
  )
}
