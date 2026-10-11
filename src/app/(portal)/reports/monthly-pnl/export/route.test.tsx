import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-09 — the Monthly P&L's Excel / PDF follow the page's From – To (the
// Finance revamp handoff): the months from From, Accumulated over them.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), exportXlsxResponse: vi.fn(), buildMatrixXlsx: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/gl-reports', () => ({ fetchAllJournalLines: async () => [], fetchCoaAccounts: async () => [] }))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: async () => null, eliminateInterBilling: (l: unknown) => l }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/pnl-custom', () => ({
  buildPnlAccounts: () => ({
    columns: [
      { key: 'acc', label: 'Accumulated' },
      { key: '2026-10', label: 'Oct 2026' },
      { key: '2026-09', label: 'Sep 2026' },
      { key: '2026-08', label: 'Aug 2026' },
    ],
    accounts: [],
    salesByColumn: [60, 30, 20, 10],
  }),
  buildCustomPnlRows: () => [{ key: 'NET_INCOME', label: 'Net', depth: 0, kind: 'subtotal', values: [6, 3, 2, 1] }],
  defaultPnlLayout: () => ({ categories: [] }),
}))
vi.mock('@/lib/export/response', () => ({ exportXlsxResponse: mocks.exportXlsxResponse, exportPdfResponse: vi.fn() }))
vi.mock('@/lib/export/monthly-matrix-export', () => ({ buildMatrixXlsx: mocks.buildMatrixXlsx }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
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
  })
})
