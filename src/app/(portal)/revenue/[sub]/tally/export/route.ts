import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { exportXlsxResponse } from '@/lib/export/response'
import { buildTallyXlsx } from '@/lib/export/tally-xlsx'
import { requireSubDepartment } from '../../../_lib/sub-departments'
import { loadCutoverOrNone } from '../../../_lib/erp-feed-month'
import { loadTallyMonth } from '../../../_lib/tally'

/**
 * Comm Cal › Tally's Export (2026-11-12) — `/revenue/<sub>/tally/export?month=YYYY-MM`:
 * one month whole, as an Excel workbook — every bill Houzs pays in it (its
 * deposit reached, by its SO date), every bill we pay salespeople in it (its
 * closes', or waiting for them), each brand on both sides, the bills the two
 * sides pay apart and the ones under their deposit, which neither pays.
 * Read-only: the page's own reads, under the viewer's session. No page lives
 * at `/tally` — the Tally is Comm Cal's `?tab=tally`.
 */

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ sub: string }>
}

export async function GET(req: Request, { params }: Params): Promise<Response> {
  // The page's own gate (its tables are read under Revenue · View), then Export.
  await requirePermission('revenue')
  await requireActionOn('/revenue/[sub]', 'revenue', 'export')
  const { sub } = await params
  const month = new URL(req.url).searchParams.get('month') ?? ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Response('Not found', { status: 404 })

  const subDept = await requireSubDepartment(sub, 'comm_cal')
  const db = (await createClient()) as unknown as SupabaseClient

  const [batches, cutover] = await Promise.all([
    db.from('sales_import_batches').select('period_month').eq('sub_department_id', subDept.id).eq('status', 'committed')
      .then(({ data, error }) => {
        if (error) throw new Error(`Could not read the months: ${error.message}`)
        return (data ?? []) as Array<{ period_month: string }>
      }),
    loadCutoverOrNone(db, subDept.id),
  ])

  const view = await loadTallyMonth(db, subDept, batches.map(b => b.period_month), cutover?.firstPaidMonth ?? null, `${month}-01`)
  if (!view) return new Response('This month has nothing to tally.', { status: 404 })

  return exportXlsxResponse({
    filename: `revenue-${subDept.slug}-${month}-tally`,
    buffer: buildTallyXlsx({ title: `Revenue Team · ${subDept.name}`, month: view.month, commission: view.commission }),
  })
}
