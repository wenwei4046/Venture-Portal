import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { Database } from '@/lib/supabase/database.types'

type Claim = Database['public']['Tables']['claims']['Row']

export function ClaimsPdf({ rows }: { rows: Claim[] }) {
  const tableRows = rows.map(claim => [
    claim.claimant_name || '',
    claim.claim_type === 'benefit' ? 'Benefit' : 'Pool',
    claim.amount,
    claim.status === 'pending'
      ? 'Pending'
      : claim.status === 'approved'
        ? 'Approved'
        : claim.status === 'rejected'
          ? 'Rejected'
          : 'Paid',
    claim.created_at ? dayjs(claim.created_at).format('D MMM YYYY') : '',
    claim.approved_at ? dayjs(claim.approved_at).format('D MMM YYYY') : '',
  ])

  return (
    <PdfDocument title="Claims Summary" periodLabel={dayjs().format('D MMMM YYYY')} orientation="portrait">
      <PdfTable
        columns={[
          { label: 'Claimant Name', width: 150 },
          { label: 'Type', width: 80 },
          { label: 'Amount', width: 100, align: 'right' },
          { label: 'Status', width: 80 },
          { label: 'Submitted At', width: 100 },
          { label: 'Approved At', width: 100 },
        ]}
        numberFormat="money"
        rows={tableRows}
      />
    </PdfDocument>
  )
}
