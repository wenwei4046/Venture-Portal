import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-09 — the General Ledger's Excel / PDF (the user's Claude Design
// handoff puts them in the head for whatever is picked): one account as
// before, several (?codes=), or — none picked — every account with activity
// in the period (all with ?showZero=1), each account's block in turn.

const mocks = vi.hoisted(() => ({
  requireAction: vi.fn(),
  createClient: vi.fn(),
  fetchLedger: vi.fn(),
  fetchLedgers: vi.fn(),
  exportXlsxResponse: vi.fn(),
  exportPdfResponse: vi.fn(),
  buildXlsxBuffer: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireAction: mocks.requireAction }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/cfo-reports', () => ({ fetchLedger: mocks.fetchLedger, fetchLedgers: mocks.fetchLedgers }))
vi.mock('@/lib/export/response', () => ({ exportXlsxResponse: mocks.exportXlsxResponse, exportPdfResponse: mocks.exportPdfResponse }))
vi.mock('@/lib/export/excel', () => ({ buildXlsxBuffer: mocks.buildXlsxBuffer }))

import { GET } from './route'

const ledger = (code: string, name: string, lines: number, opening = 0) => ({
  code, accountName: name, accountType: 'asset', from: '2026-10-01', to: '2026-10-31',
  openingBalance: opening, closingBalance: opening, periodTotals: { debit: 0, credit: 0 },
  lines: [
    { entryDate: '', entryNo: '', description: 'BALANCE B/F', accountDesc: '', journalType: '', ref: '', segment: '', debit: 0, credit: 0, runningBalance: opening },
    ...Array.from({ length: lines }, (_, i) => ({
      entryDate: '2026-10-05', entryNo: `JV-${i}`, description: `Line ${i}`, accountDesc: `${code} ${name}`, journalType: 'JV', ref: `JV-${i}`, segment: 'corporate', debit: 100, credit: 0, runningBalance: opening + 100 * (i + 1),
    })),
  ],
})

type Sheet = { rows: unknown[][] }
const firstCells = () => (mocks.buildXlsxBuffer.mock.calls[0][0] as Sheet).rows.map((r) => r[0])
const get = (query: string) => GET(new Request(`http://localhost/reports/ledger/export?from=2026-10-01&to=2026-10-31&${query}`))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({})
  mocks.buildXlsxBuffer.mockImplementation((args: unknown) => args)
  mocks.exportXlsxResponse.mockReturnValue(new Response('xlsx'))
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('the ledger export', () => {
  it('still exports one account by ?code=', async () => {
    mocks.fetchLedger.mockResolvedValue(ledger('1010', 'Cash at Bank', 1))
    await get('format=xlsx&code=1010')
    expect(mocks.fetchLedger).toHaveBeenCalledWith({}, { code: '1010', from: '2026-10-01', to: '2026-10-31' })
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('ledger-1010-2026-10-01-2026-10-31')
  })

  it('exports the accounts picked, each block in turn', async () => {
    mocks.fetchLedgers.mockResolvedValue([ledger('1010', 'Cash at Bank', 1), ledger('2010', 'Loans Receivable', 2)])
    await get('format=xlsx&codes=1010,2010')
    expect(mocks.fetchLedgers).toHaveBeenCalledWith({}, { codes: ['1010', '2010'], from: '2026-10-01', to: '2026-10-31' })
    const cells = firstCells()
    expect(cells.filter((c) => typeof c === 'string' && c.startsWith('Acc. No.:'))).toEqual(['Acc. No.: 1010 · Cash at Bank', 'Acc. No.: 2010 · Loans Receivable'])
    expect(cells.filter((c) => typeof c === 'string' && c.endsWith('— total'))).toHaveLength(2)
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('ledger-1010_2010-2026-10-01-2026-10-31')
  })

  it('exports every account with activity when none is picked', async () => {
    mocks.fetchLedgers.mockResolvedValue([ledger('1010', 'Cash at Bank', 1), ledger('1999', 'Dormant', 0), ledger('2010', 'Loans Receivable', 0, 500)])
    await get('format=xlsx')
    expect(mocks.fetchLedgers).toHaveBeenCalledWith({}, { codes: [], from: '2026-10-01', to: '2026-10-31' })
    expect(firstCells().filter((c) => typeof c === 'string' && c.startsWith('Acc. No.:'))).toEqual(['Acc. No.: 1010 · Cash at Bank', 'Acc. No.: 2010 · Loans Receivable'])
    expect(mocks.exportXlsxResponse.mock.calls[0][0].filename).toBe('ledger-all-2026-10-01-2026-10-31')
  })

  it('keeps the dormant ones with showZero, and makes a PDF of them', async () => {
    mocks.fetchLedgers.mockResolvedValue([ledger('1010', 'Cash at Bank', 1), ledger('1999', 'Dormant', 0)])
    await get('format=pdf&showZero=1')
    const element = mocks.exportPdfResponse.mock.calls[0][0].element as { props: { ledgers: Array<{ code: string }> } }
    expect(element.props.ledgers.map((l) => l.code)).toEqual(['1010', '1999'])
  })
})
