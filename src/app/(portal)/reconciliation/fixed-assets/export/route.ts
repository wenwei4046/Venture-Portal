import dayjs from 'dayjs'
import { requirePage, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { fyEndOf, fyStartOf } from '@/lib/fiscal-year'
import { faDataOf } from '@/lib/fixed-assets'
import { exportXlsxResponse } from '@/lib/export/response'
import { fixedAssetsSheet } from '@/lib/fixed-assets-sheet'
import { buildXlsxBuffer } from '@/lib/export/excel'

// The fixed asset schedule for a financial year, for the auditor (2026-11-24): each asset's cost, what was depreciated
// before the year, each month of it, the year's total, accumulated and net book value at its end. Read-only, as the page.
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
  const sheet = fixedAssetsSheet(faDataOf(data), from, to)
  const filename = `fixed-assets-${from}-${to}`
  return exportXlsxResponse({
    filename,
    buffer: buildXlsxBuffer({ sheetName: `FY ${dayjs(`${to}-01`).format('MMM YYYY')}`, headerRow: sheet.header, rows: sheet.rows, columnWidths: sheet.widths }),
  })
}
