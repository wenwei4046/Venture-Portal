import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { VoucherDetail } from '../_lib/voucher-detail'

// The hub's drawer (2026-10-14, the Finance revamp v2 — D05): the voucher in
// the design's hero and groups, and at its foot only what this reader may do
// in the state it is in — the system's own steps (an approval pays at once).

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  submit: vi.fn(),
  back: vi.fn(),
  approve: vi.fn(),
  void: vi.fn(),
  reverse: vi.fn(),
  voidReceipt: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../drawer-actions', () => ({ openVoucherDrawer: mocks.open }))
vi.mock('../actions', () => ({
  submitForApproval: mocks.submit,
  returnVoucherToDraft: mocks.back,
  approveVoucher: mocks.approve,
  voidVoucher: mocks.void,
  reversePaidPayment: mocks.reverse,
  voidPaidReceipt: mocks.voidReceipt,
  getAttachmentSignedUrl: vi.fn(),
  uploadVoucherAttachment: vi.fn(),
}))

import { VoucherDrawer } from './VoucherDrawer'

const DETAIL: VoucherDetail = {
  id: 'v1',
  no: 'HV-PV-202610-0044',
  status: 'draft',
  credit: false,
  amount: 25000,
  payee: 'Meta Platforms Ireland',
  payeeCompany: null,
  description: 'FB ads top-up',
  notes: null,
  method: 'Bank transfer',
  paymentDate: '2026-10-06',
  bank: { name: 'Hong Leong Bank', number: '5123-0098-77' },
  bankBalance: 100000,
  noCash: false,
  sources: [{ pool: 'Marketing Dept Pool', account: 'Advertising', code: '6100', amount: 25000, description: null }],
  account: 'Advertising',
  accountCodes: '6100',
  pool: 'Marketing Dept Pool',
  settledInvoices: [],
  files: [{ id: 'f1', name: 'advertising-invoice.pdf', type: 'application/pdf', size: 219136, uploadedAt: '2026-10-06T02:00:00Z' }],
  filesOpen: true,
  takesFiles: true,
  people: [],
  trail: [
    { label: 'Created', by: 'Aina', at: '2026-10-06T01:12:00Z', note: null, state: 'done' },
    { label: 'Submitted', by: null, at: null, note: null, state: 'todo' },
    { label: 'Approved', by: null, at: null, note: null, state: 'todo' },
    { label: 'Paid', by: null, at: null, note: null, state: 'todo' },
  ],
  createdBy: 'Aina',
  createdAt: '2026-10-06T01:12:00Z',
  can: { create: true, edit: true, void: true, approve: false },
  reversible: true,
  reference: null,
}

const drawn = async (detail: Partial<VoucherDetail>) => {
  mocks.open.mockResolvedValue({ ok: true, detail: { ...DETAIL, ...detail } })
  render(<VoucherDrawer id="v1" onClose={() => undefined} onChanged={() => undefined} />)
  await waitFor(() => expect(screen.getByText('Pay to Meta Platforms Ireland')).toBeInTheDocument())
}
const bar = () => {
  const dialog = screen.getByRole('dialog', { name: 'HV-PV-202610-0044' })
  return [...dialog.querySelectorAll('[class*="bar"] > *')].map((b) => b.getAttribute('aria-label') ?? b.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the drawer', () => {
  it('draws the hero, the groups and the files', async () => {
    await drawn({})
    const dialog = screen.getByRole('dialog', { name: 'HV-PV-202610-0044' })
    expect(within(dialog).getByText('Payment voucher · Advertising')).toBeInTheDocument()
    expect(within(dialog).getByText('Pay to Meta Platforms Ireland')).toBeInTheDocument()
    expect(within(dialog).getByText('Still a draft — not submitted yet.')).toBeInTheDocument()
    expect(within(dialog).getByText('06 Oct 2026')).toBeInTheDocument()
    expect(within(dialog).getByText('Attachments · 1 file')).toBeInTheDocument()
    expect(within(dialog).getByText('214 KB')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'View full page ↗' })).toHaveAttribute('href', '/payments/v1')
  })

  it('says each line’s own words beside its account (2026-10-22)', async () => {
    await drawn({
      sources: [
        { pool: 'Venture Pool', account: 'Office Rental', code: '9094', amount: 1200, description: 'October rent' },
        { pool: 'Marketing Dept Pool', account: 'Printing & Stationery', code: '9099', amount: 250, description: null },
      ],
    })
    const dialog = screen.getByRole('dialog', { name: 'HV-PV-202610-0044' })
    expect(within(dialog).getByText('October rent · Office Rental')).toBeInTheDocument()
    expect(within(dialog).getByText('Printing & Stationery')).toBeInTheDocument()
  })

  it('a draft: Submit for approval, Edit, and Void under ⋯', async () => {
    await drawn({})
    expect(bar()).toEqual(['Submit for approval', 'Edit', 'More'])
  })

  it('pending, for its maker: Edit and Return to draft, Void under ⋯', async () => {
    await drawn({ status: 'pending_approval' })
    expect(bar()).toEqual(['Edit', 'Return to draft', 'More'])
  })

  it('pending, for whoever decides it: Approve first', async () => {
    await drawn({ status: 'pending_approval', can: { create: true, edit: true, void: true, approve: true } })
    expect(bar()).toEqual(['Approve', 'Edit', 'More'])
  })

  it('paid: Reverse payment — not on a salary voucher, which goes back from HR Payment', async () => {
    await drawn({ status: 'paid' })
    expect(bar()).toEqual(['Reverse payment'])
    cleanup()
    await drawn({ status: 'paid', reversible: false })
    expect(screen.queryByRole('button', { name: 'Reverse payment' })).toBeNull()
  })

  it('without the actions, nothing to press', async () => {
    await drawn({ status: 'draft', can: { create: false, edit: false, void: false, approve: false } })
    expect(bar()).toEqual([])
  })

  it('voids only once it is confirmed', async () => {
    mocks.void.mockResolvedValue(undefined)
    await drawn({})
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Void voucher' }))
    expect(await screen.findByText('The voucher stays in the list as voided. This cannot be undone.')).toBeInTheDocument()
    expect(mocks.void).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Void voucher' }).at(-1)!)
    })
    await waitFor(() => expect(mocks.void).toHaveBeenCalledTimes(1))
    expect((mocks.void.mock.calls[0][0] as FormData).get('id')).toBe('v1')
  })

  it('says why a voucher does not open', async () => {
    mocks.open.mockResolvedValue({ ok: false, reason: 'payroll' })
    render(<VoucherDrawer id="v9" onClose={() => undefined} onChanged={() => undefined} />)
    expect(await screen.findByText('A salary voucher opens only with Payroll payouts.')).toBeInTheDocument()
  })
})
