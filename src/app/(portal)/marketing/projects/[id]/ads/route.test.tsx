import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

// 2026-10-25 — ⑤-3e: an Ads report's PDF for the team (the user, asked whether the report should give a PDF: "can do"):
// anybody in Marketing (View), the report as published — the document's own words are lib/marketing/ads-pdf.test.tsx's.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), exportPdfResponse: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
import { AdsReportPdf } from '@/lib/marketing/ads-pdf'
import { GET } from './route'

const P = '7d3e0c1a-2b4f-4a6e-9c8d-1f2e3d4c5b6a'
const PAGE = {
  today: '2026-11-04', link: true, project: { track: 'TSK-CAR-2610-001', title: 'Raya ads', sub: 'Carres' },
  setup: { ads: [], every: '2w', startsOn: '2026-10-06', figures: ['spendToDate', 'cpl'], targets: { budget: 6000, cpl: 20 } },
  reports: [
    { no: 2, from: '2026-10-20', until: '2026-11-02', values: { spendToDate: 3240, cpl: 18.4 }, targets: { cpl: 20 }, note: 'Two ads paused',
      by: 'Wei Lun', at: '2026-11-03T02:00:00Z', updatedAt: '2026-11-03T17:30:00Z' },
    { no: 1, from: '2026-10-06', until: '2026-10-19', values: { spendToDate: 1410 }, targets: {}, note: null, by: 'Wei Lun', at: '2026-10-20T02:00:00Z' },
  ],
}
const get = (query: string, id = P) => GET(new Request(`http://localhost/marketing/projects/${id}/ads?${query}`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'u1', name: 'Mei Ling' })
  mocks.rpc.mockResolvedValue({ data: PAGE, error: null })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('an Ads report’s PDF for the team', () => {
  it('anybody in Marketing: the report asked for, as published — its project, its setup’s figures, the day it was published last', async () => {
    await get('no=2')
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/marketing/projects/[id]', 'marketing', 'view')
    expect(mocks.rpc).toHaveBeenCalledWith('mkt_ads_page', { p_project: P })
    const doc = mocks.exportPdfResponse.mock.calls[0][0]
    expect([doc.filename, doc.element.type]).toEqual(['TSK-CAR-2610-001_ads-report-2', AdsReportPdf])
    const p = doc.element.props
    expect([p.sub, p.title, p.track, p.every, p.figures, p.report.no, p.report.note, p.published])
      .toEqual(['Carres', 'Raya ads', 'TSK-CAR-2610-001', '2w', ['spendToDate', 'cpl'], 2, 'Two ads paused', '4 Nov 2026'])
  })

  it('none for a report not published, an id or a number that is not one, a project it cannot read', async () => {
    for (const q of ['no=3', 'no=0', 'no=x', '']) expect((await get(q)).status).toBe(404)
    expect((await get('no=1', 'TSK-CAR-2610-001')).status).toBe(404)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Marketing is not open to your account.' } })
    expect((await get('no=1')).status).toBe(404)
    mocks.rpc.mockResolvedValueOnce({ data: { ...PAGE, setup: null }, error: null })
    expect((await get('no=1')).status).toBe(404)
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
  })
})
