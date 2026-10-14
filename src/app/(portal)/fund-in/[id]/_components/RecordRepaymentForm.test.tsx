import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { inTimeZone } from '@/test/time-zone'

const mocks = vi.hoisted(() => ({
  createPaymentVoucher: vi.fn(async (_fd: FormData): Promise<{ error?: string } | undefined> => undefined),
}))
vi.mock('../../../payments/actions', () => ({ createPaymentVoucher: mocks.createPaymentVoucher }))
import RecordRepaymentForm from './RecordRepaymentForm'

const banks = [{ id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 62000 }]
const pools = [
  { value: 'venture_pool', label: 'Venture Pool' },
  { value: 'dept_pool_finance', label: 'Finance Dept Pool' },
]

function form(extra: Partial<Parameters<typeof RecordRepaymentForm>[0]> = {}) {
  return render(
    <RecordRepaymentForm
      fundSourceId="fs-ws"
      lender="Lim Wei Siang"
      lenderCompanyId={null}
      accountCode="4054"
      outstanding={64500}
      monthlyPrincipal={1500}
      monthlyInterest={450}
      bankAccounts={banks}
      pools={pools}
      activeAccounts={['4054', '6000', '9096']}
      {...extra}
    />,
  )
}
const box = (id: string) => document.getElementById(id) as HTMLInputElement

beforeEach(() => vi.clearAllMocks())

describe('Record repayment on a fund source', () => {
  it('starts from this month\'s instalment', () => {
    form()
    expect(box('repay_principal').value).toBe('1500.00')
    expect(box('repay_interest').value).toBe('450.00')
    expect(box('repay_penalty').value).toBe('0.00')
    expect(screen.getByText('RM 1,950.00')).toBeInTheDocument()
  })

  it('files the voucher Create payment files in loan-repayment mode', async () => {
    form()
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.createPaymentVoucher).toHaveBeenCalledTimes(1))
    const fd = mocks.createPaymentVoucher.mock.calls[0]![0]
    expect(Object.fromEntries(fd.entries())).toMatchObject({
      direction: 'debit',
      voucher_type: 'expense',
      payee_name: 'Lim Wei Siang',
      payee_company_id: '',
      amount: '1950.00',
      bank_account_id: 'bank-hl',
      payment_method: 'bank_transfer',
      fund_source_id: 'fs-ws',
      repayment_principal: '1500.00',
      repayment_interest: '450.00',
      repayment_penalty: '0.00',
      source_rows_count: '2',
      'source_rows[0][pool]': 'venture_pool',
      'source_rows[0][amount]': '1500.00',
      'source_rows[0][account_code]': '4054', // principal → the lender's own account
      'source_rows[1][amount]': '450.00',
      'source_rows[1][account_code]': '6000', // interest
      source_pool: 'venture_pool',
      description: 'Loan repayment — Lim Wei Siang',
    })
    expect(fd.get('payment_date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('takes every row from the pool that is chosen', async () => {
    form()
    fireEvent.change(document.getElementById('repay_pool')!, { target: { value: 'dept_pool_finance' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.createPaymentVoucher).toHaveBeenCalledTimes(1))
    const fd = mocks.createPaymentVoucher.mock.calls[0]![0]
    expect(fd.get('source_rows[0][pool]')).toBe('dept_pool_finance')
    expect(fd.get('source_rows[1][pool]')).toBe('dept_pool_finance')
    expect(fd.get('source_pool')).toBe('dept_pool_finance')
  })

  it('refuses principal beyond what is still owed', async () => {
    form()
    fireEvent.change(box('repay_principal'), { target: { value: '70000' } })
    fireEvent.submit(document.querySelector('form')!)
    // In English since 2026-10-15 (the refusal is `lib/fund-source-repayment`'s, the phone app's sheet's too).
    expect(await screen.findByText(/is more than the 64500\.00 still owed on it/)).toBeInTheDocument()
    expect(mocks.createPaymentVoucher).not.toHaveBeenCalled()
  })

  it('will not guess an account the chart does not have', async () => {
    // A legacy source with no account of its own: the principal row has nowhere to go.
    form({ accountCode: null })
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText(/The principal line has no account yet/)).toBeInTheDocument()
    expect(mocks.createPaymentVoucher).not.toHaveBeenCalled()
  })

  it('shows what the action answers when it refuses', async () => {
    mocks.createPaymentVoucher.mockResolvedValueOnce({ error: 'Cannot repay fund source with status repaid' })
    form()
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('Cannot repay fund source with status repaid')).toBeInTheDocument()
  })
})

// 2026-10-08: the payment date started on "today" built from the machine's own
// calendar — the office's day in the browser, but yesterday until 08:00 when
// the server (UTC) drew the page, so the two disagreed.
describe('Record repayment, after midnight in the office', () => {
  afterEach(() => vi.useRealTimers())

  it("dates the payment on the office's today, on the server and in the browser alike", () => {
    vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
    const element = (
      <RecordRepaymentForm
        fundSourceId="fs-ws" lender="Lim Wei Siang" lenderCompanyId={null} accountCode="4054" outstanding={64500}
        monthlyPrincipal={1500} monthlyInterest={450} bankAccounts={banks} pools={pools} activeAccounts={['4054', '6000', '9096']}
      />
    )
    const server = inTimeZone('UTC', () => renderToString(element))
    expect(inTimeZone('Asia/Kuala_Lumpur', () => renderToString(element))).toBe(server)
    const page = document.createElement('div')
    page.innerHTML = server
    expect(page.querySelector('input[type="date"]')?.getAttribute('value')).toBe('2026-11-01')
  })
})
