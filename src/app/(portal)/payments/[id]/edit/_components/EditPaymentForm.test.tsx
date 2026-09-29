import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ updatePaymentVoucher: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../actions', () => ({ updatePaymentVoucher: mocks.updatePaymentVoucher }))
import EditPaymentForm from './EditPaymentForm'
import { officeDate } from '@/lib/office-clock'
beforeEach(() => vi.clearAllMocks())

describe('statutory voucher editor', () => {
  it('shows fixed financial details and submits only payment date and notes', async () => {
    render(<EditPaymentForm statutoryDetailsLocked voucher={{ id: 'pv', voucher_no: 'TEST-PV', voucher_type: 'salary_payout', direction: 'debit', amount: 600.60, payee_name: 'KWSP', payee_company_id: null, bank_account_id: 'bank', description: 'Recorded employee contributions', notes: null, payment_method: 'bank_transfer', payment_date: '2026-09-15', target_pool: null, fund_source_id: null, loan_id: null, repayment_breakdown: null }} initialSources={[{ pool: 'dept_pool_hr', amount: '600.60', account_code: '4020' }]} initialCreditAccountCode={null} companies={[]} bankAccounts={[{ id: 'bank', bank_name: 'Test Bank', account_number: '1234', current_balance: 0 }]} glAccounts={[]} />)
    expect(screen.getByText('KWSP')).toBeVisible()
    expect(screen.getByText('RM 600.60')).toBeVisible()
    expect(screen.getByText('Test Bank · 1234')).toBeVisible()
    expect(screen.getByRole('table', { name: 'Recorded source accounts' })).toHaveTextContent('4020')
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-09-16' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Confirmed payment date' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Edit statutory PV date and notes' }))
    await waitFor(() => expect(mocks.updatePaymentVoucher).toHaveBeenCalledTimes(1))
    const submitted = mocks.updatePaymentVoucher.mock.calls[0][0] as FormData
    expect(Object.fromEntries(submitted.entries())).toEqual({ id: 'pv', payment_date: '2026-09-16', notes: 'Confirmed payment date' })
  })
})

describe('salary voucher editor', () => {
  it('shows fixed salary details and directs financial changes through void and regenerate', async () => {
    render(<EditPaymentForm salaryDetailsLocked voucher={{ id: 'salary-pv', voucher_no: 'TEST-SALARY', voucher_type: 'salary_payout', direction: 'debit', amount: 8556.15, payee_name: 'Recorded Employee', payee_company_id: null, bank_account_id: 'bank', description: 'Recorded basic and commission payments', notes: null, payment_method: 'bank_transfer', payment_date: '2026-09-15', target_pool: null, fund_source_id: null, loan_id: null, repayment_breakdown: null }} initialSources={[{ pool: 'dept_pool_hr', amount: '8556.15', account_code: '4010' }]} initialCreditAccountCode={null} companies={[]} bankAccounts={[{ id: 'bank', bank_name: 'Funding Bank', account_number: '1234', current_balance: 0 }]} glAccounts={[]} />)
    expect(screen.getByText('Recorded salary payments')).toBeVisible()
    expect(screen.getByText(/void this PV and generate a new one from HR Payment/)).toBeVisible()
    expect(screen.getByText('RM 8,556.15')).toBeVisible()
    expect(screen.getByRole('link', { name: 'View recorded salary payments and receiving accounts' })).toHaveAttribute('href', '/payments/salary-pv')
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-09-18' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Confirmed salary payment date' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Edit salary PV date and notes' }))
    await waitFor(() => expect(mocks.updatePaymentVoucher).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries((mocks.updatePaymentVoucher.mock.calls[0][0] as FormData).entries())).toEqual({ id: 'salary-pv', payment_date: '2026-09-18', notes: 'Confirmed salary payment date' })
  })
})

describe('fund-source repayment draft editor', () => {
  const GL = [
    { code: '4054', name: 'Amount Due to - Lim Wei Siang', type: 'liability' as const, parent_code: '4200' },
    { code: '6000', name: 'Interest Expense - Fund Sources', type: 'cost' as const, parent_code: null },
    { code: '5027', name: 'Loan Interest', type: 'revenue' as const, parent_code: '5031' },
    { code: '1010', name: 'HV Operating Fund', type: 'equity' as const, parent_code: '1000' },
  ]
  const voucher = { id: 'rp', voucher_no: 'HV-PV-1', voucher_type: 'expense', direction: 'debit' as const, amount: 1950, payee_name: 'Director', payee_company_id: null, bank_account_id: 'bank', description: 'Loan Installment', notes: null, payment_method: 'bank_transfer', payment_date: '2026-09-08', target_pool: null, fund_source_id: 'fs-1', loan_id: null, repayment_breakdown: { principal: 1500, interest: 450, penalty: 0 } }
  const banks = [{ id: 'bank', bank_name: 'HLB', account_number: '1', current_balance: 0 }]

  it('rebuilds a lump saved row into principal + interest rows on the default accounts', () => {
    render(<EditPaymentForm voucher={voucher} initialSources={[{ pool: 'venture_pool', amount: '1950.00', account_code: '1010' }]} fundSourceAccount="4054" initialCreditAccountCode={null} companies={[]} bankAccounts={banks} glAccounts={GL} />)
    expect(screen.getByText(/本金 principal · 账户自动带出/)).toBeVisible()
    expect(screen.getByText(/利息 interest · 账户自动带出/)).toBeVisible()
    const amounts = screen.getAllByRole('spinbutton').map((el) => (el as HTMLInputElement).value)
    expect(amounts).toEqual(expect.arrayContaining(['1500.00', '450.00']))
    expect(screen.getAllByDisplayValue(/4054/).length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue(/6000/).length).toBeGreaterThan(0)
  })

  it('keeps a saved account that differs from the default, and 按拆分重带账户 puts it back', () => {
    render(<EditPaymentForm voucher={voucher} initialSources={[{ pool: 'venture_pool', amount: '1500.00', account_code: '4054' }, { pool: 'venture_pool', amount: '450.00', account_code: '5027' }]} fundSourceAccount="4054" initialCreditAccountCode={null} companies={[]} bankAccounts={banks} glAccounts={GL} />)
    expect(screen.getAllByDisplayValue(/5027/).length).toBeGreaterThan(0)
    expect(screen.getByText('利息 interest')).toBeVisible() // no "自动带出" — it was a saved pick
    fireEvent.click(screen.getByRole('button', { name: '按拆分重带账户' }))
    expect(screen.queryAllByDisplayValue(/5027/)).toHaveLength(0)
    expect(screen.getAllByDisplayValue(/6000/).length).toBeGreaterThan(0)
  })
})

// 2026-09-29: HV-PV-202609-0437 was created by the copy path, which omitted
// payment_date, so the editor opened with a blank date and saving kept the hole.
describe('a voucher saved without a payment date', () => {
  const voucher = { id: 'no-date', voucher_no: 'HV-PV-202609-0437', voucher_type: 'expense', direction: 'debit' as const, amount: 899.74, payee_name: 'Claimant', payee_company_id: null, bank_account_id: 'bank', description: "Claude Ai Claim - Sep'26", notes: null, payment_method: 'bank_transfer', payment_date: null, target_pool: null, fund_source_id: null, loan_id: null, repayment_breakdown: null }

  it('opens on the office date and refuses to be cleared', () => {
    render(<EditPaymentForm voucher={voucher} initialSources={[{ pool: 'venture_pool', amount: '899.74', account_code: '9000' }]} initialCreditAccountCode={null} companies={[]} bankAccounts={[{ id: 'bank', bank_name: 'HLB', account_number: '1', current_balance: 0 }]} glAccounts={[{ code: '9000', name: 'G&A Expenses', type: 'cost' as const, parent_code: null }]} />)
    const date = screen.getByLabelText('Payment date') as HTMLInputElement
    expect(date.value).toBe(officeDate())
    expect(date.required).toBe(true)
  })
})
