import { beforeEach, describe, expect, it, vi } from 'vitest'

// A voucher's Edit writes only what it is sent (2026-10-16 — the user's rule
// of 2026-10-14: the shared logins open one voucher on two screens, and a
// form written back whole puts back what the other changed), checks the
// voucher as it will stand, and refuses a bad set of pools BEFORE anything is
// written (it used to update the voucher first).

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
import { updatePaymentVoucher, updatePaymentVoucherInWords } from './actions'

const STORED: {
  id: string
  status: string
  voucher_type: string
  fund_source_id: string | null
  loan_id: string | null
  repayment_breakdown: unknown
  invoice_id: string | null
  reference_type: string | null
  amount: number
  payee_name: string
  payee_company_id: string | null
  bank_account_id: string | null
  description: string
  payment_method: string
  notes: string | null
  target_pool: string | null
} = {
  id: 'pv',
  status: 'draft',
  voucher_type: 'expense',
  fund_source_id: null,
  loan_id: null,
  repayment_breakdown: null,
  invoice_id: null,
  reference_type: null,
  amount: 1000,
  payee_name: 'Grab Ads',
  payee_company_id: null,
  bank_account_id: 'bank-hl',
  description: 'October ads',
  payment_method: 'bank_transfer',
  notes: null,
  target_pool: null,
}

function database(over: Partial<typeof STORED> & { direction?: 'debit' | 'credit'; sources?: Array<{ amount: number; account_code: string }> } = {}) {
  const current = { direction: 'debit', ...STORED, ...over }
  const standing = over.sources ?? [{ amount: 1000, account_code: '9000' }]
  const writes: Array<{ table: string; operation: string; values?: unknown }> = []
  const from = vi.fn((table: string) => {
    let operation = 'select'
    const query = {
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: current, error: null }),
      update: vi.fn((values: unknown) => ((operation = 'update'), writes.push({ table, operation, values }), query)),
      insert: vi.fn((values: unknown) => ((operation = 'insert'), writes.push({ table, operation, values }), query)),
      delete: vi.fn(() => ((operation = 'delete'), writes.push({ table, operation }), query)),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(
          resolve(
            table === 'payment_vouchers' && operation === 'update'
              ? { data: [{ id: 'pv' }], error: null }
              : table === 'payment_voucher_sources' && operation === 'select'
                ? { data: standing, count: 0, error: null }
                : { data: [], count: 0, error: null },
          ),
        ),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from })
  return { writes, from }
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  fd.set('id', 'pv')
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const voucherWrite = (writes: Array<{ table: string; operation: string; values?: unknown }>) => writes.find((w) => w.table === 'payment_vouchers')?.values

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'finance-user', role: 'finance' })
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('a voucher’s Edit writes only what it is sent', () => {
  it('notes alone: the notes and nothing else — no pools rewritten', async () => {
    const { writes } = database()
    await expect(updatePaymentVoucher(form({ notes: 'Paid by card' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(voucherWrite(writes)).toEqual({ notes: 'Paid by card', updated_at: expect.any(String) })
    expect(writes.filter((w) => w.table === 'payment_voucher_sources')).toEqual([])
  })

  it('a new amount without its pools must still add up to the pools standing — refused before any write', async () => {
    const { writes } = database()
    await expect(updatePaymentVoucher(form({ amount: '1200' }))).rejects.toThrow('source rows sum (1000.00) does not match voucher amount (1200.00)')
    expect(writes).toEqual([])
  })

  it('pools that do not add up are refused before the voucher is touched', async () => {
    const { writes } = database()
    const fd = form({ amount: '1200', source_rows_count: '1', 'source_rows[0][pool]': 'venture_pool', 'source_rows[0][amount]': '1000', 'source_rows[0][account_code]': '9000' })
    await expect(updatePaymentVoucher(fd)).rejects.toThrow('does not match voucher amount')
    expect(writes).toEqual([])
  })

  it('the pools sent are put in place; the amount, untouched, is not written', async () => {
    const { writes } = database()
    const fd = form({ source_rows_count: '2', 'source_rows[0][pool]': 'venture_pool', 'source_rows[0][amount]': '600', 'source_rows[0][account_code]': '9000', 'source_rows[1][pool]': 'dept_pool_marketing', 'source_rows[1][amount]': '400', 'source_rows[1][account_code]': '9000' })
    await expect(updatePaymentVoucher(fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(voucherWrite(writes)).toEqual({ updated_at: expect.any(String) })
    expect(writes.filter((w) => w.table === 'payment_voucher_sources').map((w) => w.operation)).toEqual(['delete', 'insert'])
    expect(writes.find((w) => w.table === 'payment_voucher_sources' && w.operation === 'insert')?.values).toHaveLength(2)
  })

  it('each line sent keeps its own words (2026-10-22); a line without them keeps none', async () => {
    const { writes } = database()
    const fd = form({ source_rows_count: '2', 'source_rows[0][pool]': 'venture_pool', 'source_rows[0][amount]': '600', 'source_rows[0][account_code]': '9000', 'source_rows[0][description]': ' October rent ', 'source_rows[1][pool]': 'dept_pool_marketing', 'source_rows[1][amount]': '400', 'source_rows[1][account_code]': '9000' })
    await expect(updatePaymentVoucher(fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(writes.find((w) => w.table === 'payment_voucher_sources' && w.operation === 'insert')?.values).toEqual([
      expect.objectContaining({ pool: 'venture_pool', description: 'October rent' }),
      expect.objectContaining({ pool: 'dept_pool_marketing', description: null }),
    ])
  })

  it('a receipt’s account alone rewrites its one row on the pool and amount it stands at', async () => {
    const { writes } = database({ direction: 'credit', target_pool: 'venture_pool', bank_account_id: null, sources: [{ amount: 1000, account_code: '5000' }] })
    await expect(updatePaymentVoucher(form({ account_code: '5010' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(writes.find((w) => w.table === 'payment_voucher_sources' && w.operation === 'insert')?.values).toEqual({ voucher_id: 'pv', pool: 'venture_pool', amount: 1000, account_code: '5010' })
  })

  it('the voucher as it will stand is checked: a payment cleared of its bank is refused', async () => {
    const { writes } = database()
    await expect(updatePaymentVoucher(form({ bank_account_id: '' }))).rejects.toThrow('Bank account is required for debit (outgoing) vouchers')
    expect(writes).toEqual([])
  })

  it('in words: the same work, no redirect — and a refusal said', async () => {
    database()
    expect(await updatePaymentVoucherInWords(form({ description: 'October ads — Grab' }))).toEqual({ ok: true })
    expect(mocks.redirect).not.toHaveBeenCalled()
    database()
    expect(await updatePaymentVoucherInWords(form({ description: '  ' }))).toEqual({ ok: false, reason: 'Description is required' })
  })
})
