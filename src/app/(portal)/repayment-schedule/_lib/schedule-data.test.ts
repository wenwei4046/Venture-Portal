import { describe, expect, it, vi } from 'vitest'
import { projected, selectedColumns } from '@/test/select-columns'

// 2026-10-12 (user: 现在只能选月份不能选日期 → expected repayment 和 repayment
// start date 应该要一样): the calendar puts a deal's instalments on its
// repayment start's day — the date Finance picked.

vi.mock('../../fund-in/actions', () => ({ listPayableFundSources: async () => [] }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))

import { loadRepaymentSchedule } from './schedule-data'

const TABLES: Record<string, Array<Record<string, unknown>>> = {
  // 12,000 to HOUZS Kitchen over 3 months from 15 Jul, its start picked as 25 Aug.
  loans: [
    {
      id: 'l1', company_id: 'co-hk', principal: 12000, effective_rate: 0.01, tenure_months: 3, status: 'active', repayment_terms: 'EMI 分期 · 3期',
      compound_interest: false, disbursement_date: '2026-07-15', min_pay_interest: false, repayment_start_month: '2026-08-01', repayment_start_date: '2026-08-25',
      terms_effective_from: null,
    },
  ],
  loan_outstanding: [],
  companies: [{ id: 'co-hk', short_code: 'HK', name: 'HOUZS Kitchen' }, { id: 'co-car', short_code: 'CAR', name: 'Carres' }],
  repayments: [],
  // Carres' 30,000 at 2% with no fixed term from 14 Sep, its start picked as 7 Oct.
  fund_sources: [
    {
      id: 'f1', status: 'active', from_company_id: 'co-car', from_department_id: null, from_director_id: null, from_freetext_name: null, compound_interest: false,
      effective_date: '2026-09-14', min_pay_interest: false, repayment_start_month: '2026-10-01', repayment_date: '2026-10-07', amount: 30000, cost_rate: 0.02,
      lock_in_months: null, terms_effective_from: null,
    },
  ],
  fund_source_repayments: [],
  payment_vouchers: [],
  departments: [],
  directors: [],
}

function client() {
  return {
    from: (table: string) => {
      // Only the columns selected come back, as from PostgREST.
      let columns: string[] | null = null
      const q: Record<string, unknown> = {}
      for (const m of ['eq', 'neq', 'in', 'not', 'gte', 'lte', 'lt', 'order', 'range', 'limit']) q[m] = () => q
      q.select = (c?: string) => ((columns = selectedColumns(c)), q)
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: projected(TABLES[table] ?? [], columns), error: null }).then(res)
      return q
    },
  }
}

describe('the Repayment Schedule’s calendar', () => {
  it('puts each deal on its repayment start’s day', async () => {
    const schedule = await loadRepaymentSchedule(client() as never, '2026-10')
    expect(schedule.events.map((e) => [e.name, e.date])).toEqual([
      ['HK', '2026-10-25'],
      ['CAR', '2026-10-07'],
    ])
  })
})
