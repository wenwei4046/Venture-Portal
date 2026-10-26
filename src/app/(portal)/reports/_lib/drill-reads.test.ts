import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoaAccount, GlLine } from '@/lib/gl-reports'
import type { User } from '@/types'
import { withActions } from '@/test/with-actions'

// 2026-10-24 — a month-by-month row opened (the user: "monthly 也要能点开"); 2026-10-26 — its lines as rows of the
// sheet, and L4 opening every row in one read: each row's lines over the sheet's months, read as the report reads
// them — the P&L with inter-billing eliminated when every segment is shown, the cash with the bridge for one segment —
// and signed as its row reads (the P&L credit-positive, the cash as it moved).

const fx = vi.hoisted(() => {
  const ACCOUNTS: CoaAccount[] = [
    { code: '3000', name: 'Bank', type: 'asset', parent_code: null, cash_flow_category: 'operating' },
    { code: '3033', name: 'AR - Carres', type: 'asset', parent_code: null, cash_flow_category: 'operating' },
    { code: '5017', name: 'Social Media', type: 'revenue', parent_code: null, cash_flow_category: 'operating' },
    { code: '9087', name: 'Website & Software', type: 'expense', parent_code: null, cash_flow_category: 'operating' },
  ]
  let seq = 0
  const entry = (date: string, segment: string, legs: Array<[string, number, number]>, ref?: { type: string; id: string }): GlLine[] => {
    const id = `e${++seq}`
    return legs.map(([code, debit, credit]) => ({
      account_code: code, debit, credit, description: `line ${id}`, entry_id: id, date, entry_no: `JE-${id}`,
      entry_description: null, segment, ref_type: ref?.type ?? null, ref_id: ref?.id ?? null,
    }))
  }
  const LINES: GlLine[] = [
    ...entry('2026-08-10', 'marketing', [['9087', 100, 0], ['3000', 0, 100]]),
    ...entry('2026-09-12', 'marketing', [['9087', 200, 0], ['3000', 0, 200]]),
    ...entry('2026-10-04', 'marketing', [['9087', 150, 0], ['3000', 0, 150]]),
    ...entry('2026-10-15', 'finance', [['9087', 250, 0], ['3000', 0, 250]]),
    // An internal recharge: no cash, and gone from the consolidated P&L.
    ...entry('2026-10-20', 'marketing', [['9087', 50, 0], ['3033', 0, 50]], { type: 'invoice', id: 'int-1' }),
    // A sale billed to Carres.
    ...entry('2026-10-08', 'marketing', [['3033', 3000, 0], ['5017', 0, 3000]], { type: 'invoice', id: 'inv-9' }),
  ]
  return { ACCOUNTS, LINES }
})
const mocks = vi.hoisted(() => ({ elim: vi.fn(), bridge: vi.fn(), journal: vi.fn() }))
vi.mock('@/lib/gl-reports', async (orig) => ({
  ...(await orig<object>()),
  fetchAllJournalLines: mocks.journal,
  fetchCoaAccounts: async () => fx.ACCOUNTS,
  fetchGlRefs: async () => ({ invoices: new Map(), voucherPayees: new Map() }),
}))
vi.mock('@/lib/consolidation', async (orig) => ({ ...(await orig<object>()), fetchInterBillingElimination: mocks.elim }))
vi.mock('@/lib/inter-billing-cash-flow', async (orig) => ({ ...(await orig<object>()), fetchInterBillingCashFlow: mocks.bridge }))

import { readMonthlyDrill, type MonthlyDrillAsk } from './drill-reads'

const supabase = { rpc: async () => ({ data: ['3000'], error: null }) } as never
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] }) as unknown as User
const read = (ask: Partial<MonthlyDrillAsk>) =>
  readMonthlyDrill(supabase, FINANCE, { report: 'pnl', segment: 'marketing', from: '2026-09', to: '2026-10', rows: [{ code: '9087', side: null }], ...ask })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.journal.mockResolvedValue(fx.LINES)
  mocks.elim.mockResolvedValue({ internalInvoiceIds: new Set(['int-1']), interBillingCodes: new Set() })
  mocks.bridge.mockResolvedValue({ lines: [] })
})

describe('a P&L row opened', () => {
  it('reads the segment’s lines over the months asked, signed as the row reads, each with its debit, credit and other side', async () => {
    const lines = (await read({}))['pnl:9087']
    expect(lines.map((t) => t.date)).toEqual(['2026-09-12', '2026-10-04', '2026-10-20'])
    expect(lines.map((t) => t.debit)).toEqual([200, 150, 50])
    // The P&L reads a cost negative: its lines with it.
    expect(lines.map((t) => t.value)).toEqual([-200, -150, -50])
    expect(lines[0]).toMatchObject({ key: 'pnl:9087:t0', ref: 'JE-e2', credit: 0, otherSide: '3000 · Bank' })
    // One segment is never the consolidated view: nothing is eliminated.
    expect(mocks.elim).not.toHaveBeenCalled()
  })

  it('reads every row asked in one read — L4 — a revenue line positive, a row of no P&L account empty', async () => {
    const answer = await read({ rows: [{ code: '9087', side: null }, { code: '5017', side: null }, { code: '3033', side: null }] })
    expect(mocks.journal).toHaveBeenCalledTimes(1)
    expect(Object.keys(answer).sort()).toEqual(['pnl:3033', 'pnl:5017', 'pnl:9087'])
    expect(answer['pnl:5017'].map((t) => [t.date, t.value, t.otherSide])).toEqual([['2026-10-08', 3000, '3033 · AR - Carres']])
    expect(answer['pnl:3033']).toEqual([])
  })

  it('reads every segment with inter-billing eliminated, as the consolidated P&L does', async () => {
    const lines = (await read({ segment: '' }))['pnl:9087']
    expect(mocks.elim).toHaveBeenCalledTimes(1)
    expect(lines.map((t) => t.date)).toEqual(['2026-09-12', '2026-10-04', '2026-10-15'])
  })
})

describe('a cash row opened', () => {
  it('reads its side’s cash lines oldest first, as the cash moved, with the bridge for one segment', async () => {
    const answer = await read({ report: 'cash-flow', from: '2026-08', rows: [{ code: '9087', side: 'out' }, { code: '9087', side: 'in' }] })
    expect(mocks.bridge).toHaveBeenCalledTimes(1)
    // The recharge moved no cash.
    expect(answer['out:9087'].map((t) => [t.date, t.debit, t.value, t.otherSide])).toEqual([
      ['2026-08-10', 100, -100, '3000 · Bank'],
      ['2026-09-12', 200, -200, '3000 · Bank'],
      ['2026-10-04', 150, -150, '3000 · Bank'],
    ])
    expect(answer['in:9087']).toEqual([])
  })

  it('leaves the bridge out when every segment is shown', async () => {
    await read({ report: 'cash-flow', segment: '', rows: [{ code: '9087', side: 'out' }] })
    expect(mocks.bridge).not.toHaveBeenCalled()
  })
})

describe('an ask that names no real row', () => {
  it('reads nothing', async () => {
    expect(await read({ from: '2026-11' })).toEqual({ 'pnl:9087': [] })
    expect(await read({ to: 'Oct' })).toEqual({ 'pnl:9087': [] })
    expect(await read({ rows: [{ code: '', side: null }] })).toEqual({})
    // A cash row names its side; a P&L row has none.
    expect(await read({ report: 'cash-flow', rows: [{ code: '9087', side: null }] })).toEqual({})
    expect(await read({ rows: [{ code: '9087', side: 'out' }] })).toEqual({})
    expect(mocks.journal).not.toHaveBeenCalled()
  })
})
