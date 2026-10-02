import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ record: vi.fn(async (_fd: FormData) => undefined) }))
vi.mock('../../fund-out/actions', () => ({ recordLoanRepaymentReceived: mocks.record }))
import LoanRepaymentReceivedForm, { type LoanOption } from './LoanRepaymentReceivedForm'

const loan = (o: Partial<LoanOption> & Pick<LoanOption, 'id' | 'borrower'>): LoanOption => ({
  label: '', outstanding: 0, principal: 0, ratePct: 0, date: null, source: null, ...o,
})
const loans: LoanOption[] = [
  // 60 installments, 43 still owed; and a compounding loan, which has none.
  loan({ id: 'c-ws', borrower: 'The Cont', principal: 90000, outstanding: 64500, ratePct: 0.5, date: '2025-05-05', source: 'WS', periods: { total: 60, remaining: 43 } }),
  loan({ id: 'c-mk', borrower: 'The Cont', principal: 9000, outstanding: 9000, ratePct: 2, date: '2026-02-26', source: 'MK', periods: null }),
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

  // 2026-10-02 (user: "可以看到 installment 欠多少 total 多少期? 类似 03/06 期").
  it('shows each loan’s installments: how many it runs for, and how many are still owed', () => {
    render(<LoanRepaymentReceivedForm loans={loans} bankAccounts={banks} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '谁还钱' })).getByRole('radio', { name: /The Cont/ }))
    const list = screen.getByRole('radiogroup', { name: '还哪一笔' })
    const header = Array.from(list.firstElementChild!.children).map((c) => c.textContent)
    expect(header).toEqual(['借出日期', '本金', '月息', '期数', '还剩', '尚欠', '资金来源'])

    const cells = (row: HTMLElement) => Array.from(row.children).map((c) => c.textContent)
    const [ws, mk] = within(list).getAllByRole('radio')
    expect(cells(ws).slice(3, 5)).toEqual(['60 期', '43 / 60'])
    // No fixed term: a dash in both, greyed.
    expect(cells(mk).slice(3, 5)).toEqual(['—', '—'])
    expect(mk.children[3].className).toContain('text-muted')
    // Seven columns need more room than five.
    expect(list.style.minWidth).toBe('672px')
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
