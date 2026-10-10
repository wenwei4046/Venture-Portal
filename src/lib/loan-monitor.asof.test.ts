import { describe, expect, it, vi } from 'vitest'

// 2026-10-10 — Loan Aging "As at" a day (the user's Claude Design handoff;
// the user: 要做). Every repayment is dated, so a past day is read exactly:
// the deals live then (a loan repaid since included), their outstanding and
// their unpaid instalments from the repayments made by that day, aged to it.

vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-10', officeMonth: () => '2026-10' }))

import { fetchLoanMonitorData } from './loan-monitor'

const ROWS: Record<string, unknown[]> = {
  loans: [
    // 120,000 @ 1%/mo over 12 months from 5 Mar: 11,200 a month from April.
    { id: 'l1', company_id: 'c1', principal: 120000, effective_rate: 0.01, tenure_months: 12, status: 'active', repayment_terms: 'EMPI 分期 12 个月', compound_interest: false, disbursement_date: '2026-03-05', repayment_start_month: null, terms_effective_from: null },
    // No fixed term; repaid in full on 20 Sep.
    { id: 'l2', company_id: 'c2', principal: 50000, effective_rate: 0.01, tenure_months: 0, status: 'fully_repaid', repayment_terms: null, compound_interest: false, disbursement_date: '2026-01-10', repayment_start_month: null, terms_effective_from: null },
    // Lent after the day asked.
    { id: 'l3', company_id: 'c1', principal: 30000, effective_rate: 0.01, tenure_months: 6, status: 'active', repayment_terms: 'EMPI 分期 6 个月', compound_interest: false, disbursement_date: '2026-09-15', repayment_start_month: null, terms_effective_from: null },
  ],
  loan_outstanding: [
    { loan_id: 'l1', outstanding: 90000, total_principal_paid: 30000 },
    { loan_id: 'l2', outstanding: 0, total_principal_paid: 50000 },
    { loan_id: 'l3', outstanding: 30000, total_principal_paid: 0 },
  ],
  companies: [{ id: 'c1', name: 'HOUZS Century', short_code: 'HC' }, { id: 'c2', name: 'HOUZS Mattress', short_code: 'HM' }],
  repayments: [
    { loan_id: 'l1', amount: 10000, payment_date: '2026-04-05', payment_type: 'principal' },
    { loan_id: 'l1', amount: 1200, payment_date: '2026-04-05', payment_type: 'interest' },
    { loan_id: 'l1', amount: 10000, payment_date: '2026-05-05', payment_type: 'principal' },
    { loan_id: 'l1', amount: 1200, payment_date: '2026-05-05', payment_type: 'interest' },
    { loan_id: 'l1', amount: 10000, payment_date: '2026-10-05', payment_type: 'principal' },
    { loan_id: 'l2', amount: 50000, payment_date: '2026-09-20', payment_type: 'principal' },
  ],
  fund_sources: [],
  fund_source_outstanding: [],
  fund_source_repayments: [],
  directors: [],
  departments: [],
  treasury_terms_history: [],
}

function db() {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'lte', 'gte']) q[m] = () => q
      q.range = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: ROWS[table] ?? [], error: null }).then(res)
      return q
    },
  } as never
}

describe('Loan Aging as at a past day', () => {
  it('reads the deals live then, a loan repaid since included, at their outstanding then', async () => {
    const data = await fetchLoanMonitorData(db(), { asOf: '2026-08-31' })
    expect(data.currentYM).toBe('2026-08')
    expect(data.collect.scheduled.map((r) => [r.counterparty, r.outstanding])).toEqual([['HC', 100000]])
    expect(data.collect.noTerm.map((r) => [r.counterparty, r.outstanding])).toEqual([['HM', 50000]])
    expect(data.collect.grandTotal).toBe(150000)
  })

  it('ages the instalments unpaid by then to that day', async () => {
    const data = await fetchLoanMonitorData(db(), { asOf: '2026-08-31' })
    // April and May paid; June (87 days), July (57) and August (26) are not.
    expect(data.collect.due).toHaveLength(1)
    expect(data.collect.due[0].days).toMatchObject({ notDue: 0, d30: 11200, d90: 22400, d90plus: 0, total: 33600 })
  })

  it('reads today as it always has when no day is asked', async () => {
    const data = await fetchLoanMonitorData(db())
    expect(data.currentYM).toBe('2026-10')
    expect(data.collect.noTerm).toHaveLength(0)
    expect(data.collect.scheduled.map((r) => [r.counterparty, r.outstanding]).sort()).toEqual([['HC', 30000], ['HC', 90000]])
  })
})
