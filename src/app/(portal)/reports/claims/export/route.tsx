import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildClaimsXlsx } from './_format/xlsx'
import { ClaimsPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requirePermission('reports')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()

  const claims = await fetchAllRows((lo, hi) => supabase.from('claims').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }).range(lo, hi))

  const filename = `claims-${dayjs().format('YYYYMMDD')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildClaimsXlsx(claims ?? []) })
  }
  return exportPdfResponse({ filename, element: <ClaimsPdf rows={claims ?? []} /> })
}
