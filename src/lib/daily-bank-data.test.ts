import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

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

function database(): SupabaseClient {
  const from = (table: string) => {
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
        default:
          return [] // departments, journal_lines
      }
    }
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
