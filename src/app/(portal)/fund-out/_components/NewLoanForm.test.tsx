import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NewLoanForm from './NewLoanForm'

vi.mock('../actions', () => ({ createLoan: vi.fn() }))

const companies = [
  { id: 'c1', name: 'The Cont Sdn Bhd', short_code: 'CONT', is_active: true, created_at: '', updated_at: '' },
]
const bsAccounts = [{ code: '1105', name: 'Loans Receivable · The Cont', account_type: 'asset', parent_code: null }]
const banks = [
  { id: 'b1', bank_name: 'Maybank', account_number: '5140 1234 5678', current_balance: 250000, is_primary: true },
]

function setup() {
  return render(<NewLoanForm companies={companies} baseRate={{ rate: 0.01, quarter: '2026 Q3' }} bsAccounts={bsAccounts} banks={banks} />)
}

const byName = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement

describe('NewLoanForm (2026-09-22 shell)', () => {
  it('keeps every field createLoan reads, under the same names', () => {
    setup()
    for (const n of [
      'company_id', 'loan_start_date', 'funding_source', 'principal', 'custom_rate_percent', 'tenure_months',
      'repayment_start_date', 'compound_interest', 'min_pay_interest', 'disbursement_account_code', 'bank_account_id', 'repayment_terms',
    ]) expect(byName(n), n).not.toBeNull()
  })

  it('shows the rate box before a borrower is picked, and Submit stays disabled until one is', () => {
    setup()
    expect(screen.getByText('Locked effective')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Submit for approval' })
    expect(submit).toBeDisabled()
    fireEvent.change(byName('company_id'), { target: { value: 'c1' } })
    expect(submit).toBeEnabled()
    expect(screen.getByText('The Cont Sdn Bhd')).toBeInTheDocument()
  })

  it('preview recomputes as the user types: 100k @ base 1 + 0.5 × 12', () => {
    setup()
    fireEvent.change(byName('principal'), { target: { value: '100000' } })
    fireEvent.change(byName('custom_rate_percent'), { target: { value: '0.5' } })
    fireEvent.change(byName('tenure_months'), { target: { value: '12' } })
    fireEvent.change(byName('loan_start_date'), { target: { value: '2026-09-22' } })
    expect(screen.getByText('RM 8,333.33')).toBeInTheDocument()
    expect(screen.getByText('RM 1,500.00')).toBeInTheDocument()
    expect(screen.getByText('RM 9,833.33')).toBeInTheDocument()
    expect(screen.getByText('RM 18,000.00')).toBeInTheDocument()
    expect(screen.getByText('22 Sep 2027 · 12 期')).toBeInTheDocument() // no first date: start + 12
    expect(screen.getByText('Maybank ···5678')).toBeInTheDocument()
    // A first installment date moves the plan: first + 11 months, like fund in.
    fireEvent.change(byName('repayment_start_date'), { target: { value: '2026-10-05' } })
    expect(screen.getByText('5 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('5 Sep 2027 · 12 期')).toBeInTheDocument()
  })

  it('repayment period accepts up to 120 months and is labelled like fund in', () => {
    setup()
    expect(screen.getByText('Repayment period')).toBeInTheDocument()
    expect(byName('tenure_months').max).toBe('120')
    fireEvent.change(byName('principal'), { target: { value: '80000' } })
    fireEvent.change(byName('tenure_months'), { target: { value: '60' } })
    expect(screen.getByText('RM 1,333.33')).toBeInTheDocument()
  })

  it('blank tenure reads 无固定期限; 利滚利 relabels the interest line', () => {
    setup()
    fireEvent.change(byName('principal'), { target: { value: '100000' } })
    expect(screen.getByText('— · 无固定期限')).toBeInTheDocument()
    expect(screen.getByText('每月利息')).toBeInTheDocument()
    fireEvent.click(byName('compound_interest'))
    expect(screen.getByText('首月利息')).toBeInTheDocument()
    expect(screen.getByText('视还款情况（利滚利）')).toBeInTheDocument()
  })

  it('Repayment terms is folded away by default', () => {
    setup()
    const details = byName('repayment_terms').closest('details')
    expect(details).not.toBeNull()
    expect(details!.open).toBe(false)
  })
})
