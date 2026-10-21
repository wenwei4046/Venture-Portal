import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-21 (the user: "选 A"): a repayment row did not know the journal entry
// it posted, so Void found one by the loan, amount, day and type — of two
// identical repayments it reversed the first one's entry. The entry is posted
// FIRST now and the row is written with it (repayments.journal_entry_id, mig
// 20261021200000); an entry that fails leaves nothing behind.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { recordRepayment } from './actions'

const LOAN = 'loan-cont'
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

/** The Cont's active 60k loan, 10k still out, Hong Leong primary, a receivable leaf for the borrower. */
const book = (call: RecordedCall) => {
  if (call.table === 'loans') return { data: { status: 'active', principal: 60000, company_id: 'co-cont' } }
  if (call.table === 'loan_outstanding') return { data: { outstanding: 10000 } }
  if (call.table === 'bank_accounts') return { data: { id: 'bank-hl', gl_account_code: '3000', current_balance: 67082.72 } }
  if (call.table === 'companies') return { data: { name: 'The Cont', short_code: 'CONT' } }
  if (call.table === 'chart_of_accounts') return { data: { code: '3053' } }
  return { data: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
})

describe('recordRepayment links the row to the entry it posted', () => {
  it('writes the repayment with its own journal entry', async () => {
    const db = recordingSupabase(book, (fn) => (fn === 'post_journal_entry_as_caller' ? { data: 'je-0009' } : {}))
    mocks.createClient.mockResolvedValue(db.client)

    await recordRepayment(form({ loan_id: LOAN, payment_type: 'interest', amount: '2400', payment_date: '2026-10-02' }))

    const posted = db.rpcs.filter((r) => r.fn === 'post_journal_entry_as_caller')
    expect(posted).toHaveLength(1)
    expect(posted[0].args).toMatchObject({ p_reference_type: 'repayment', p_reference_id: LOAN, p_transaction_date: '2026-10-02' })
    const rows = db.writes('repayments')
    expect(rows).toHaveLength(1)
    expect(rows[0].op).toBe('insert')
    expect(rows[0].values).toMatchObject({ loan_id: LOAN, amount: 2400, payment_type: 'interest', payment_date: '2026-10-02', journal_entry_id: 'je-0009' })
    expect(db.rpcs.filter((r) => r.fn === 'bump_bank_balance').map((r) => r.args)).toEqual([{ p_bank_account_id: 'bank-hl', p_delta: 2400 }])
  })

  it('a principal repayment returns its capital to the Venture Pool, with its entry on the row', async () => {
    const db = recordingSupabase(book, (fn) => (fn === 'post_journal_entry_as_caller' ? { data: 'je-0010' } : {}))
    mocks.createClient.mockResolvedValue(db.client)

    await recordRepayment(form({ loan_id: LOAN, payment_type: 'principal', amount: '10000', payment_date: '2026-10-02' }))

    expect(db.writes('repayments')[0].values).toMatchObject({ payment_type: 'principal', amount: 10000, journal_entry_id: 'je-0010' })
    expect(db.writes('venture_pool').map((w) => w.values)).toEqual([expect.objectContaining({ transaction_type: 'loan_repayment_in', amount: 10000, reference_id: LOAN })])
    const lines = (db.rpcs.find((r) => r.fn === 'post_journal_entry_as_caller')?.args as { p_lines: Array<{ account_code: string }> }).p_lines
    expect(lines.map((l) => l.account_code)).toEqual(['3000', '3053'])
  })

  it('an entry that fails leaves nothing behind — no row, no pool, no bank', async () => {
    const db = recordingSupabase(book, (fn) =>
      fn === 'post_journal_entry_as_caller' ? { error: { message: 'journal_lines_reject_header_post: 3020 is a header account' } } : {},
    )
    mocks.createClient.mockResolvedValue(db.client)

    await expect(
      recordRepayment(form({ loan_id: LOAN, payment_type: 'principal', amount: '10000', payment_date: '2026-10-02' })),
    ).rejects.toThrow(/journal entry/i)
    expect(db.writes()).toEqual([])
    expect(db.rpcs.map((r) => r.fn)).toEqual(['post_journal_entry_as_caller'])
  })

  it('a borrower with no receivable account is refused before anything is written', async () => {
    const db = recordingSupabase((call) => (call.table === 'chart_of_accounts' ? { data: null } : book(call)))
    mocks.createClient.mockResolvedValue(db.client)

    await expect(
      recordRepayment(form({ loan_id: LOAN, payment_type: 'principal', amount: '10000', payment_date: '2026-10-02' })),
    ).rejects.toThrow(/No COA leaf for borrower/)
    expect(db.writes()).toEqual([])
    expect(db.rpcs).toEqual([])
  })
})
