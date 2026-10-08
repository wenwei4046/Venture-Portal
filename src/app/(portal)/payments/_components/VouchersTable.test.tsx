import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { inTimeZone } from '@/test/time-zone'

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

vi.mock('./AmendDateButton', () => ({
  default: (p: { kind: string; id: string; currentDate: string; label: string; autoOpen?: boolean; hideTrigger?: boolean }) => (
    <div data-testid="redate" data-auto={String(!!p.autoOpen)} data-hide={String(!!p.hideTrigger)}>
      {p.kind} · {p.id} · {p.currentDate} · {p.label}
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
  amendDate: { kind: 'repayment', id: 'abc', date: '2026-09-19' },
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
    expect(menuLabels()).toEqual(['打开', '在新分页打开', '改日期', '改金额'])

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

// 2026-10-02 (user: "这个日期我录错了怎么办？能自己改吗？" → "加").
describe('改日期 from the row menu', () => {
  const paid: VoucherRow = { ...voucher, id: 'pv-9', voucher_no: 'HV-OR-202610-0455', direction: 'credit', payee_name: 'Carres', amendDate: { kind: 'voucher', id: 'pv-9', date: '2026-10-01' } }

  it('is offered only on a row whose date can be corrected', () => {
    render(<VouchersTable rows={[voucher, paid]} />)
    fireEvent.contextMenu(rowOf('TNB')) // not paid, or payroll's: nothing to re-date here
    expect(menuLabels()).toEqual(['打开', '在新分页打开'])
    fireEvent.contextMenu(rowOf('Carres'))
    expect(menuLabels()).toEqual(['打开', '在新分页打开', '改日期'])
  })

  it('opens the dialog for that voucher, on its recorded date', () => {
    render(<VouchersTable rows={[paid, repayment]} />)
    expect(screen.queryByTestId('redate')).toBeNull()
    fireEvent.contextMenu(rowOf('Carres'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /改日期/ }))
    const dialog = screen.getByTestId('redate')
    expect(dialog).toHaveTextContent('voucher · pv-9 · 2026-10-01 · HV-OR-202610-0455')
    expect(dialog.dataset.auto).toBe('true')
    expect(dialog.dataset.hide).toBe('true')
  })

  it('…and for a loan repayment, which has no number: by what it is and who paid', () => {
    render(<VouchersTable rows={[paid, repayment]} />)
    fireEvent.contextMenu(rowOf('The Cont'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /改日期/ }))
    expect(screen.getByTestId('redate')).toHaveTextContent('repayment · abc · 2026-09-19 · 还款 · principal · The Cont')
  })
})

// 2026-10-02 (user: "我不希望他看到 payroll detail，也就是每个人的 payout"): an account
// without Payroll payouts is sent a payroll batch as ONE row — its total — in
// place of the batch's vouchers (lib/payroll-vouchers.ts).
describe('a locked payroll batch', () => {
  const locked: VoucherRow = {
    id: 'locked-Payroll disbursement Sep 2026',
    voucher_no: null,
    direction: 'debit',
    amount: 86420,
    payee_name: 'Payroll disbursement Sep 2026',
    status: 'paid',
    catLabel: 'Payroll',
    poolLabel: '—',
    description: '26 张 · 26 paid · 只显示总数',
    paymentOrCreatedDate: '2026-10-05',
    locked: true,
  }

  it('is a row like any other: what it is, how many, how much, when', () => {
    render(<VouchersTable rows={[voucher, locked]} />)
    const row = rowOf('Payroll disbursement Sep 2026')
    expect(row).toHaveTextContent('Payroll')
    expect(row).toHaveTextContent('26 张 · 26 paid · 只显示总数')
    expect(row).toHaveTextContent('−86,420.00')
    expect(row).toHaveTextContent('5 Oct')
    // It sorts by date with the vouchers: newest first.
    expect(Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td')[3]?.textContent)).toEqual([
      'Payroll disbursement Sep 2026', 'TNB',
    ])
  })

  it('opens nothing: no double-click, no menu, no Tab stop — while the voucher beside it still does', () => {
    render(<VouchersTable rows={[voucher, locked]} />)
    const row = rowOf('Payroll disbursement Sep 2026')
    fireEvent.doubleClick(screen.getByText('Payroll disbursement Sep 2026'))
    fireEvent.contextMenu(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(push).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(row.getAttribute('tabindex')).toBeNull()

    expect(rowOf('TNB').getAttribute('tabindex')).toBe('0')
    fireEvent.doubleClick(screen.getByText('TNB'))
    expect(push).toHaveBeenCalledWith('/payments/pv-1')
  })

  it('is not something to unfold', () => {
    render(<VouchersTable rows={[locked]} />)
    expect(screen.queryByText('展开')).toBeNull()
    expect(screen.queryByRole('button', { name: /Payroll disbursement/ })).toBeNull()
    expect(screen.getByRole('table')).toBeVisible()
  })
})

// 2026-10-08 (production): a voucher not yet paid is dated by the moment it
// was made, and that moment was read on the MACHINE's clock — "10 Sep" on the
// server (UTC), "11 Sep" in the browser (UTC+8) — so React threw the server's
// page away (#418). A payment date has no time and stays the day it names.
describe('on the office clock', () => {
  // 16:45 UTC on the 10th is a quarter to one on the 11th in the office.
  const pending: VoucherRow = { ...voucher, id: 'pv-2', voucher_no: 'HV-PV-202609-0440', status: 'pending_approval', payee_name: 'GDex', paymentOrCreatedDate: '2026-09-10T16:45:12.345+00:00' }
  const member = (id: string, payee: string): VoucherRow => ({ ...pending, id, payee_name: payee, batchKey: 'Payroll disbursement Sep 2026' })

  it('the server and the browser render the same ledger: a payment date as it is, a moment in office time', () => {
    const rows = [voucher, pending, member('pv-7', 'Aina'), member('pv-8', 'Bala')]
    const html = (zone: string) => inTimeZone(zone, () => renderToString(<VouchersTable rows={rows} />))
    const server = html('UTC')
    // The office, and a reader east of it — where the payment date would slip a day if moved.
    for (const zone of ['Asia/Kuala_Lumpur', 'Pacific/Kiritimati']) expect(html(zone), zone).toBe(server)
    expect(server).toContain('29 Sep') // TNB's payment date
    expect(server).toContain('11 Sep') // GDex, and the batch's header
    expect(server).not.toContain('10 Sep')
  })
})
