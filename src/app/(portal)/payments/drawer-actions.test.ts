import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'

// The hub's drawer reads one voucher (2026-10-14, the Finance revamp v2 — D05):
// what the voucher page asks — the treasury, a page of Payments' tabs open, a
// salary voucher only with Payroll payouts — refused in words, never a throw.

const mocks = vi.hoisted(() => ({ user: null as unknown, rows: {} as Record<string, unknown> }))
vi.mock('@/lib/auth', () => ({ requirePermission: async () => mocks.user }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: table === 'payment_vouchers' ? mocks.rows.voucher ?? null : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
      }
      return q
    },
  }),
}))

import { openVoucherDrawer } from './drawer-actions'

const VOUCHER = {
  id: 'v1',
  voucher_no: 'HV-PV-202610-0044',
  status: 'draft',
  direction: 'debit',
  amount: '25000',
  payee_name: 'Meta Platforms Ireland',
  payee_company_id: null,
  description: 'FB ads top-up',
  notes: null,
  payment_method: 'bank_transfer',
  payment_date: '2026-10-06',
  payment_reference: null,
  bank_account_id: null,
  reference_type: null,
  voucher_type: 'expense',
  target_pool: null,
  source_pool: null,
  invoice_id: null,
  created_by: 'u1',
  created_at: '2026-10-06T01:00:00Z',
  updated_at: '2026-10-06T01:00:00Z',
  approved_by: null,
  approved_at: null,
  executed_at: null,
}

beforeEach(() => {
  mocks.rows = { voucher: VOUCHER }
})

describe('openVoucherDrawer', () => {
  it('opens a voucher with the buttons its reader may press', async () => {
    mocks.user = withActions({ id: 'f', role: 'finance', permissions: ['treasury'] })
    const res = await openVoucherDrawer('v1')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.detail).toMatchObject({ no: 'HV-PV-202610-0044', amount: 25000, method: 'Bank transfer', paymentDate: '2026-10-06' })
      expect(res.detail.can).toMatchObject({ create: true, edit: true, approve: false })
    }
  })

  it('refuses where no page of Payments’ tabs opens', async () => {
    mocks.user = { ...withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }), tabs: ['fin.receipt'] }
    expect(await openVoucherDrawer('v1')).toEqual({ ok: false, reason: 'closed' })
  })

  it('a salary voucher opens only with Payroll payouts', async () => {
    mocks.rows = { voucher: { ...VOUCHER, reference_type: 'payroll_disbursement' } }
    mocks.user = withActions({ id: 'f', role: 'finance', permissions: ['treasury'] })
    expect(await openVoucherDrawer('v1')).toEqual({ ok: false, reason: 'payroll' })
    mocks.user = withActions({ id: 'f', role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    expect((await openVoucherDrawer('v1')).ok).toBe(true)
  })

  it('a voucher that is not there for this reader says so', async () => {
    mocks.rows = { voucher: null }
    mocks.user = withActions({ id: 'f', role: 'finance', permissions: ['treasury'] })
    expect(await openVoucherDrawer('v1')).toEqual({ ok: false, reason: 'not_found' })
  })
})
