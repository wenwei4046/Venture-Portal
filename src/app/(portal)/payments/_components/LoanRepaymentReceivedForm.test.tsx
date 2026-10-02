import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ record: vi.fn(async (_fd: FormData) => undefined) }))
vi.mock('../../fund-out/actions', () => ({ recordLoanRepaymentReceived: mocks.record }))
import LoanRepaymentReceivedForm, { type LoanOption } from './LoanRepaymentReceivedForm'

const loan = (o: Partial<LoanOption> & Pick<LoanOption, 'id' | 'borrower'>): LoanOption => ({
  label: '', outstanding: 0, principal: 0, ratePct: 0, date: null, source: null, ...o,
})
const loans: LoanOption[] = [
  loan({ id: 'c-ws', borrower: 'The Cont', principal: 90000, outstanding: 64500, ratePct: 0.5, date: '2025-05-05', source: 'WS' }),
  loan({ id: 'c-mk', borrower: 'The Cont', principal: 9000, outstanding: 9000, ratePct: 2, date: '2026-02-26', source: 'MK' }),
  loan({
    id: 'hk', borrower: 'Hookka', principal: 52500, outstanding: 42500, date: '2026-03-26', source: 'LWS',
    suspenseCode: '3062', suspenseName: 'Interest in Suspense - Hookka', suspenseBalance: 1200,
  }),
]
const banks = [{ id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 0 }]

const amount = (id: string) => document.getElementById(id) as HTMLInputElement

beforeEach(() => vi.clearAllMocks())

describe('收到 Loan 还款', () => {
  it('chooses the loan in two steps and shows what is left after this payment', () => {
    render(<LoanRepaymentReceivedForm loans={loans} bankAccounts={banks} />)
    const parties = screen.getByRole('radiogroup', { name: '谁还钱' })
    fireEvent.click(within(parties).getByRole('radio', { name: /The Cont/ }))
    const deals = within(screen.getByRole('radiogroup', { name: '还哪一笔' })).getAllByRole('radio')
    expect(deals).toHaveLength(2)
    fireEvent.click(deals[0]) // 05 May 2025 · WS

    fireEvent.change(amount('principal'), { target: { value: '1500' } })
    fireEvent.change(amount('interest'), { target: { value: '450' } })
    const preview = screen.getByText('预览 · Preview').closest('aside')!
    expect(within(preview).getByText('The Cont')).toBeInTheDocument()
    expect(within(preview).getByText('RM 1,950.00')).toBeInTheDocument() // 合计收款
    expect(within(preview).getByText('RM 63,000.00')).toBeInTheDocument() // 64,500 − 1,500
  })

  it('submits the same fields as before', async () => {
    render(<LoanRepaymentReceivedForm loans={loans} bankAccounts={banks} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '谁还钱' })).getByRole('radio', { name: /Hookka/ }))
    fireEvent.change(amount('principal'), { target: { value: '10000' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1))
    const fd = mocks.record.mock.calls[0]![0]
    expect(fd.get('loan_id')).toBe('hk')
    expect(fd.get('repayment_principal')).toBe('10000')
    expect(fd.get('repayment_interest')).toBe('0.00')
    expect(fd.get('repayment_penalty')).toBe('0.00')
    expect(fd.get('bank_account_id')).toBe('bank-hl')
    expect(fd.get('payment_date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('offers the suspense account only when interest is recorded against a borrower that has one', () => {
    render(<LoanRepaymentReceivedForm loans={loans} bankAccounts={banks} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '谁还钱' })).getByRole('radio', { name: /Hookka/ }))
    expect(document.querySelector('[name="interest_account_code"]')).toBeNull()
    fireEvent.change(amount('interest'), { target: { value: '300' } })
    expect((document.querySelector('[name="interest_account_code"]') as HTMLSelectElement).value).toBe('3062')
  })

  it('refuses principal beyond what the loan still owes', async () => {
    render(<LoanRepaymentReceivedForm loans={loans} bankAccounts={banks} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '谁还钱' })).getByRole('radio', { name: /Hookka/ }))
    fireEvent.change(amount('principal'), { target: { value: '50000' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/超过该贷款尚欠/)).toBeInTheDocument()
    expect(mocks.record).not.toHaveBeenCalled()
  })
})
