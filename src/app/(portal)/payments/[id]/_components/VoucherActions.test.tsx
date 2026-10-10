import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FinViewProvider } from '@/components/layout/fin-view'
import VoucherActions from './VoucherActions'

// What a Finance account and the Principal hold (2026-10-08, PR2: each button asks its own action).
const FINANCE = { create: true, edit: true, void: true, approve: false }
const PRINCIPAL = { create: true, edit: true, void: true, approve: true }

const props = () => ({ voucherId: 'salary', amount: 4302.70, bankBalance: 10000, bankName: 'Alliance',
  can: FINANCE, submitForApproval: vi.fn(), approveVoucher: vi.fn(), voidVoucher: vi.fn(),
  direction: 'debit', voucherType: 'other', reversePaidPayment: undefined })
describe('salary PV actions without generic paid reversal', () => {
  it('says the voucher is paid, without a reverse button', () => {
    render(<VoucherActions {...props()} status="paid" />)
    // The wording moved into the voucher page's panel on 2026-10-02; what this
    // pins is unchanged — a paid salary PV says it is paid and offers nothing.
    expect(screen.getByText(/已付款/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Reverse payment/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('retains the normal pending salary PV void action', () => {
    render(<VoucherActions {...props()} status="pending_approval" />)
    expect(screen.getByRole('button', { name: 'Void this voucher' })).toBeEnabled()
  })
})

// 2026-10-02: the actions moved from the foot of the page into its panel. What
// each state offers is the same as before.
describe('what each state offers', () => {
  const names = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].map((el) => el.textContent)

  it('a draft: submit, edit, void', () => {
    render(<VoucherActions {...props()} status="draft" />)
    expect(names()).toEqual(['Submit for approval', 'Void', 'Edit'])
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/payments/salary/edit')
  })

  it('pending, to Finance: edit, back to draft, void — and no Approve', () => {
    render(<VoucherActions {...props()} status="pending_approval" returnToDraft={vi.fn()} />)
    expect(screen.getByText(/等 Principal 批准/)).toBeVisible()
    expect(names()).toEqual(['退回 Draft', 'Void this voucher', 'Edit'])
  })

  it('pending, to the Principal: the bank balance, Approve, and a confirmation before it pays', () => {
    render(<VoucherActions {...props()} status="pending_approval" can={PRINCIPAL} returnToDraft={vi.fn()} />)
    expect(screen.getByText(/Alliance balance/)).toHaveTextContent('RM 10,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByText(/pays this voucher immediately/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve & Pay' })).toBeEnabled()
  })

  it('…who cannot approve what the bank cannot pay', () => {
    render(<VoucherActions {...props()} status="pending_approval" can={PRINCIPAL} bankBalance={100} />)
    expect(screen.getByRole('button', { name: 'Insufficient balance' })).toBeDisabled()
    expect(screen.getByText(/insufficient for RM 4,302.70 payment/)).toBeVisible()
  })

  it('a paid receipt can be voided, after asking', () => {
    const voidPaidReceipt = vi.fn(async () => undefined)
    render(<VoucherActions {...props()} status="paid" direction="credit" voidPaidReceipt={voidPaidReceipt} />)
    expect(screen.getByText(/已入账/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Void receipt/ }))
    expect(voidPaidReceipt).not.toHaveBeenCalled()
    expect(screen.getByText(/确认作废这张已付收据/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(voidPaidReceipt).toHaveBeenCalledTimes(1)
  })

  it('a maker raises and edits, and voids nothing', () => {
    render(<VoucherActions {...props()} can={{ create: true, edit: true, void: false, approve: false }} status="draft" />)
    expect(names()).toEqual(['Submit for approval', 'Edit'])
  })

  it('a checker approves, and neither edits nor voids', () => {
    render(<VoucherActions {...props()} can={{ create: false, edit: false, void: false, approve: true }} status="pending_approval" returnToDraft={vi.fn()} />)
    expect(names()).toEqual(['Approve'])
  })

  it('a paid voucher is reversed only by whoever voids', () => {
    render(<VoucherActions {...props()} can={{ create: true, edit: true, void: false, approve: false }} status="paid" direction="credit" voidPaidReceipt={vi.fn()} />)
    expect(names()).toEqual([])
  })

  it('a voided voucher offers nothing', () => {
    render(<VoucherActions {...props()} status="voided" />)
    expect(screen.getByText(/已作废/)).toBeVisible()
    expect(names()).toEqual([])
  })
})

// 2026-10-10 — the handoff (audit 2026-10-09 l, item 8): on the Finance view
// the panel speaks the builders' English — a status note with a dot in the
// status's colour, Return to draft, and Reverse payment / Void receipt as the
// panel's secondary (navy) buttons rather than a red outline.
describe('on the Finance view', () => {
  const fin = (ui: ReactElement) => render(<FinViewProvider value={true}>{ui}</FinViewProvider>)
  const names = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].map((el) => el.textContent)
  const note = () => document.querySelector('.pay-note') as HTMLElement

  it('a draft: still a draft, with its dot — submit, edit, void', () => {
    fin(<VoucherActions {...props()} status="draft" />)
    expect(note()).toHaveTextContent('Still a draft — not submitted yet.')
    expect(note().querySelector('.pay-note-dot')).toHaveAttribute('data-tone', 'draft')
    expect(names()).toEqual(['Submit for approval', 'Void', 'Edit'])
  })

  it('pending, to Finance: waiting for the Principal — edit, return to draft, void', () => {
    fin(<VoucherActions {...props()} status="pending_approval" returnToDraft={vi.fn()} />)
    expect(note()).toHaveTextContent('Waiting for Principal approval. You can still edit or void it until then.')
    expect(note().querySelector('.pay-note-dot')).toHaveAttribute('data-tone', 'pending_approval')
    expect(names()).toEqual(['Return to draft', 'Void this voucher', 'Edit'])
  })

  it('approved: ready to pay', () => {
    fin(<VoucherActions {...props()} status="approved" />)
    expect(note()).toHaveTextContent('Approved — ready to pay.')
  })

  it('a paid payment says Paid, and is reversed from a secondary button, after asking', () => {
    const reversePaidPayment = vi.fn(async () => undefined)
    fin(<VoucherActions {...props()} status="paid" reversePaidPayment={reversePaidPayment} />)
    expect(note()).toHaveTextContent(/^Paid\.$/)
    const reverse = screen.getByRole('button', { name: 'Reverse payment' })
    expect(reverse).toHaveClass('deal-side-btn2')
    expect(reverse).not.toHaveClass('deal-side-danger')
    fireEvent.click(reverse)
    expect(screen.getByText(/Reverse this paid payment\?/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(reversePaidPayment).toHaveBeenCalledTimes(1)
  })

  it('a paid receipt: received — bank, pool and GL updated — and Void receipt in the secondary style', () => {
    const voidPaidReceipt = vi.fn(async () => undefined)
    fin(<VoucherActions {...props()} status="paid" direction="credit" voidPaidReceipt={voidPaidReceipt} />)
    expect(note()).toHaveTextContent('Received — bank, pool and GL are updated.')
    const voidIt = screen.getByRole('button', { name: 'Void receipt' })
    expect(voidIt).toHaveClass('deal-side-btn2')
    fireEvent.click(voidIt)
    expect(screen.getByText(/Void this paid receipt\?/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(voidPaidReceipt).not.toHaveBeenCalled()
  })

  it('voided: Voided, and nothing to do', () => {
    fin(<VoucherActions {...props()} status="voided" />)
    expect(note()).toHaveTextContent(/^Voided\.$/)
    expect(note().querySelector('.pay-note-dot')).toHaveAttribute('data-tone', 'voided')
    expect(names()).toEqual([])
  })

  it('has no Chinese in any state', () => {
    for (const status of ['draft', 'pending_approval', 'approved', 'paid', 'voided']) {
      const { container, unmount } = fin(<VoucherActions {...props()} status={status} returnToDraft={vi.fn()} reversePaidPayment={vi.fn()} />)
      expect(container.innerHTML, status).not.toMatch(/[㐀-鿿]/)
      unmount()
    }
    const payroll = fin(<VoucherActions {...props()} status="pending_approval" can={PRINCIPAL} voucherType="payroll_bank_transfer" />)
    expect(payroll.container.innerHTML).not.toMatch(/[㐀-鿿]/)
  })
})
