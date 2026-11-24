import dayjs from 'dayjs'
import { requirePage, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { fyEndOf, fyStartOf } from '@/lib/fiscal-year'
import { faDataOf } from '@/lib/fixed-assets'
import { exportXlsxResponse } from '@/lib/export/response'
import { fixedAssetsSheet } from '@/lib/fixed-assets-sheet'
import { buildXlsxBuffer } from '@/lib/export/excel'

// The PPE listing for a financial year, for the auditor (2026-11-24 — the user's Carres listing as the sample): by class,
// cost and accumulated depreciation brought forward, the year's, carried forward, and the net book value at the year's
// end (this month while it runs). Read-only, as the page.
export async function GET(req: Request) {
  await requirePage('/reconciliation/fixed-assets')
  await requirePermission('reconciliation')
  const url = new URL(req.url)
  const asked = url.searchParams.get('fy') ?? ''
  const from = fyStartOf(/^\d{4}-\d{2}$/.test(asked) ? asked : officeMonth())
  const to = fyEndOf(from)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fa_read' as never)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const now = officeMonth()
  const asAt = to < now ? to : now
  const sheet = fixedAssetsSheet(faDataOf(data), from, asAt, dayjs(`${asAt}-01`).endOf('month').format('DD.MM.YYYY'))
  const filename = `ppe-listing-${asAt}`
  return exportXlsxResponse({
    filename,
    buffer: buildXlsxBuffer({
      sheetName: `PPE ${dayjs(`${asAt}-01`).format('MMM YYYY')}`,
      headerRow: sheet.header,
      rows: sheet.rows,
      sectionBreaks: sheet.sectionBreaks,
      columnWidths: sheet.widths,
    }),
  })
}
