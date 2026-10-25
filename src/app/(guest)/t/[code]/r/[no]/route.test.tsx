import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

// 2026-10-25 — ⑤-3e: an Ads report's PDF on the PIC's link (the user: "can do"; the handoff's PIC Link writes *PDF* at
// each report's right) — the link's code its only gate, drawn from what the link's page reads.

const mocks = vi.hoisted(() => ({ readPicPage: vi.fn(), exportPdfResponse: vi.fn() }))
vi.mock('@/lib/marketing/pic-server', () => ({ readPicPage: mocks.readPicPage }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
import { AdsReportPdf } from '@/lib/marketing/ads-pdf'
import { GET } from './route'

const CODE = '0123456789abcdef0123456789abcdef'
const PAGE = {
  sub: 'Carres', title: 'Raya ads', track: 'TSK-CAR-2610-001',
  ads: {
    every: '1m', figures: ['spend', 'leads'],
    reports: [{ no: 1, from: '2026-10-01', until: '2026-10-31', values: { spend: 900, leads: 40 }, targets: {}, note: null, at: '2026-11-02T03:00:00Z' }],
  },
}
const get = (code: string, no: string) => GET(new Request(`http://localhost/t/${code}/r/${no}`), { params: Promise.resolve({ code, no }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readPicPage.mockResolvedValue(PAGE)
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('an Ads report’s PDF on the PIC’s link', () => {
  it('the report on the link, as the link reads it', async () => {
    await get(CODE.toUpperCase(), '1')
    expect(mocks.readPicPage).toHaveBeenCalledWith(CODE)
    const doc = mocks.exportPdfResponse.mock.calls[0][0]
    expect([doc.filename, doc.element.type]).toEqual(['TSK-CAR-2610-001_ads-report-1', AdsReportPdf])
    expect([doc.element.props.sub, doc.element.props.every, doc.element.props.report.no, doc.element.props.published]).toEqual(['Carres', '1m', 1, '2 Nov 2026'])
  })

  it('closed for a code or a number that is not one, a closed link, a report not on it — nothing read for a bad code', async () => {
    for (const [code, no] of [['nope', '1'], [CODE, '0'], [CODE, 'x'], [CODE, '01']]) {
      const res = await get(code, no)
      expect([res.status, await res.text()]).toEqual([404, 'This link is closed.'])
    }
    expect(mocks.readPicPage).not.toHaveBeenCalled()
    expect((await get(CODE, '2')).status).toBe(404)
    mocks.readPicPage.mockResolvedValueOnce(null)
    expect((await get(CODE, '1')).status).toBe(404)
    mocks.readPicPage.mockResolvedValueOnce({ ...PAGE, ads: null })
    expect((await get(CODE, '1')).status).toBe(404)
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
  })
})
