// Daily Bank — PDF export (?date=YYYY-MM-DD). Same data builder as the page.
// English/ASCII only (react-pdf has no CJK glyphs).

import React from 'react'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchDailyBank } from '@/lib/daily-bank-data'
import { DB_COLUMNS, DB_COLUMN_LABELS, sumAmounts } from '@/lib/daily-bank'
import { PdfDocument, PdfTable, type PdfColumn, type PdfRowKind } from '@/lib/export/pdf'
import { exportPdfResponse } from '@/lib/export/response'

export async function GET(request: Request) {
  await requireRole(['finance', 'principal'])
  const supabase = (await createClient()) as unknown as SupabaseClient

  const url = new URL(request.url)
  const raw = url.searchParams.get('date') ?? ''
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(raw) && dayjs(raw).isValid() ? raw : dayjs().format('YYYY-MM-DD')

  const data = await fetchDailyBank(supabase, date)

  // Landscape A4 usable ≈ 760pt: label 200 + 7 dept cols 70 + total 70 = 760.
  const columns: PdfColumn[] = [
    { label: 'Bank \\ Dept', width: 200 },
    ...DB_COLUMNS.map(c => ({ label: DB_COLUMN_LABELS[c], width: 70, align: 'right' as const })),
    { label: 'Total', width: 70, align: 'right' as const },
  ]

  const rows: (string | number | null)[][] = []
  const kinds: PdfRowKind[] = []
  const push = (label: string, amounts: number[], total: number, kind: PdfRowKind) => {
    rows.push([label, ...amounts.map(a => (a === 0 ? null : a)), total])
    kinds.push(kind)
  }

  for (const b of data.banks) {
    push(
      `${b.bankName} - Balance B/F`,
      DB_COLUMNS.map(c => b.bf[c]),
      sumAmounts(b.bf),
      'group',
    )
    if (sumAmounts(b.inToday) !== 0) {
      push(
        '  Received today',
        DB_COLUMNS.map(c => b.inToday[c]),
        sumAmounts(b.inToday),
        'detail',
      )
    }
    for (const p of b.pending) {
      const desc = p.description.length > 26 ? `${p.description.slice(0, 24)}..` : p.description
      push(
        `  PENDING ${p.payee} ${p.voucherNo}${desc ? ` ${desc}` : ''}`,
        DB_COLUMNS.map(c => -p.amounts[c]),
        -p.total,
        'detail',
      )
    }
    push(
      '  Available balance',
      DB_COLUMNS.map(c => b.available[c]),
      sumAmounts(b.available),
      'total',
    )
  }
  rows.push([
    'TOTAL AVAILABLE',
    ...DB_COLUMNS.map(c => data.totals.available[c]),
    data.totals.grand,
  ])
  kinds.push('total')

  return exportPdfResponse({
    filename: `daily-bank-${date}`,
    element: (
      <PdfDocument
        title="Daily Bank"
        subtitle="Balance B/F + received - pending (awaiting Principal) = available. Paid items are already inside the balance. Unassigned = untagged entries."
        periodLabel={dayjs(date).format('ddd, D MMM YYYY')}
        orientation="landscape"
      >
        <PdfTable columns={columns} rows={rows} numberFormat="money" rowKinds={kinds} repeatHeader />
      </PdfDocument>
    ),
  })
}
