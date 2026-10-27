import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { amendWindow, type AmendFacts } from '@/lib/fund-amend'

// A loan's Amend terms in English, both ways open to Finance (2026-10-27, the mockup terms-first-month-mockup.html —
// "照这个样稿做"). Finance files the whole terms — the rate, the tenure, compounding — never the disbursement or the
// terms' words; the Principal saves them at once.

const mocks = vi.hoisted(() => ({ amendLoan: vi.fn(), amendLoanFrom: vi.fn() }))
vi.mock('../../actions', () => ({ amendLoan: mocks.amendLoan, amendLoanFrom: mocks.amendLoanFrom }))

import LoanAmendForm from './LoanAmendForm'

const FACTS: AmendFacts = {
  party: 'The Cont',
  moneyDate: '2026-02-15',
  firstDue: '2026-03-15',
  window: amendWindow('2026-03', null),
  principal: 58000,
  paidByMonth: {},
  currentBase: 58000,
}
const PROPS = {
  loanId: 'lo-3',
  ratePct: '4',
  tenureMonths: '6',
  disbursementDate: '2026-02-15',
  repaymentTerms: 'EMI · [LO#3] · 资金来源: HC-58k',
  compound: false,
  nextMonth: '2026-11',
  facts: FACTS,
}
const sent = (fn: { mock: { calls: unknown[][] } }) => Object.fromEntries((fn.mock.calls[0][0] as FormData).entries())

beforeEach(() => {
  vi.clearAllMocks()
  mocks.amendLoan.mockResolvedValue(undefined)
  mocks.amendLoanFrom.mockResolvedValue(undefined)
})

describe('a loan’s Amend terms', () => {
  it('Finance files the whole terms: the tenure and why — not the disbursement, not the words', async () => {
    render(<LoanAmendForm {...PROPS} direct={false} />)
    expect(screen.getByTestId('amend-facts')).toHaveTextContent('Disbursed 15 Feb 2026 · first instalment 15 Mar 2026')
    fireEvent.click(screen.getByRole('radio', { name: /From the first instalment/ }))
    expect(screen.queryByLabelText('Disbursement date')).toBeNull()
    expect(screen.queryByLabelText('Repayment terms (words)')).toBeNull()
    fireEvent.change(screen.getByLabelText('Tenure (months)'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'twelve months agreed' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.amendLoan).toHaveBeenCalled())
    expect(sent(mocks.amendLoan)).toEqual({ loan_id: 'lo-3', tenure_months: '12', reason: 'twelve months agreed' })
  })

  it('the Principal saves the whole terms with the disbursement and the words', () => {
    render(<LoanAmendForm {...PROPS} direct />)
    fireEvent.click(screen.getByRole('radio', { name: /From the first instalment/ }))
    expect(screen.getByLabelText('Disbursement date')).toHaveValue('2026-02-15')
    expect(screen.getByLabelText('Repayment terms (words)')).toHaveValue('EMI · [LO#3] · 资金来源: HC-58k')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('a later month starts the month after the first instalment at the earliest', () => {
    render(<LoanAmendForm {...PROPS} direct={false} />)
    expect(screen.getByLabelText('Effective from')).toHaveAttribute('min', '2026-04')
    expect(screen.getByTestId('amend-earliest')).toHaveTextContent('Earliest Apr 2026. Mar 2026 is the first instalment')
  })
})
