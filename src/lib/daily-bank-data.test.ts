import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { inTimeZoneAsync } from '@/test/time-zone'

vi.mock('@/lib/paginate', () => ({
  fetchAllRows: async (page: (lo: number, hi: number) => PromiseLike<{ data: unknown[] | null }>) =>
    (await page(0, 999)).data ?? [],
}))

import { fetchDailyBank } from './daily-bank-data'

// A day in the past, so the today-only pool overlay stays out of the way.
const DAY = '2026-01-15'
const SUBMITTED = '2026-01-10T02:00:00+00:00'

const VOUCHERS = [
  { id: 'v-tnb', voucher_no: 'HV-PV-202601-0040', payee_name: 'TNB', description: 'Electricity', amount: 1200, reference_type: null },
  { id: 'v-aina', voucher_no: 'HV-PV-202601-0041', payee_name: 'Aina binti Example', description: 'Payroll disbursement Dec 2025 — Aina binti Example', amount: 3200.5, reference_type: 'payroll_disbursement' },
  { id: 'v-bala', voucher_no: 'HV-PV-202601-0042', payee_name: 'Bala Sample', description: 'Payroll disbursement Dec 2025 — Bala Sample', amount: 4100.25, reference_type: 'payroll_disbursement' },
].map((v) => ({ ...v, bank_account_id: 'bank-1', direction: 'debit', status: 'pending_approval', updated_at: SUBMITTED }))

const SOURCES = [
  { voucher_id: 'v-tnb', pool: 'venture_pool', amount: 1200, role: null },
  { voucher_id: 'v-aina', pool: 'dept_pool_hr', amount: 3200.5, role: null },
  { voucher_id: 'v-bala', pool: 'dept_pool_marketing', amount: 4100.25, role: null },
]

function database(
  opts: {
    departments?: unknown[]
    journalLines?: unknown[]
    /** A table whose answer waits for this promise. */
    hold?: { table: string; until: Promise<void> }
    /** Every table asked for, in order. */
    asked?: string[]
  } = {},
): SupabaseClient {
  const from = (table: string) => {
    opts.asked?.push(table)
    let ids: string[] | null = null
    let receipts = false
    const rows = (): unknown[] => {
      switch (table) {
        case 'bank_accounts':
          return [{ id: 'bank-1', bank_name: 'Test Bank', gl_account_code: '3000', is_primary: true }]
        case 'approval_requests':
          return VOUCHERS.map((v) => ({ reference_id: v.id, status: 'pending', created_at: SUBMITTED, approved_at: null, updated_at: SUBMITTED }))
        case 'payment_vouchers':
          return receipts ? [] : VOUCHERS.filter((v) => ids?.includes(v.id))
        case 'payment_voucher_sources':
          return SOURCES.filter((s) => ids?.includes(s.voucher_id))
        case 'departments':
          return opts.departments ?? []
        case 'journal_lines':
          return opts.journalLines ?? []
        default:
          return []
      }
    }
    const held = opts.hold?.table === table ? opts.hold.until : Promise.resolve()
    const q = {
      select: () => q, not: () => q, order: () => q, lte: () => q, neq: () => q, range: () => q,
      eq: (column: string, value: unknown) => {
        if (table === 'payment_vouchers' && column === 'direction' && value === 'credit') receipts = true
        return q
      },
      in: (column: string, values: string[]) => {
        if (column === 'id' || column === 'voucher_id') ids = values
        return q
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => held.then(() => resolve({ data: rows(), error: null })),
    }
    return q
  }
  return { from } as unknown as SupabaseClient
}

// 2026-10-02 (user: "我不希望他看到 payroll detail，也就是每个人的 payout").
describe('Daily Bank — payroll waiting for approval', () => {
  it('is listed voucher by voucher for an account that may see payroll', async () => {
    const data = await fetchDailyBank(database(), DAY, { seesPayroll: true })
    expect(data.banks[0].pending.map((p) => [p.voucherNo, p.payee, p.total])).toEqual([
      ['HV-PV-202601-0040', 'TNB', 1200],
      ['HV-PV-202601-0041', 'Aina binti Example', 3200.5],
      ['HV-PV-202601-0042', 'Bala Sample', 4100.25],
    ])
  })

  it('is one line per bank for an account that may not: how many, how much, nobody named', async () => {
    const data = await fetchDailyBank(database(), DAY, { seesPayroll: false })
    const pending = data.banks[0].pending
    expect(pending.map((p) => [p.voucherNo, p.payee, p.description, p.total])).toEqual([
      ['HV-PV-202601-0040', 'TNB', 'Electricity', 1200],
      ['—', 'Payroll', '2 vouchers — total only', 7300.75],
    ])
    expect(pending[1].amounts).toMatchObject({ hr: 3200.5, marketing: 4100.25, venture: 0 })
    for (const secret of ['Aina', 'Bala', 'HV-PV-202601-0041', 'HV-PV-202601-0042']) {
      expect(JSON.stringify(data)).not.toContain(secret)
    }
  })

  it('comes to the same pending and the same free cash either way', async () => {
    const open = await fetchDailyBank(database(), DAY, { seesPayroll: true })
    const folded = await fetchDailyBank(database(), DAY, { seesPayroll: false })
    expect(folded.banks[0].pendingTotal).toEqual(open.banks[0].pendingTotal)
    expect(folded.banks[0].available).toEqual(open.banks[0].available)
    expect(folded.totals).toEqual(open.totals)
    expect(open.banks[0].pendingTotal).toMatchObject({ venture: 1200, hr: 3200.5, marketing: 4100.25 })
  })
})

// 2026-10-08 — the day's reads were eight round trips one after another
// (~415 ms in production). They start together now; only the GL lines (on the
// banks' codes) and the pending chain (requests → vouchers → sources) wait.
describe('Daily Bank — reads', () => {
  it('runs the whole pending chain while the GL lines are still on their way', async () => {
    const asked: string[] = []
    let release = () => {}
    const until = new Promise<void>((resolve) => { release = resolve })
    const day = fetchDailyBank(database({ asked, hold: { table: 'journal_lines', until } }), DAY, { seesPayroll: true })

    // Requests → their vouchers → those vouchers' sources, and the day's
    // receipts, all asked before the GL lines have answered.
    await vi.waitFor(() => expect(asked).toContain('payment_voucher_sources'))
    // The pending vouchers, the day's receipts, and the approved payroll rounds (2026-11-20).
    expect(asked.filter((t) => t === 'payment_vouchers')).toHaveLength(3)
    release()
    expect((await day).banks[0].pending).toHaveLength(3)
  })

  it('still gives a provisioned department its own column — set before anything is worked out', async () => {
    const data = await fetchDailyBank(
      database({
        departments: [{ name: 'IT', segment_key: 'it' }],
        journalLines: [
          { account_code: '3000', debit: 500, credit: 0, journal_entries: { transaction_date: '2026-01-10', segment: 'it' } },
          { account_code: '3000', debit: 0, credit: 120, journal_entries: { transaction_date: DAY, segment: 'it' } },
        ],
      }),
      DAY,
      { seesPayroll: true },
    )
    expect(data.columns).toContainEqual({ key: 'it', label: 'IT' })
    expect(data.banks[0].bf).toMatchObject({ it: 500, venture: 0 })
    expect(data.banks[0].outToday).toMatchObject({ it: 120 })
  })
})

// 2026-10-08: "today" was the server's (UTC's) until 08:00 in the office, so
// between midnight and 08:00 the board treated yesterday as today — the pool
// balances were folded into yesterday and left out of the real today.
describe("Daily Bank — today is the office's", () => {
  afterEach(() => vi.useRealTimers())

  it("reads today's pool balances for the office's today, not the server's", async () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 9 Oct in the office
    await inTimeZoneAsync('UTC', async () => {
      const asked: string[] = []
      await fetchDailyBank(database({ asked }), '2026-10-09', { seesPayroll: true })
      expect(asked).toContain('dept_pool_balances')

      const yesterday: string[] = []
      await fetchDailyBank(database({ asked: yesterday }), '2026-10-08', { seesPayroll: true })
      expect(yesterday).not.toContain('dept_pool_balances')
    })
  })
})

// 2026-11-19 — the user, on the board: "帮我检查这个是不是有问题" → "开 PR 修". A payroll
// funding transfer moves money into HR's payroll custody; it is not spent.
describe('Daily Bank — a pending payroll funding transfer', () => {
  const run = async (transfer: { bank: string; dest: string }, seesPayroll = true) => {
    const banks = [
      { id: 'hlb', bank_name: 'Hong Leong Bank', gl_account_code: '3000', is_primary: true },
      { id: 'abb', bank_name: 'Alliance Bank', gl_account_code: '3010', is_primary: false },
    ]
    const vouchers = [
      { id: 'v-fund', voucher_no: 'HV-PV-202601-0050', payee_name: 'HOUZS Venture — Payroll staging (Alliance Bank)', description: 'Payroll bank transfer — Dec 2025', amount: 5000, reference_type: 'payroll_payment_request', voucher_type: 'payroll_bank_transfer', bank_account_id: transfer.bank },
      { id: 'v-pay', voucher_no: 'HV-PV-202601-0051', payee_name: 'Marketing payroll', description: 'Payroll disbursement', amount: 3000, reference_type: 'payroll_disbursement', voucher_type: 'other', bank_account_id: 'abb' },
    ].map((v) => ({ ...v, direction: 'debit', status: 'pending_approval', updated_at: SUBMITTED }))
    const sources = [
      { voucher_id: 'v-fund', pool: 'dept_pool_director', amount: 5000, role: 'primary', account_code: transfer.dest },
      { voucher_id: 'v-pay', pool: 'dept_pool_hr', amount: 3000, role: 'primary', account_code: '4070' },
    ]
    const from = (table: string) => {
      let ids: string[] | null = null
      let receipts = false
      const rows = (): unknown[] =>
        table === 'bank_accounts' ? banks
          : table === 'approval_requests' ? vouchers.map((v) => ({ reference_id: v.id, status: 'pending', created_at: SUBMITTED, approved_at: null, updated_at: SUBMITTED }))
          : table === 'payment_vouchers' ? (receipts ? [] : vouchers.filter((v) => ids?.includes(v.id)))
          : table === 'payment_voucher_sources' ? sources.filter((s) => ids?.includes(s.voucher_id))
          : []
      const q = {
        select: () => q, not: () => q, order: () => q, lte: () => q, neq: () => q, range: () => q,
        eq: (column: string, value: unknown) => {
          if (table === 'payment_vouchers' && column === 'direction' && value === 'credit') receipts = true
          return q
        },
        in: (column: string, values: string[]) => {
          if (column === 'id' || column === 'voucher_id') ids = values
          return q
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows(), error: null })),
      }
      return q
    }
    const data = await fetchDailyBank({ from } as unknown as SupabaseClient, DAY, { seesPayroll })
    const bank = (id: string) => data.banks.find((b) => b.bankId === id)!
    return { data, hlb: bank('hlb'), abb: bank('abb') }
  }

  it('from one bank to another: out of the first, into the second under HR', async () => {
    const { hlb, abb } = await run({ bank: 'hlb', dest: '3010' })
    expect(hlb.pendingTotal).toMatchObject({ director: 5000, hr: 0 })
    const into = abb.pending.find((p) => p.voucherNo === 'HV-PV-202601-0050')!
    expect([into.total, into.amounts.hr, into.description]).toEqual([-5000, -5000, 'Payroll bank transfer — Dec 2025 · in from Hong Leong Bank'])
    // Alliance: 5,000 in, 3,000 out to staff — 2,000 more free than before the round.
    expect(abb.pendingTotal).toMatchObject({ hr: -2000 })
    // Across the banks only the staff's 3,000 leaves.
    expect(hlb.pending.concat(abb.pending).reduce((s, p) => s + p.total, 0)).toBe(3000)
  })

  it('within one bank: no cash moves — Director down, HR up, the bank untouched', async () => {
    const { abb } = await run({ bank: 'abb', dest: '3010' })
    const round = abb.pending.find((p) => p.voucherNo === 'HV-PV-202601-0050')!
    expect(round.total).toBe(0)
    expect(round.amounts).toMatchObject({ director: 5000, hr: -5000 })
    expect(round.description).toContain('no cash moves')
  })

  it('folded for an account without Payroll payouts: the same pending, nobody named', async () => {
    const open = await run({ bank: 'hlb', dest: '3010' })
    const folded = await run({ bank: 'hlb', dest: '3010' }, false)
    expect(folded.abb.pendingTotal).toEqual(open.abb.pendingTotal)
    expect(folded.hlb.pendingTotal).toEqual(open.hlb.pendingTotal)
    expect(folded.data.totals).toEqual(open.data.totals)
  })
})

// 2026-11-20 — the user: "revenue 不应该negative吧" → "做". A round Revenue funded inside
// Alliance was booked under HR on both lines, so Alliance's Revenue column kept the money.
describe('Daily Bank — an approved payroll funding transfer, by the departments that paid it', () => {
  const run = (roundDate: string) => {
    const banks = [
      { id: 'hlb', bank_name: 'Hong Leong Bank', gl_account_code: '3000', is_primary: true },
      { id: 'abb', bank_name: 'Alliance Bank', gl_account_code: '3010', is_primary: false },
    ]
    const lines = [
      // Revenue's money came into Alliance; a round of 1,000 then went to HR custody in the same bank.
      { account_code: '3010', debit: 2500, credit: 0, journal_entries: { transaction_date: '2026-01-02', segment: 'revenue_department' } },
      { account_code: '3010', debit: 1000, credit: 0, journal_entries: { transaction_date: roundDate, segment: 'hr' } },
      { account_code: '3010', debit: 0, credit: 1000, journal_entries: { transaction_date: roundDate, segment: 'hr' } },
    ]
    const rounds = [{ id: 'v-round', bank_account_id: 'abb', journal_entries: { transaction_date: roundDate, segment: 'hr' } }]
    const sources = [{ voucher_id: 'v-round', pool: 'dept_pool_revenue_department', amount: 1000, role: 'primary' }]
    const from = (table: string) => {
      let rounding = false
      let ids: string[] | null = null
      const rows = (): unknown[] =>
        table === 'bank_accounts' ? banks
          : table === 'departments' ? [{ name: 'Revenue Department', segment_key: 'revenue_department' }]
          : table === 'journal_lines' ? lines
          : table === 'payment_vouchers' ? (rounding ? rounds : [])
          : table === 'payment_voucher_sources' ? sources.filter((s) => ids?.includes(s.voucher_id))
          : []
      const q = {
        select: () => q, not: () => q, order: () => q, lte: () => q, neq: () => q, range: () => q,
        eq: (column: string, value: unknown) => {
          if (table === 'payment_vouchers' && column === 'voucher_type' && value === 'payroll_bank_transfer') rounding = true
          return q
        },
        in: (column: string, values: string[]) => {
          if (column === 'voucher_id') ids = values
          return q
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows(), error: null })),
      }
      return q
    }
    return fetchDailyBank({ from } as unknown as SupabaseClient, DAY, { seesPayroll: true })
  }

  it('takes the round off Revenue’s column, not HR’s, in the bank that paid it — the bank’s total unchanged', async () => {
    const data = await run('2026-01-05')
    const abb = data.banks.find((b) => b.bankId === 'abb')!
    expect(abb.bf).toMatchObject({ revenue_department: 1500, hr: 1000 })
    expect(Object.values(abb.bf).reduce((s, n) => s + n, 0)).toBe(2500)
  })

  it('a round dated the day itself: its outgoing line under Revenue', async () => {
    const data = await run(DAY)
    const abb = data.banks.find((b) => b.bankId === 'abb')!
    expect(abb.outToday).toMatchObject({ revenue_department: 1000, hr: 0 })
    expect(abb.inToday).toMatchObject({ hr: 1000 })
  })
})
