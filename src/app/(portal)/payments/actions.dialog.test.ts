import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// Create payment's dialog (2026-10-14, the Finance revamp v2 — D07): the same
// voucher the form page makes, but the dialog stays on Payments — so it is
// answered in words, never sent elsewhere; *Submit for approval* sends the
// draft on at once.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requirePage: async () => undefined,
  requirePermission: mocks.requireActionOn,
  requireActionOn: mocks.requireActionOn,
  requireAnyActionOn: mocks.requireActionOn,
  requireApproverOn: mocks.requireActionOn,
  requirePayrollPayoutsActionOn: mocks.requireActionOn,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createPaymentFromDialog, createPaymentVoucher } from './actions'

function database() {
  const db = recordingSupabase((call) => {
    if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-new' } }
    if (call.table === 'payment_vouchers' && call.op === 'select' && call.single) {
      return { data: { id: 'pv-new', voucher_no: 'HV-PV-202610-0521', description: 'Claude - Oct', amount: 447.68, status: 'draft' } }
    }
    if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 520 }
    return {}
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

/** What the dialog sends for one pool (CreatePaymentDialog's save). */
function dialogForm(over: Record<string, string> = {}) {
  const form = new FormData()
  const fields: Record<string, string> = {
    direction: 'debit',
    voucher_type: 'expense',
    reference_type: '',
    reference_id: '',
    payee_name: 'Tan Yong Hong',
    payee_company_id: '',
    bank_account_id: 'bank-hl',
    amount: '447.68',
    payment_date: '2026-10-12',
    payment_method: 'bank_transfer',
    description: 'Claude - Oct',
    target_pool: '',
    source_rows_count: '1',
    'source_rows[0][pool]': 'venture_pool',
    'source_rows[0][amount]': '447.68',
    'source_rows[0][account_code]': '9087',
    source_pool: 'venture_pool',
    attachment_count: '0',
    ...over,
  }
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'carrie', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
  vi.useFakeTimers({ now: new Date('2026-10-14T07:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('createPaymentFromDialog', () => {
  it('Save draft: makes the draft — its line on the pool and account picked — and answers with its number, going nowhere', async () => {
    const db = database()
    const res = await createPaymentFromDialog(dialogForm())
    expect(res).toEqual({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0521', submitted: false })
    expect(mocks.redirect).not.toHaveBeenCalled()
    const [voucher] = db.writes('payment_vouchers')
    expect(voucher.values).toMatchObject({ status: 'draft', direction: 'debit', amount: 447.68, payee_name: 'Tan Yong Hong', payment_date: '2026-10-12', created_by: 'carrie' })
    expect(db.writes('payment_voucher_sources')[0].values).toEqual([
      expect.objectContaining({ voucher_id: 'pv-new', pool: 'venture_pool', amount: 447.68, account_code: '9087' }),
    ])
    expect(db.writes('approval_requests')).toHaveLength(0)
  })

  it('Submit for approval: the draft goes on at once — its request by whoever made it, the voucher pending', async () => {
    const db = database()
    const res = await createPaymentFromDialog(dialogForm({ submit: '1' }))
    expect(res).toEqual({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0521', submitted: true })
    expect(db.writes('approval_requests')[0].values).toMatchObject({ request_type: 'payment_voucher', reference_id: 'pv-new', submitted_by: 'carrie', status: 'pending' })
    const update = db.writes('payment_vouchers').find((w) => w.op === 'update')
    expect(update?.values).toEqual({ status: 'pending_approval' })
  })

  it('a split across pools must add up to the amount', async () => {
    database()
    const res = await createPaymentFromDialog(
      dialogForm({
        source_rows_count: '2',
        'source_rows[1][pool]': 'dept_pool_marketing',
        'source_rows[1][amount]': '100.00',
        'source_rows[1][account_code]': '9087',
      }),
    )
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/does not match voucher amount/)
  })

  it('what the form page refuses, it refuses in words (no description)', async () => {
    const db = database()
    const res = await createPaymentFromDialog(dialogForm({ description: '' }))
    expect(res).toEqual({ ok: false, reason: 'Description is required' })
    expect(db.writes()).toHaveLength(0)
  })

  it('makes payment vouchers only — never a receipt', async () => {
    const db = database()
    expect(await createPaymentFromDialog(dialogForm({ direction: 'credit' }))).toEqual({ ok: false, reason: 'Create payment makes a payment voucher.' })
    expect(db.writes()).toHaveLength(0)
  })

  it('a send that is refused after the draft was made keeps the draft, and says so', async () => {
    const db = recordingSupabase((call) => {
      if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-new' } }
      if (call.table === 'payment_vouchers' && call.op === 'select' && call.single) return { data: null, error: { message: 'gone' } }
      if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 520 }
      return {}
    })
    mocks.createClient.mockResolvedValue(db.client)
    const res = await createPaymentFromDialog(dialogForm({ submit: '1' }))
    expect(res).toMatchObject({ ok: true, voucherNo: 'HV-PV-202610-0521', submitted: false })
    expect(res.ok && res.note).toMatch(/^Saved as a draft — it was not sent for approval/)
  })
})

describe('the form page keeps its way', () => {
  it('createPaymentVoucher still ends on the new voucher’s page', async () => {
    database()
    await expect(createPaymentVoucher(dialogForm())).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/payments/pv-new')
  })

  it('and back where a caller asked (return_to), with the number', async () => {
    database()
    await expect(createPaymentVoucher(dialogForm({ return_to: '/billing' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith('/billing?receipt=HV-PV-202610-0521')
  })
})
