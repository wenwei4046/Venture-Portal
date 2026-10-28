import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { reportsCompanyWide } from '@/lib/surfaces'
import { monthlyCashFlowFile, monthlyFileAsk } from '../../_lib/monthly-files'

export async function GET(req: Request) {
  const user = await requireActionOn('/reports/monthly-cash-flow', 'dept_reports', 'export')
  // As the page: for whoever reads the reports company-wide (the Dept Manager's
  // own-segment export went with the kind, 2026-10-17).
  if (!reportsCompanyWide(user)) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(req.url)
  return monthlyCashFlowFile(await createClient(), { ...monthlyFileAsk(url), segment: url.searchParams.get('segment') ?? '' })
}
