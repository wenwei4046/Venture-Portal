import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoaAccount, GlLine } from '@/lib/gl-reports'
import type { User } from '@/types'
import { withActions } from '@/test/with-actions'

// 2026-10-24 — a month-by-month row opened (the user: "Monthly 用 A：点科目整行，先列每个月，再点月份看明细"):
// its lines over the sheet's months, read as the report reads them — the P&L with inter-billing eliminated when
// every segment is shown, the cash with the bridge for one segment.

const fx = vi.hoisted(() => {
  const ACCOUNTS: CoaAccount[] = [
    { code: '3000', name: 'Bank', type: 'asset', parent_code: null, cash_flow_category: 'operating' },
    { code: '3033', name: 'AR - Carres', type: 'asset', parent_code: null, cash_flow_category: 'operating' },
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
  ]
  return { ACCOUNTS, LINES }
})
const mocks = vi.hoisted(() => ({ elim: vi.fn(), bridge: vi.fn() }))
vi.mock('@/lib/gl-reports', async (orig) => ({
  ...(await orig<object>()),
  fetchAllJournalLines: async () => fx.LINES,
  fetchCoaAccounts: async () => fx.ACCOUNTS,
  fetchGlRefs: async () => ({ invoices: new Map(), voucherPayees: new Map() }),
}))
vi.mock('@/lib/consolidation', async (orig) => ({ ...(await orig<object>()), fetchInterBillingElimination: mocks.elim }))
vi.mock('@/lib/inter-billing-cash-flow', async (orig) => ({ ...(await orig<object>()), fetchInterBillingCashFlow: mocks.bridge }))

import { readMonthlyDrill, type MonthlyDrillAsk } from './drill-reads'

const supabase = { rpc: async () => ({ data: ['3000'], error: null }) } as never
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] }) as unknown as User
const read = (ask: Partial<MonthlyDrillAsk>) =>
  readMonthlyDrill(supabase, FINANCE, { report: 'pnl', segment: 'marketing', from: '2026-09', to: '2026-10', code: '9087', side: null, ...ask })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.elim.mockResolvedValue({ internalInvoiceIds: new Set(['int-1']), interBillingCodes: new Set() })
  mocks.bridge.mockResolvedValue({ lines: [] })
})

describe('a P&L row opened', () => {
  it('reads the segment’s lines over the months asked, each with its debit, credit and other side', async () => {
    const lines = await read({})
    expect(lines.map((t) => t.date)).toEqual(['2026-09-12', '2026-10-04', '2026-10-20'])
    expect(lines.map((t) => t.debit)).toEqual([200, 150, 50])
    expect(lines[0]).toMatchObject({ key: 'pnl:9087:t0', ref: 'JE-e2', credit: 0, otherSide: '3000 · Bank', value: 200 })
    // One segment is never the consolidated view: nothing is eliminated.
    expect(mocks.elim).not.toHaveBeenCalled()
  })

  it('reads every segment with inter-billing eliminated, as the consolidated P&L does', async () => {
    const lines = await read({ segment: '' })
    expect(mocks.elim).toHaveBeenCalledTimes(1)
    expect(lines.map((t) => t.date)).toEqual(['2026-09-12', '2026-10-04', '2026-10-15'])
  })
})

describe('a cash row opened', () => {
  it('reads its side’s cash lines oldest first, with the bridge for one segment', async () => {
    const lines = await read({ report: 'cash-flow', from: '2026-08', side: 'out' })
    expect(mocks.bridge).toHaveBeenCalledTimes(1)
    // The recharge moved no cash.
    expect(lines.map((t) => [t.date, t.debit, t.otherSide])).toEqual([
      ['2026-08-10', 100, '3000 · Bank'],
      ['2026-09-12', 200, '3000 · Bank'],
      ['2026-10-04', 150, '3000 · Bank'],
    ])
    expect(await read({ report: 'cash-flow', side: 'in' })).toEqual([])
  })

  it('leaves the bridge out when every segment is shown', async () => {
    await read({ report: 'cash-flow', segment: '', side: 'out' })
    expect(mocks.bridge).not.toHaveBeenCalled()
  })
})

describe('an ask that names no real row', () => {
  it('reads nothing', async () => {
    expect(await read({ from: '2026-11' })).toEqual([])
    expect(await read({ to: 'Oct' })).toEqual([])
    expect(await read({ code: '' })).toEqual([])
    expect(await read({ report: 'cash-flow', side: null })).toEqual([])
  })
})
