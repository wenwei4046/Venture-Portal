import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-10 — the Repayment Schedule's Export (the user's Claude Design
// handoff; user: 做完他): the month's two due tables as one spreadsheet — "Due
// to collect", then "Due to pay" — each row as the page shows it (its terms,
// type, principal, interest, total due, what came in or went out, what is
// short: in brackets, "clear" when nothing is), each side closed by its Total.

const mocks = vi.hoisted(() => ({
  requireActionOn: vi.fn(),
  createClient: vi.fn(),
  load: vi.fn(),
  exportXlsxResponse: vi.fn(),
  buildXlsxBuffer: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('../_lib/schedule-data', () => ({ loadRepaymentSchedule: mocks.load }))
vi.mock('@/lib/export/response', () => ({ exportXlsxResponse: mocks.exportXlsxResponse }))
vi.mock('@/lib/export/excel', () => ({ buildXlsxBuffer: mocks.buildXlsxBuffer }))

import { GET } from './route'

const SCHEDULE = {
  currentYM: '2026-09',
  isCurrentMonth: false,
  today: '2026-10-10',
  collectRows: [
    { key: 'l1', counterparty: 'HK', detail: 'RM 120,000.00 @ 1.000%/mo · 12mo · 8 left', principalDue: 10000, interestDue: 1200, totalDue: 11200, done: false, received: 0, source: 'HC' },
    { key: 'l2', counterparty: 'HC', detail: 'RM 60,000.00 @ 2.000%/mo · 6mo · 3 left', principalDue: 10000, interestDue: 1200, totalDue: 11200, done: true, received: 11200 },
  ],
  collectMin: [{ key: 'l9', counterparty: 'HD', detail: 'RM 300,000.00 @ 2.000%/mo', due: 6000, paid: 5000, shortfall: 1000, met: false }],
  collectCompound: [{ key: 'l4', counterparty: 'HM', detail: 'RM 100,000.00 @ 1.500%/mo · compounding since 2026-07', balance: 104567.84, accrued: 4567.84, thisMonthInterest: 1568.52, received: 0 }],
  collectNoTerm: [{ key: 'l5', counterparty: 'HB', detail: 'RM 50,000.00 @ 1.000%/mo · undecided', outstanding: 50000, monthlyInterest: 500, received: 0 }],
  repayRows: [
    { key: 'f2', counterparty: 'CONTS', detail: 'RM 300,000.00 @ 2.000%/mo · pending HV-PV-202609-0040', principalDue: 50000, interestDue: 6000, totalDue: 56000, done: false, received: 0, pending: true },
  ],
  repayMin: [],
  repayCompound: [],
  repayNoTerm: [],
  events: [],
}

const req = (qs = '') => new Request(`http://localhost/repayment-schedule/export${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
  mocks.createClient.mockResolvedValue({})
  mocks.load.mockResolvedValue(SCHEDULE)
  mocks.buildXlsxBuffer.mockImplementation((args: unknown) => args)
  mocks.exportXlsxResponse.mockReturnValue(new Response('xlsx'))
})

describe('the Repayment Schedule export', () => {
  it('is for whoever may read and export the treasury, for the month asked', async () => {
    await GET(req('?month=2026-09'))
    // Export, as every treasury export; View, which the deals' terms history asks.
    expect(mocks.requireActionOn).toHaveBeenCalledWith(expect.any(String), 'treasury', 'view')
    expect(mocks.requireActionOn).toHaveBeenCalledWith(expect.any(String), 'treasury', 'export')
    expect(mocks.load.mock.calls[0][1]).toBe('2026-09')
  })

  it('lists Due to collect, then Due to pay, each closed by its Total', async () => {
    await GET(req('?month=2026-09'))
    const sheet = mocks.buildXlsxBuffer.mock.calls[0][0] as {
      sheetName: string
      headerRow: string[]
      rows: unknown[][]
      sectionBreaks: Array<{ afterRow: number; title: string }>
    }
    expect(sheet.sheetName).toBe('Repayment Schedule')
    expect(sheet.headerRow).toEqual(['Counterparty', 'Terms', 'Type', 'Principal', 'Interest', 'Total due', 'Received / paid · Sep', 'Short', 'Note'])
    expect(sheet.rows).toEqual([
      ['HK', 'RM 120,000.00 @ 1.000%/mo · 12mo · 8 left', 'principal + interest', 10000, 1200, 11200, null, -11200, 'Source of capital: HC'],
      ['HC', 'RM 60,000.00 @ 2.000%/mo · 6mo · 3 left', 'principal + interest', 10000, 1200, 11200, 11200, 'clear', null],
      ['HD', 'RM 300,000.00 @ 2.000%/mo', 'min interest', 0, 6000, 6000, 5000, -1000, null],
      ['HM', 'RM 100,000.00 @ 1.500%/mo · compounding since 2026-07', 'rolled interest', 0, 1568.52, 1568.52, null, null, null],
      ['HB', 'RM 50,000.00 @ 1.000%/mo · undecided', 'open-ended', 0, 500, 500, null, null, null],
      ['Total', '5 items', null, 20000, 10468.52, 30468.52, 16200, -12200, null],
      ['CONTS', 'RM 300,000.00 @ 2.000%/mo · pending HV-PV-202609-0040', 'principal + interest', 50000, 6000, 56000, null, -56000, 'Repayment PV awaiting approval'],
      ['Total', '1 item', null, 50000, 6000, 56000, 0, -56000, null],
    ])
    expect(sheet.sectionBreaks).toEqual([
      { afterRow: 0, title: 'Due to collect · September 2026' },
      { afterRow: 6, title: 'Due to pay · September 2026' },
    ])
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('repayment-schedule-2026-09')
  })

  it('reads this month when none is asked', async () => {
    await GET(req())
    expect(mocks.load.mock.calls[0][1]).toBeNull()
  })
})
