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
import { FinViewProvider } from '@/components/layout/fin-view'

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

// 2026-10-09 — the Finance revamp (the user's Claude Design handoff): the
// status as a chip (pending in blue), the voucher number in the body face,
// a range on the amount and the date, the list in a scroll box, the receipt
// side's own words and its bank, and English on the Finance view.
describe('the Finance revamp', () => {
  const pending: VoucherRow = { ...voucher, id: 'pv-2', voucher_no: 'HV-PV-202609-0438', status: 'pending_approval', amount: 300 }
  const fin = (ui: React.ReactElement) => render(<FinViewProvider value={true}>{ui}</FinViewProvider>)

  it('shows the status as a chip, pending in blue', () => {
    render(<VouchersTable rows={[voucher, pending]} />)
    expect(screen.getByText('paid').closest('.chip')).toHaveClass('ledger')
    expect(screen.getByText('pending approval').closest('.chip')).toHaveClass('wait')
  })

  it('sets the voucher number in the body face, and the list in a scroll box', () => {
    render(<VouchersTable rows={[voucher]} />)
    const cell = screen.getByText('HV-PV-202609-0437').closest('td') as HTMLElement
    expect(cell.className).toContain('font-sans')
    expect(cell.className).not.toContain('font-mono')
    expect(document.querySelector('.st-box table')).not.toBeNull()
  })

  it('offers a range on the amount and on the date', () => {
    render(<VouchersTable rows={[voucher, pending]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Amount' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    fireEvent.click(screen.getByRole('button', { name: 'Filter Date' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Date' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
  })

  it('on the receipt side says Receipt # and Payer, and names the bank', () => {
    render(<VouchersTable side="receipts" rows={[{ ...voucher, direction: 'credit', bankLabel: 'Hong Leong' }]} />)
    const heads = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.replace(/[▲▼↕]/g, '').trim())
    expect(heads).toEqual(expect.arrayContaining(['Receipt #', 'Payer', 'Bank']))
    expect(heads).not.toContain('Voucher #')
    expect(screen.getByText('Hong Leong')).toBeInTheDocument()
  })

  it('speaks English on the Finance view: the row menu and a payroll batch', () => {
    const a = { ...voucher, id: 'pv-a', voucher_no: 'HV-PV-202609-0300', payee_name: 'Aina', batchKey: 'Payroll disbursement Aug 2026' }
    const b = { ...voucher, id: 'pv-b', voucher_no: 'HV-PV-202609-0301', payee_name: 'Bala', batchKey: 'Payroll disbursement Aug 2026' }
    fin(<VouchersTable rows={[repayment, a, b]} />)
    expect(screen.getByText(/2 vouchers/)).toBeInTheDocument()
    expect(screen.getByText('Expand')).toBeInTheDocument()
    // The payer is named twice on the Finance view: in its column, and as the
    // phone's title of a row that has no number (2026-10-10).
    fireEvent.contextMenu(screen.getAllByText('The Cont')[0].closest('tr') as HTMLElement)
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Openor double-click', 'Open in new tab', 'Change datewhen the date was keyed wrong', 'Change amountloan repayment rows'])
  })
})

// 2026-10-10 — the handoff's list, on the Finance view (audit 2026-10-09 l,
// items 3, 5, 6, 7, 9): plain figures in Inter-set rows, "pending", full
// dates, a Total under the Amount column, each phone row with its status and
// details in it, payroll batches as short lists, and the search's own words.
describe('the handoff’s list on the Finance view', () => {
  const fin = (ui: React.ReactElement) => render(<FinViewProvider value={true}>{ui}</FinViewProvider>)
  const pending: VoucherRow = { ...voucher, id: 'pv-2', voucher_no: 'HV-PV-202609-0438', status: 'pending_approval', amount: 300, payee_name: 'GDex', paymentOrCreatedDate: '2026-09-05' }
  const headKeys = () => Array.from(document.querySelectorAll('thead th')).map((th) => (th as HTMLElement).dataset.col ?? '')
  const cell = (row: HTMLElement, key: string) => row.querySelectorAll(':scope > td')[headKeys().indexOf(key)] as HTMLElement
  const footCell = (key: string) => document.querySelectorAll('tfoot tr td')[headKeys().indexOf(key)] as HTMLElement

  it('sets the figures plain — no sign, the regular weight — and the date in full', () => {
    fin(<VouchersTable rows={[voucher, pending]} />)
    const row = rowOf('HV-PV-202609-0437')
    const amount = cell(row, 'amount')
    expect(amount).toHaveTextContent(/^1,200\.00/)
    expect(amount).not.toHaveTextContent('−')
    expect(amount.querySelector('.font-semibold')).toBeNull()
    expect(cell(row, 'date')).toHaveTextContent('29 Sep 2026')
    expect(cell(rowOf('HV-PV-202609-0438'), 'date')).toHaveTextContent('05 Sep 2026')
  })

  it('says "pending" in the chip, and every cell in the body’s 12px', () => {
    fin(<VouchersTable rows={[voucher, pending]} />)
    const row = rowOf('HV-PV-202609-0438')
    expect(within(cell(row, 'status')).getByText('pending').closest('.chip')).toHaveClass('wait')
    expect(cell(row, 'status')).not.toHaveTextContent('approval')
    for (const key of ['poolLabel', 'payee_name', 'description']) {
      expect(cell(row, key).className, key).not.toMatch(/font-mono|text-\[11px\]|text-\[15px\]|text-sm/)
    }
  })

  it('a range on the amount reads the figure as it is shown, not as a negative', () => {
    fin(<VouchersTable rows={[voucher, pending]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    const dialog = screen.getByRole('dialog', { name: 'Filter Amount' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Range' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '1k – 10k' }))
    expect(screen.getByText('HV-PV-202609-0437')).toBeInTheDocument()
    expect(screen.queryByText('HV-PV-202609-0438')).toBeNull()
  })

  it('a receipt’s figure is green, still without a sign', () => {
    fin(<VouchersTable side="receipts" rows={[{ ...voucher, direction: 'credit' }]} />)
    const amount = cell(rowOf('HV-PV-202609-0437'), 'amount')
    expect(amount).not.toHaveTextContent('+')
    expect(amount.querySelector('.text-ledger')).toHaveTextContent('1,200.00')
  })

  it('ends on a Total of the rows on show, under the Amount column', () => {
    fin(<VouchersTable rows={[voucher, pending]} />)
    expect(document.querySelectorAll('tfoot tr td')).toHaveLength(document.querySelectorAll('thead th').length)
    expect(document.querySelector('tfoot tr td')).toHaveTextContent('Total')
    expect(footCell('amount')).toHaveTextContent('1,500.00')
    fireEvent.change(screen.getByPlaceholderText('Search voucher #, payee, description…'), { target: { value: 'gdex' } })
    expect(footCell('amount')).toHaveTextContent('300.00')
  })

  it('on a phone, a row carries its status and its details under the number, and the figure says what it is', () => {
    fin(<VouchersTable rows={[voucher]} />)
    const row = rowOf('HV-PV-202609-0437')
    const line = cell(row, 'voucher_no').querySelector('.pay-msub') as HTMLElement
    expect(line).toHaveClass('md:hidden')
    expect(line.querySelector('.chip.ledger')).toHaveTextContent('paid')
    for (const text of ['Category utilities', 'Pool Venture', 'Payee TNB', 'Description September bill', 'Date 29 Sep 2026']) {
      expect(line).toHaveTextContent(text)
    }
    const label = cell(row, 'amount').querySelector('.pay-mlabel') as HTMLElement
    expect(label).toHaveClass('md:hidden')
    expect(label).toHaveTextContent('Amount')
  })

  it('…and a row without a number is titled by whom it is from', () => {
    fin(<VouchersTable side="receipts" rows={[repayment]} />)
    const title = document.querySelector('tbody .pay-mtitle') as HTMLElement
    expect(title).toHaveClass('md:hidden')
    expect(title).toHaveTextContent('The Cont')
  })

  it('a payroll batch: the amount in red, and opened, a short list — number, person, amount, status — with no table of its own', () => {
    const a: VoucherRow = { ...voucher, id: 'pv-a', voucher_no: 'HV-PV-202609-0300', payee_name: 'Aina', amount: 3200.5, batchKey: 'Payroll disbursement Aug 2026', paymentOrCreatedDate: '2026-09-05' }
    const b: VoucherRow = { ...a, id: 'pv-b', voucher_no: 'HV-PV-202609-0301', payee_name: 'Bala', amount: 4100.25, status: 'pending_approval' }
    fin(<VouchersTable rows={[a, b]} />)
    const head = screen.getByRole('button', { name: /Payroll disbursement Aug 2026/ })
    expect(head.querySelector('.pay-batch-amt')).toHaveTextContent('−7,300.75')
    expect(head).toHaveTextContent('2 vouchers · 1 paid · 1 pending')
    expect(head).toHaveTextContent('05 Sep')
    fireEvent.click(head)
    const list = screen.getByRole('list', { name: 'Payroll disbursement Aug 2026' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => Array.from(li.children).map((c) => c.textContent))).toEqual([
      ['HV-PV-202609-0300', 'Aina', '3,200.50', 'paid'],
      ['HV-PV-202609-0301', 'Bala', '4,100.25', 'pending'],
    ])
    expect(document.querySelector('table')).toBeNull()
    expect(screen.queryByRole('button', { name: /Columns/ })).toBeNull()
    fireEvent.doubleClick(within(items[1]).getByText('Bala'))
    expect(push).toHaveBeenLastCalledWith('/payments/pv-b')
    fireEvent.contextMenu(items[0])
    expect(screen.getByRole('menu', { name: 'Actions for HV-PV-202609-0300 · paid' })).toBeInTheDocument()
  })

  it('a locked payroll batch reads in English: how many, their status, total only', () => {
    const locked: VoucherRow = {
      id: 'locked-Payroll disbursement Sep 2026', voucher_no: null, direction: 'debit', amount: 86420,
      payee_name: 'Payroll disbursement Sep 2026', status: 'paid', catLabel: 'Payroll', poolLabel: '—',
      description: '26 张 · 26 paid · 只显示总数', paymentOrCreatedDate: '2026-10-05', locked: true,
      lockedNote: { count: 26, statusText: '26 paid' },
    }
    fin(<VouchersTable rows={[locked]} />)
    const row = document.querySelector('tbody tr') as HTMLElement
    expect(cell(row, 'description')).toHaveTextContent('26 vouchers · 26 paid · total only')
    // The cells this table draws (the phone's chevron cell is SortableTable's own).
    for (const td of Array.from(row.querySelectorAll(':scope > td:not(.lt-toggle)'))) expect(td.innerHTML).not.toMatch(/[㐀-鿿]/)
  })

  it('searches by the side’s own words', () => {
    const { unmount } = fin(<VouchersTable rows={[voucher]} />)
    expect(screen.getByPlaceholderText('Search voucher #, payee, description…')).toBeInTheDocument()
    unmount()
    fin(<VouchersTable side="receipts" rows={[{ ...voucher, direction: 'credit' }]} />)
    expect(screen.getByPlaceholderText('Search receipt #, from, description…')).toBeInTheDocument()
  })
})

// Audit 2026-10-09 l, item 5: the list kept its box only while no ?q= was set
// (the flat, searched list had none). The list is boxed either way now.
describe('the scroll box', () => {
  it('stays when the batches are laid flat for a search', () => {
    render(<VouchersTable rows={[voucher]} collapseBatches={false} />)
    expect(document.querySelector('.st-box table')).not.toBeNull()
  })
})
