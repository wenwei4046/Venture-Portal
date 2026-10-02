import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
// The dialog is a stand-in that says which repayment it was opened for, and
// whether it arrived open and without a trigger of its own.
vi.mock('./AmendRepaymentButton', () => ({
  default: (p: { repaymentId: string; currentAmount: number; label: string; autoOpen?: boolean; hideTrigger?: boolean }) => (
    <div data-testid="amend" data-auto={String(!!p.autoOpen)} data-hide={String(!!p.hideTrigger)}>
      {p.repaymentId} · {p.currentAmount} · {p.label}
    </div>
  ),
}))

import VouchersTable, { type VoucherRow } from './VouchersTable'

const voucher: VoucherRow = {
  id: 'pv-1',
  voucher_no: 'HV-PV-202609-0437',
  direction: 'debit',
  amount: 1200,
  payee_name: 'TNB',
  status: 'paid',
  catLabel: 'utilities',
  poolLabel: 'Venture',
  description: 'September bill',
  paymentOrCreatedDate: '2026-09-29',
}
// A received loan repayment: no voucher of its own, and it opens the loan.
const repayment: VoucherRow = {
  id: 'rpy-abc',
  voucher_no: null,
  direction: 'credit',
  amount: 1000,
  payee_name: 'The Cont',
  status: 'received',
  catLabel: '还款 · principal',
  poolLabel: 'Venture',
  description: 'Loan principal repayment',
  paymentOrCreatedDate: '2026-09-19',
  href: '/fund-out/loan-9',
}

const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement
const menuLabels = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "view 变这样了,可以 remove,我希望双击点开").
describe('VouchersTable', () => {
  it('has no View column, and 改金额 is not on the row any more', () => {
    render(<VouchersTable rows={[voucher, repayment]} />)
    expect(Array.from(document.querySelectorAll('thead th[data-col]')).map((h) => (h as HTMLElement).dataset.col)).toEqual([
      'voucher_no', 'catLabel', 'poolLabel', 'payee_name', 'description', 'amount', 'status', 'date',
    ])
    expect(screen.queryByText('View')).toBeNull()
    expect(screen.queryByText('改金额')).toBeNull()
    expect(screen.queryByTestId('amend')).toBeNull()
  })

  it('the date reads from the left, the amount from the right', () => {
    render(<VouchersTable rows={[voucher]} />)
    expect(screen.getByText('29 Sep').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(screen.getByText(/1,200\.00/).closest('td')!.classList.contains('text-right')).toBe(true)
  })

  it('a double-click opens the voucher — or, for a row from another module, its own page', () => {
    render(<VouchersTable rows={[voucher, repayment]} />)
    fireEvent.doubleClick(screen.getByText('TNB'))
    expect(push).toHaveBeenLastCalledWith('/payments/pv-1')
    fireEvent.doubleClick(screen.getByText('The Cont'))
    expect(push).toHaveBeenLastCalledWith('/fund-out/loan-9')
  })

  it('a right-click offers opening it, here or in a new tab', () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<VouchersTable rows={[voucher, repayment]} />)
    fireEvent.contextMenu(rowOf('TNB'))
    expect(screen.getByRole('menu', { name: 'Actions for HV-PV-202609-0437 · paid' })).toBeInTheDocument()
    expect(menuLabels()).toEqual(['打开', '在新分页打开'])

    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /在新分页打开/ }))
    expect(opened).toHaveBeenCalledWith('/payments/pv-1', '_blank', 'noopener,noreferrer')
    expect(push).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.contextMenu(rowOf('TNB'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^打开/ }))
    expect(push).toHaveBeenCalledWith('/payments/pv-1')
    opened.mockRestore()
  })

  it('改金额 is in the menu of a received loan repayment only, and opens for that repayment', () => {
    render(<VouchersTable rows={[voucher, repayment]} />)
    fireEvent.contextMenu(rowOf('The Cont'))
    expect(screen.getByRole('menu', { name: 'Actions for 还款 · principal · received' })).toBeInTheDocument()
    expect(menuLabels()).toEqual(['打开', '在新分页打开', '改金额'])

    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /改金额/ }))
    const dialog = screen.getByTestId('amend')
    expect(dialog).toHaveTextContent('abc · 1000 · 还款 · principal') // 'rpy-' stripped: the repayment's own id
    expect(dialog.dataset.auto).toBe('true')
    expect(dialog.dataset.hide).toBe('true')
  })

  it('the rows of a payroll batch open the same way once the batch is unfolded', () => {
    const member = (id: string, payee: string): VoucherRow => ({
      ...voucher,
      id,
      payee_name: payee,
      batchKey: 'Payroll disbursement Sep 2026',
    })
    render(<VouchersTable rows={[voucher, member('pv-7', 'Aina'), member('pv-8', 'Bala')]} />)
    expect(screen.queryByText('Aina')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Payroll disbursement Sep 2026/ }))
    fireEvent.doubleClick(screen.getByText('Bala'))
    expect(push).toHaveBeenLastCalledWith('/payments/pv-8')
  })
})
