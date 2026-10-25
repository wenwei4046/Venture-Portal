import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { adsPageFromRow, adsPdfName, publishedWords } from '@/lib/marketing/ads'
import { AdsReportPdf } from '@/lib/marketing/ads-pdf'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An Ads report's PDF for the team (2026-10-25, Marketing ⑤-3e — the user, asked whether the report should give a PDF:
 * "can do"): the report as published, the document the PIC reads from their link (lib/marketing/ads-pdf.tsx), read as
 * the viewer reads the project's page (mkt_ads_page asks Marketing · View itself). `?no=` says which. A GET route, the
 * portal's file downloads' way: it writes nothing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'view')
  const { id } = await params
  const no = Number(new URL(req.url).searchParams.get('no'))
  const none = () => new Response('That report is not there.', { status: 404 })
  if (!UUID.test(id) || !Number.isInteger(no) || no < 1) return none()
  // Marketing's functions are not in the generated types (lib/marketing/actions.ts reads them the same way).
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('mkt_ads_page', { p_project: id })
  const page = error ? null : adsPageFromRow(data)
  const report = page?.reports.find(r => r.no === no)
  if (!page?.setup || !page.project || !report) return none()
  return exportPdfResponse({
    filename: adsPdfName(page.project.track, no),
    element: (
      <AdsReportPdf sub={page.project.sub} title={page.project.title} track={page.project.track} every={page.setup.every}
        figures={page.setup.figures} report={report} published={publishedWords(report.updatedAt ?? report.at)} />
    ),
  })
}
