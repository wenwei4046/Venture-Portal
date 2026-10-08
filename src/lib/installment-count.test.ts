import { describe, expect, it } from 'vitest'
import { loanInstallmentCount } from './installment-count'
import { termsForLoan } from './treasury-terms-data'

// A loan as the picker reads it. tenure_months is NOT NULL on loans, so "no
// schedule" is said in the terms text.
const loan = (o: Partial<Parameters<typeof termsForLoan>[0]> = {}) => ({
  principal: 60000,
  effective_rate: 0.04,
  tenure_months: 6,
  compound_interest: false,
  disbursement_date: '2026-02-15',
  repayment_start_month: null,
  terms_effective_from: null,
  repayment_terms: 'EMI 分期 · 月息4% · 6期',
  ...o,
})
const count = (l: ReturnType<typeof loan>, principalPaid: number, currentYM = '2026-10') =>
  loanInstallmentCount({ terms: termsForLoan(l), principalPaid, currentYM })

describe('loanInstallmentCount', () => {
  it('counts what is still owed, out of the tenure', () => {
    expect(count(loan(), 0)).toEqual({ total: 6, remaining: 6 })
    expect(count(loan(), 30000)).toEqual({ total: 6, remaining: 3 })
    expect(count(loan(), 60000)).toEqual({ total: 6, remaining: 0 })
  })

  // The case the month count got wrong: 300,000 over 36, 14 payments made, one
  // of them 183,333.34 — 22 installments at once. One installment is owed.
  it('counts in money, so a payment that covers many installments counts as many', () => {
    const hc = loan({ principal: 300000, effective_rate: 0.005556, tenure_months: 36, disbursement_date: '2025-01-01', repayment_start_month: '2025-01-01' })
    expect(count(hc, 291666.67)).toEqual({ total: 36, remaining: 1 })
  })

  it('lives with installments that do not divide evenly', () => {
    // 58,000 over 6 is 9,666.67 a month; four paid is 38,666.68.
    expect(count(loan({ principal: 58000 }), 38666.68)).toEqual({ total: 6, remaining: 2 })
  })

  it('has nothing to count for a loan with no fixed term', () => {
    // 未定还款 / 无还款方式 in the terms, or no terms at all.
    expect(count(loan({ tenure_months: 1, repayment_terms: '未定还款 · Borrow - 80k' }), 0)).toBeNull()
    expect(count(loan({ tenure_months: 1, repayment_terms: '无息垫款 · 0% · 原表无还款方式' }), 0)).toBeNull()
    expect(count(loan({ tenure_months: 1, repayment_terms: null }), 0)).toBeNull()
    // 利滚利: the balance rolls, there are no installments.
    expect(count(loan({ tenure_months: 1, compound_interest: true, repayment_terms: '一次还清 · 月息2% · 1期' }), 0)).toBeNull()
  })

  it('a one-period loan with a plan is one installment', () => {
    expect(count(loan({ tenure_months: 1, repayment_terms: 'Interest 4%' }), 0)).toEqual({ total: 1, remaining: 1 })
  })

  // Terms that changed mid-life: the count is the segment's in force now, and
  // only principal repaid since it began counts against it.
  it('counts from the segment in force once the terms changed', () => {
    const terms = termsForLoan(
      loan({ principal: 60000, tenure_months: 10, effective_rate: 0.04, disbursement_date: '2025-04-05', terms_effective_from: '2026-01-01' }),
      [{ validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false }],
    )
    // 8,000 repaid under the old terms (8 × 1,000) leaves 52,000 to re-base on:
    // 10 installments of 5,200. Two of those have been paid since January.
    const principalByMonth = {
      '2025-05': 1000, '2025-06': 1000, '2025-07': 1000, '2025-08': 1000,
      '2025-09': 1000, '2025-10': 1000, '2025-11': 1000, '2025-12': 1000,
      '2026-01': 5200, '2026-02': 5200,
    }
    expect(loanInstallmentCount({ terms, principalPaid: 18400, principalByMonth, currentYM: '2026-03' })).toEqual({ total: 10, remaining: 8 })
  })

  it('…and has none when the terms in force now compound', () => {
    const terms = termsForLoan(
      loan({ principal: 60000, tenure_months: 1, effective_rate: 0.04, compound_interest: true, disbursement_date: '2025-04-05', terms_effective_from: '2026-01-01' }),
      [{ validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false }],
    )
    expect(loanInstallmentCount({ terms, principalPaid: 8000, principalByMonth: { '2025-05': 8000 }, currentYM: '2026-03' })).toBeNull()
  })
})
