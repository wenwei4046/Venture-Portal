import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

// 2026-10-25 — ④-3b: a project's formal log exported (the user's answers 18 and 21): anybody in Marketing (View), the
// rows the filter in the address keeps, as the handoff's CSV, a formal document or the table. The PDFs' own words are
// lib/marketing/audit-pdf.test.tsx's.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), exportPdfResponse: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
import { AuditDocPdf, AuditTablePdf } from '@/lib/marketing/audit-pdf'
import { GET } from './route'

const P = '7d3e0c1a-2b4f-4a6e-9c8d-1f2e3d4c5b6a'
const LOG = {
  track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick',
  rows: [
    { id: 1, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'created', data: { kind: 'quick' } },
    { id: 2, at: '2026-10-21T09:45:00Z', actor: 'Mei', action: 'submitted', stage: 0, stageName: 'First draft', fromTo: 'SIA', version: 'v1' },
    { id: 3, at: '2026-10-22T01:10:00Z', actor: 'SIA', action: 'correction', stage: 0, stageName: 'First draft', reason: 'Sent at 18:45', corrects: 2 },
  ],
}
const get = (query: string, id = P) => GET(new Request(`http://localhost/marketing/projects/${id}/log?${query}`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'u1', name: 'Mei Ling' })
  mocks.rpc.mockResolvedValue({ data: LOG, error: null })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('a project’s formal log exported', () => {
  it('anybody in Marketing: the handoff’s CSV of the rows the filter keeps — each time whole, on the office’s clock', async () => {
    const res = await get('format=csv&person=Mei&person=SIA&stage=First+draft')
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/marketing/projects/[id]', 'marketing', 'view')
    expect(mocks.rpc).toHaveBeenCalledWith('mkt_project_log', { p_project: P })
    expect([res.headers.get('content-type'), res.headers.get('content-disposition'), res.headers.get('cache-control')])
      .toEqual(['text/csv; charset=utf-8', 'attachment; filename="TSK-CAR-2610-001_audit.csv"', 'no-store, max-age=0'])
    // The byte-order mark first (a reader's text() takes it off).
    expect([...new Uint8Array(await res.clone().arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(await res.text()).toBe([
      '#,Time,Actor,Action,From → To,Reason,Version',
      '2,2026-10-21 17:45,Mei,Submitted,Mei → SIA,—,First draft v1',
      '3,2026-10-22 09:10,SIA,Correction (correction of #2),—,"""Sent at 18:45""",—',
      '',
    ].join('\r\n'))
  })

  it('a formal document by default, the table when asked — the rows shown, of how many, the filter, who and when', async () => {
    await get('person=Mei')
    const doc = mocks.exportPdfResponse.mock.calls[0][0]
    expect([doc.filename, doc.element.type]).toEqual(['TSK-CAR-2610-001_audit', AuditDocPdf])
    expect([doc.element.props.rows.map((r: { no: number }) => r.no), doc.element.props.total, doc.element.props.filter, doc.element.props.by])
      .toEqual([[2], 3, ['Person: Mei'], 'Mei Ling'])
    expect(doc.element.props.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    await get('format=table')
    const table = mocks.exportPdfResponse.mock.calls[1][0]
    expect([table.filename, table.element.type, table.element.props.rows.length, table.element.props.filter]).toEqual(['TSK-CAR-2610-001_audit_table', AuditTablePdf, 3, []])
  })

  it('no such project — nothing read for an id that is not one', async () => {
    expect((await get('format=csv', 'TSK-CAR-2610-001')).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await get('format=csv')).status).toBe(404)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Marketing is not open to your account.' } })
    expect((await get('format=pdf')).status).toBe(404)
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
  })
})
