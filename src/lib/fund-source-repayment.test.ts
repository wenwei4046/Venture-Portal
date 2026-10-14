import { describe, expect, it } from 'vitest'
import { fundSourceRepaymentForm, repaymentTotal, type FundSourceRepayment } from './fund-source-repayment'

// A fund source's repayment voucher (2026-10-15): the fund source's page and
// the Finance phone app's sheet file the same one — Create payment's
// loan-repayment FormData, the source known, each part on its own account.

const R = (over: Partial<FundSourceRepayment> = {}): FundSourceRepayment => ({
  fundSourceId: 'fs-ws',
  lender: 'Lim Wei Siang',
  lenderCompanyId: null,
  accountCode: '4054',
  outstanding: 64500,
  activeAccounts: ['4054', '6000', '9096'],
  principal: '1500.00',
  interest: '450.00',
  penalty: '0.00',
  paymentDate: '2026-10-15',
  bankId: 'bank-hl',
  pool: 'venture_pool',
  ...over,
})

describe('fundSourceRepaymentForm', () => {
  it('is the FormData Create payment sends in loan-repayment mode', () => {
    const res = fundSourceRepaymentForm(R())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.total).toBe(1950)
    expect(Object.fromEntries(res.formData.entries())).toEqual({
      direction: 'debit',
      voucher_type: 'expense',
      payee_company_id: '',
      payee_name: 'Lim Wei Siang',
      reference_type: '',
      reference_id: '',
      amount: '1950.00',
      payment_method: 'bank_transfer',
      payment_date: '2026-10-15',
      bank_account_id: 'bank-hl',
      target_pool: '',
      fund_source_id: 'fs-ws',
      repayment_principal: '1500.00',
      repayment_interest: '450.00',
      repayment_penalty: '0.00',
      source_rows_count: '2',
      'source_rows[0][pool]': 'venture_pool',
      'source_rows[0][amount]': '1500.00',
      'source_rows[0][account_code]': '4054',
      'source_rows[1][pool]': 'venture_pool',
      'source_rows[1][amount]': '450.00',
      'source_rows[1][account_code]': '6000',
      source_pool: 'venture_pool',
      attachment_count: '0',
      description: 'Loan repayment — Lim Wei Siang',
    })
  })

  it('keeps a description typed — the one given, or the page form’s own field', () => {
    const given = fundSourceRepaymentForm(R({ description: '  Sept instalment ' }))
    expect(given.ok && given.formData.get('description')).toBe('Sept instalment')
    const fd = new FormData()
    fd.set('description', 'From the form')
    const fromForm = fundSourceRepaymentForm(R(), fd)
    expect(fromForm.ok && fromForm.formData.get('description')).toBe('From the form')
  })

  it('puts a penalty on 9096 and every line on the pool chosen', () => {
    const res = fundSourceRepaymentForm(R({ penalty: '25.00', pool: 'dept_pool_finance' }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.formData.get('source_rows_count')).toBe('3')
    expect(res.formData.get('source_rows[2][account_code]')).toBe('9096')
    expect(res.formData.getAll('source_pool')).toEqual(['dept_pool_finance'])
    for (const n of [0, 1, 2]) expect(res.formData.get(`source_rows[${n}][pool]`)).toBe('dept_pool_finance')
  })

  it('refuses what cannot be filed, before anything is sent', () => {
    expect(fundSourceRepaymentForm(R({ principal: '0', interest: '', penalty: '0' }))).toEqual({ ok: false, reason: 'Enter at least one of principal, interest or penalty.' })
    expect(fundSourceRepaymentForm(R({ principal: '70000' }))).toEqual({ ok: false, reason: 'The principal 70000 is more than the 64500.00 still owed on it.' })
    expect(fundSourceRepaymentForm(R({ bankId: '' }))).toEqual({ ok: false, reason: 'Pick the bank it is paid from.' })
    // A legacy source with no account of its own: the principal line has nowhere to go.
    expect(fundSourceRepaymentForm(R({ accountCode: null }))).toEqual({
      ok: false,
      reason: 'The principal line has no account yet — record this one from Payments › Create payment, where its account can be picked.',
    })
  })

  it('totals to the sen', () => {
    expect(repaymentTotal('0.1', '0.2', '')).toBe(0.3)
    expect(repaymentTotal('abc', '1', '1')).toBe(2)
  })
})
