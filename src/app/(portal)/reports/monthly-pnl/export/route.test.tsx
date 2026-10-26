import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-09 — the Monthly P&L's Excel / PDF follow the page's From – To (the
// Finance revamp handoff): the months from From, Accumulated over them.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), exportXlsxResponse: vi.fn(), buildMatrixXlsx: vi.fn(), buildPnlAccounts: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/gl-reports', () => ({ fetchAllJournalLines: async () => [], fetchCoaAccounts: async () => [] }))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: async () => null, eliminateInterBilling: (l: unknown) => l }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/pnl-custom', () => ({
  buildPnlAccounts: mocks.buildPnlAccounts,
  buildCustomPnlRows: () => [{ key: 'NET_INCOME', label: 'Net', depth: 0, kind: 'subtotal', values: [6, 3, 2, 1] }],
  defaultPnlLayout: () => ({ categories: [] }),
}))
vi.mock('@/lib/export/response', () => ({ exportXlsxResponse: mocks.exportXlsxResponse, exportPdfResponse: vi.fn() }))
vi.mock('@/lib/export/monthly-matrix-export', () => ({ buildMatrixXlsx: mocks.buildMatrixXlsx }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildPnlAccounts.mockReturnValue({
    columns: [
      { key: 'acc', label: 'Accumulated' },
      { key: '2026-10', label: 'Oct 2026' },
      { key: '2026-09', label: 'Sep 2026' },
      { key: '2026-08', label: 'Aug 2026' },
    ],
    accounts: [],
    salesByColumn: [60, 30, 20, 10],
  })
  mocks.requireActionOn.mockResolvedValue({ role: 'finance', permissions: ['reports', 'dept_reports'], actions: { 'reports.view': 'all' } })
  mocks.exportXlsxResponse.mockReturnValue(new Response('xlsx'))
  mocks.buildMatrixXlsx.mockReturnValue(Buffer.from(''))
})

describe('the Monthly P&L export', () => {
  it('cuts the months to From', async () => {
    await GET(new Request('http://localhost/reports/monthly-pnl/export?format=xlsx&period=2026-10&from=2026-09'))
    const [, matrix, base] = mocks.buildMatrixXlsx.mock.calls[0]
    expect(matrix.columns.map((c: { key: string }) => c.key)).toEqual(['acc', '2026-10', '2026-09'])
    expect(matrix.rows[0].values).toEqual([5, 3, 2])
    expect(base).toEqual([50, 30, 20])
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('monthly-pnl-2026-09-2026-10')
  })

  it('keeps the whole year without From', async () => {
    await GET(new Request('http://localhost/reports/monthly-pnl/export?format=xlsx&period=2026-10'))
    const [, matrix] = mocks.buildMatrixXlsx.mock.calls[0]
    expect(matrix.columns).toHaveLength(4)
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('monthly-pnl-2026-10')
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], { year: 2026, throughMonth: 10, segment: undefined })
  })

  // 2026-10-25 — a department's "12 months" reaches back across the year: the months are built from From.
  it('builds from a From before January, as the department’s page shows it', async () => {
    await GET(new Request('http://localhost/reports/monthly-pnl/export?format=xlsx&period=2026-10&from=2025-11&segment=marketing'))
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], { year: 2026, throughMonth: 10, segment: ['marketing'], from: '2025-11' })
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('monthly-pnl-2025-11-2026-10-marketing')
  })

  // 2026-10-17 — as the page: a company-wide reader's alone (the Dept
  // Manager's own-segment export went with the kind).
  it('answers 404 to a reader short of Reports · View at All, and builds nothing', async () => {
    mocks.requireActionOn.mockResolvedValue({ role: 'staff', permissions: ['dept_reports'], actions: { 'dept_reports.export': 'all' } })
    const res = await GET(new Request('http://localhost/reports/monthly-pnl/export?format=xlsx&period=2026-10'))
    expect(res.status).toBe(404)
    expect(mocks.buildMatrixXlsx).not.toHaveBeenCalled()
    expect(mocks.exportXlsxResponse).not.toHaveBeenCalled()
  })
})
