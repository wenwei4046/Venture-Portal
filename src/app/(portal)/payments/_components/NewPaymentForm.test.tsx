import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ createPaymentVoucher: vi.fn(async (_fd: FormData) => undefined) }))
vi.mock('../actions', () => ({ createPaymentVoucher: mocks.createPaymentVoucher }))
import NewPaymentForm from './NewPaymentForm'

// 2026-10-02: the form moved into the deal-form shell (four cards + the navy
// preview). The arrangement changed; what createPaymentVoucher receives must
// not have. These pin the field names and the serialised rows.

const companies = [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }]
const banks = [
  { id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 62000 },
  { id: 'bank-al', bank_name: 'Alliance Bank', account_number: '987-654-3210', current_balance: 276000 },
]
const accounts = [
  { code: '9000', name: 'G&A Expenses', type: 'expense' as const, parent_code: null, is_active: true },
  { code: '5019', name: 'Design Income', type: 'revenue' as const, parent_code: null, is_active: true },
  { code: '4054', name: 'Amount Due to - Lim Wei Siang', type: 'liability' as const, parent_code: '4200', is_active: true },
  { code: '6000', name: 'Interest Expense - Fund Sources', type: 'cost' as const, parent_code: null, is_active: true },
]
const fundSources = [
  {
    id: 'fs-ws', label: 'Lim Wei Siang · RM 90,000.00 @ 0.500%/mo · 60mo', source_type: 'director_loan',
    from_company_id: null, from_director_id: 'dir-ws', original_amount: 90000, cost_rate: 0.005, lock_in_months: 60,
    outstanding: 64500, monthly_payment: 1950, monthly_principal: 1500, monthly_interest: 450,
    total_periods: 60, periods_paid: 17, remaining_periods: 43, account_code: '4054',
    lender: 'Lim Wei Siang', lender_kind: '董事', effective_date: '2025-05-05',
  },
  {
    id: 'fs-hc1', label: 'HC · RM 300,000.00 @ 0.556%/mo · 36mo', source_type: 'subsidiary',
    from_company_id: 'co-hc', from_director_id: null, original_amount: 300000, cost_rate: 0.00556, lock_in_months: 36,
    outstanding: 8333.33, monthly_payment: 10001, monthly_principal: 8333.33, monthly_interest: 1668,
    total_periods: 36, periods_paid: 14, remaining_periods: 22, account_code: null,
    lender: 'HOUZS Century', lender_kind: '子公司', effective_date: '2025-01-01',
  },
  {
    id: 'fs-hc2', label: 'HC · RM 220,000.00 @ 2.000%/mo · 1mo', source_type: 'subsidiary',
    from_company_id: 'co-hc', from_director_id: null, original_amount: 220000, cost_rate: 0.02, lock_in_months: null,
    outstanding: 220000, monthly_payment: 4400, monthly_principal: 0, monthly_interest: 4400,
    total_periods: 1, periods_paid: 0, remaining_periods: 1, account_code: null,
    lender: 'HOUZS Century', lender_kind: '子公司', effective_date: '2026-08-05',
  },
]

const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null

function payment(extra: Partial<Parameters<typeof NewPaymentForm>[0]> = {}) {
  return render(
    <NewPaymentForm
      companies={companies}
      bankAccounts={banks}
      accounts={accounts}
      payableFundSources={fundSources}
      lockedDirection="debit"
      {...extra}
    />,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Create payment', () => {
  it('keeps every field createPaymentVoucher reads, under the same names', () => {
    payment()
    for (const name of [
      'direction', 'voucher_type', 'payee_company_id', 'payee_name', 'reference_type', 'reference_id',
      'amount', 'bank_account_id', 'payment_date', 'payment_method', 'target_pool', 'description', 'notes',
    ]) expect(field(name), name).not.toBeNull()
    expect(field('direction')!.value).toBe('debit')
    expect(field('voucher_type')!.value).toBe('expense')
    // The two toggles steer state only: an empty name never reaches FormData.
    const sent = [...new FormData(document.querySelector('form')!).keys()]
    expect(sent).not.toContain('')
    expect(sent.some((k) => /transfer|repayment/.test(k))).toBe(false)
  })

  it('arranges them as four cards beside the preview', () => {
    payment()
    for (const title of ['付给谁', '金额与银行', '哪个池出 · 记哪个科目', '说明与附件']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    expect(screen.getByText('预览 · Preview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create voucher (draft)' })).toBeInTheDocument()
  })

  it('offers the pools of departments added after the core five', () => {
    payment({ extraPools: [{ value: 'dept_pool_it', label: 'IT Dept Pool' }] })
    const poolSelect = screen.getAllByRole('combobox').find((el) => within(el).queryByText('Select pool…')) as HTMLSelectElement
    expect(within(poolSelect).getByText('IT Dept Pool')).toBeInTheDocument()
    expect(within(poolSelect).getByText('HR Dept Pool')).toBeInTheDocument()
  })

  it('shows in the preview what the voucher will do as it is typed', () => {
    payment()
    fireEvent.change(field('payee_name')!, { target: { value: 'TNB' } })
    fireEvent.change(field('amount')!, { target: { value: '1200' } })
    const preview = screen.getByText('预览 · Preview').closest('aside')!
    expect(within(preview).getByText('付给 TNB')).toBeInTheDocument()
    expect(within(preview).getByText('RM 1,200.00')).toBeInTheDocument()
    expect(within(preview).getAllByText('Hong Leong Bank ···7890').length).toBeGreaterThan(0)

    fireEvent.change(field('bank_account_id')!, { target: { value: 'bank-al' } })
    expect(within(preview).getAllByText('Alliance Bank ···3210').length).toBeGreaterThan(0)
    expect(within(preview).queryByText('Hong Leong Bank ···7890')).toBeNull()
  })

  it('an internal transfer changes the voucher type, and nothing else is added', () => {
    payment()
    fireEvent.click(screen.getByRole('checkbox', { name: /内部转账/ }))
    expect(field('voucher_type')!.value).toBe('internal_transfer')
  })

  it('serialises the pool rows exactly as before', async () => {
    payment()
    fireEvent.change(field('payee_name')!, { target: { value: 'TNB' } })
    fireEvent.change(field('amount')!, { target: { value: '500' } })
    const poolSelect = screen.getAllByRole('combobox').find((el) => within(el).queryByText('Select pool…')) as HTMLSelectElement
    fireEvent.change(poolSelect, { target: { value: 'dept_pool_finance' } })
    fireEvent.change(field('description')!, { target: { value: 'Electricity' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(mocks.createPaymentVoucher).toHaveBeenCalledTimes(1))
    const fd = mocks.createPaymentVoucher.mock.calls[0]![0]
    expect(fd.get('direction')).toBe('debit')
    expect(fd.get('amount')).toBe('500')
    expect(fd.get('bank_account_id')).toBe('bank-hl')
    expect(fd.get('source_rows_count')).toBe('1')
    expect(fd.get('source_rows[0][pool]')).toBe('dept_pool_finance')
    expect(fd.get('source_rows[0][amount]')).toBe('500.00') // auto-filled from the total
    expect(fd.get('source_pool')).toBe('dept_pool_finance')
    expect(fd.get('attachment_count')).toBe('0')
    expect(fd.has('fund_source_id')).toBe(false)
  })
})

describe('Create payment · loan repayment', () => {
  it('picks the loan in two steps, by the lender\'s full name', () => {
    payment()
    fireEvent.click(screen.getByRole('checkbox', { name: /这是还贷款/ }))
    const parties = screen.getByRole('radiogroup', { name: '还给谁' })
    expect(within(parties).getByRole('radio', { name: /HOUZS Century/ })).toHaveTextContent('2 笔')
    expect(within(parties).getByRole('radio', { name: /Lim Wei Siang/ })).toHaveTextContent('董事')

    fireEvent.click(within(parties).getByRole('radio', { name: /HOUZS Century/ }))
    const deals = within(screen.getByRole('radiogroup', { name: '还哪一笔' })).getAllByRole('radio')
    expect(deals).toHaveLength(2)
    // Oldest first; a deal with no fixed term shows a dash, not "1 of 1 periods left".
    expect(deals[0]).toHaveTextContent('01 Jan 2025')
    expect(deals[0]).toHaveTextContent('22 / 36')
    expect(deals[1]).toHaveTextContent('05 Aug 2026')
    expect(deals[1]).not.toHaveTextContent('1 / 1')
  })

  it('a lender with one loan fills the payee and the split straight away', async () => {
    payment()
    fireEvent.click(screen.getByRole('checkbox', { name: /这是还贷款/ }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '还给谁' })).getByRole('radio', { name: /Lim Wei Siang/ }))
    await waitFor(() => expect(field('amount')!.value).toBe('1950.00'))
    expect(field('payee_name')!.value).toBe('Director')

    fireEvent.change(field('description')!, { target: { value: 'Loan installment' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.createPaymentVoucher).toHaveBeenCalledTimes(1))
    const fd = mocks.createPaymentVoucher.mock.calls[0]![0]
    expect(fd.get('fund_source_id')).toBe('fs-ws')
    expect(fd.get('repayment_principal')).toBe('1500.00')
    expect(fd.get('repayment_interest')).toBe('450.00')
    // One row per component, each on its default account.
    expect(fd.get('source_rows_count')).toBe('2')
    expect(fd.get('source_rows[0][account_code]')).toBe('4054')
    expect(fd.get('source_rows[1][account_code]')).toBe('6000')
  })
})

describe('Create receipt', () => {
  it('keeps the receipt fields under the same names', () => {
    payment({ lockedDirection: 'credit' })
    for (const name of [
      'direction', 'voucher_type', 'payee_company_id', 'payee_name', 'amount', 'bank_account_id',
      'payment_date', 'payment_method', 'target_pool', 'source_pool', 'account_code', 'description', 'notes',
    ]) expect(field(name), name).not.toBeNull()
    expect(field('direction')!.value).toBe('credit')
    expect(field('voucher_type')!.value).toBe('receive_payment')
    expect(field('target_pool')!.value).toBe('venture_pool')
  })

  it('reads as a receipt: who it is from, where it lands, and no approval', () => {
    payment({ lockedDirection: 'credit' })
    expect(screen.getByText('收谁的钱')).toBeInTheDocument()
    expect(screen.getByText('进哪个池 · 记哪个科目')).toBeInTheDocument()
    fireEvent.change(field('payee_name')!, { target: { value: 'Carres' } })
    const preview = screen.getByText('预览 · Preview').closest('aside')!
    expect(within(preview).getByText('收自 Carres')).toBeInTheDocument()
    expect(within(preview).getByText('Venture Pool')).toBeInTheDocument()
    // Until an account is picked the panel cannot say P&L or balance sheet.
    expect(within(preview).getByText(/选了科目才知道/)).toBeInTheDocument()
    expect(within(preview).getByText('收到的钱即时入账,不需要审批。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create receipt' })).toBeInTheDocument()
    // No loan-repayment or internal-transfer toggle on a receipt.
    expect(screen.queryByRole('checkbox', { name: /这是还贷款/ })).toBeNull()
  })
})
