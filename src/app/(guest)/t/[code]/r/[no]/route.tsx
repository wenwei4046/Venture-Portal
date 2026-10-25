import { exportPdfResponse } from '@/lib/export/response'
import { adsPdfName, publishedWords } from '@/lib/marketing/ads'
import { AdsReportPdf } from '@/lib/marketing/ads-pdf'
import { isPicCode } from '@/lib/marketing/pic'
import { readPicPage } from '@/lib/marketing/pic-server'

/**
 * GET /t/<code>/r/<no> — an Ads report's PDF on the PIC's link (2026-10-25, Marketing ⑤-3e — the user: "can do"; the
 * handoff's PIC Link writes *PDF* at each report's right). A read-only file download (CLAUDE.md › Coding Conventions)
 * whose gate is the link's code: drawn from what the link's page reads (mkt_pic_page, granted to anon by name, checking the
 * code) — the report as published, never who published it. A closed link, or a report not on it: "This link is closed."
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const closed = () =>
  new Response('This link is closed.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(_request: Request, { params }: { params: Promise<{ code: string; no: string }> }) {
  const { code, no } = await params
  if (!isPicCode(code) || !/^[1-9]\d{0,3}$/.test(no)) return closed()
  const page = await readPicPage(code.toLowerCase())
  const report = page?.ads?.reports.find(r => r.no === Number(no))
  if (!page?.ads || !report) return closed()
  return exportPdfResponse({
    filename: adsPdfName(page.track, report.no),
    element: (
      <AdsReportPdf sub={page.sub} title={page.title} track={page.track} every={page.ads.every} figures={page.ads.figures}
        report={report} published={publishedWords(report.at)} />
    ),
  })
}
