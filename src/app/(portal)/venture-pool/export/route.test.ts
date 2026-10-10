import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-09 — the Venture Pool's Export (the user's Claude Design handoff):
// the whole pool ledger as a spreadsheet, oldest first, with In / Out and the
// running balance after each line.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), exportXlsxResponse: vi.fn(), buildXlsxBuffer: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportXlsxResponse: mocks.exportXlsxResponse }))
vi.mock('@/lib/export/excel', () => ({ buildXlsxBuffer: mocks.buildXlsxBuffer }))

import { GET } from './route'

type Row = Record<string, unknown>
const line = (id: string, date: string, debit: number, credit: number, description: string, reference_type: string) => ({
  id, debit, credit, description, account_code: '1010',
  journal_entries: { transaction_date: date, description, reference_type, segment: 'treasury', is_reversed: false },
})
const LINES: Row[] = [
  line('j3', '2026-10-03', 0, 20000, 'Top-up to Dept Pool — IT', 'payment_voucher'),
  line('j1', '2026-08-12', 300000, 0, 'Fund source received', 'fund_source'),
  line('j2', '2026-09-30', 0, 8745, 'HC fund source — Sep interest', 'fund_source_repayment'),
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['venture_pool'] })
  mocks.buildXlsxBuffer.mockImplementation((args: unknown) => args)
  mocks.exportXlsxResponse.mockReturnValue(new Response('xlsx'))
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      let rows: Row[] = table === 'journal_lines' ? [...LINES] : [{ gl_account_code: '1010', status: 'active' }]
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q
      q.range = (lo: number, hi: number) => ((rows = rows.slice(lo, hi + 1)), q)
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej)
      return q
    },
  })
})

describe('the Venture Pool export', () => {
  it('is for whoever reads the Venture Pool', async () => {
    await GET()
    expect(mocks.requirePermission).toHaveBeenCalledWith('venture_pool')
  })

  it('lists the whole ledger oldest first with the running balance', async () => {
    await GET()
    const sheet = mocks.buildXlsxBuffer.mock.calls[0][0] as { headerRow: string[]; rows: unknown[][] }
    expect(sheet.headerRow).toEqual(['Date', 'Type', 'Direction', 'Description', 'In', 'Out', 'Balance'])
    expect(sheet.rows).toEqual([
      ['2026-08-12', 'Fund source', 'in', 'Fund source received', 300000, null, 300000],
      ['2026-09-30', 'Fund source repayment', 'out', 'HC fund source — Sep interest', null, 8745, 291255],
      ['2026-10-03', 'Payment voucher', 'out', 'Top-up to Dept Pool — IT', null, 20000, 271255],
    ])
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toMatch(/^venture-pool-ledger-\d{4}-\d{2}-\d{2}$/)
  })
})
