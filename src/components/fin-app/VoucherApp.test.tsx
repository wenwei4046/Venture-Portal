import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { HubLedger, HubRow } from '@/app/(portal)/payments/_lib/hub-ledger'
import type { VoucherDetail } from '@/app/(portal)/payments/_lib/voucher-detail'

// Daily › Payment in the Finance phone app (2026-10-15, M02–M05): the hub's
// stacked cards open a list, a row opens the voucher (the drawer's parts, read
// by openVoucherPage), Back steps back; the windows are the desktop's.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), openPage: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/daily/payments',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/app/(portal)/payments/page-actions', () => ({ openVoucherPage: mocks.openPage }))
vi.mock('@/app/(portal)/payments/actions', () => ({
  approveVoucher: vi.fn(),
  getAttachmentSignedUrl: vi.fn(),
  returnVoucherToDraft: vi.fn(),
  reversePaidPayment: vi.fn(),
  submitForApproval: vi.fn(),
  uploadVoucherAttachment: vi.fn(),
  voidPaidReceipt: vi.fn(),
  voidVoucher: vi.fn(),
}))
vi.mock('@/app/(portal)/payments/_components/CreatePaymentDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-payment">Create payment sheet</div> : null),
}))
vi.mock('@/app/(portal)/receipts/_components/CreateReceiptDialog', () => ({ default: () => null }))
vi.mock('@/app/(portal)/receipts/_components/LoanRepaymentDialog', () => ({ default: () => null }))
vi.mock('@/app/(portal)/payments/_components/AmendDateButton', () => ({ default: () => null }))
vi.mock('@/app/(portal)/payments/[id]/_components/ReassignGlAccountButton', () => ({ default: () => null }))
vi.mock('@/app/(portal)/payments/[id]/_components/CopyAsDraft', () => ({ CopyVoucherDialog: () => null }))

import FinAppFrame from './FinAppFrame'
import VoucherApp from './VoucherApp'
import { resetNav } from './nav'

const row = (over: Partial<HubRow> & { id: string }): HubRow => ({
  kind: 'voucher',
  no: `HV-PV-202610-${over.id}`,
  name: 'Tenaga Nasional',
  desc: 'Electricity Sep',
  amount: 100,
  status: 'paid',
  date: '2026-10-05',
  cat: 'Utilities',
  pool: 'Venture Pool',
  bank: null,
  href: null,
  cards: ['all', over.status ?? 'paid'] as HubRow['cards'],
  items: 1,
  batch: null,
  amendDate: null,
  amendAmount: false,
  ...over,
})

const LEDGER: HubLedger = {
  receipts: false,
  seesPayroll: true,
  byPerson: false,
  hero: { label: 'Total paid · October 2026', amount: 256684.6 },
  cards: [
    { key: 'all', count: 3, other: 0, amount: 27186 },
    { key: 'draft', count: 1, other: 0, amount: 1386 },
    { key: 'pending_approval', count: 1, other: 0, amount: 25000 },
    { key: 'approved', count: 0, other: 0, amount: 0 },
    { key: 'paid', count: 1, other: 0, amount: 800 },
    { key: 'voided', count: 0, other: 0, amount: 0 },
    { key: 'payroll', count: 1, other: 0, amount: 6200 },
  ],
  rows: [
    row({ id: '0001', name: 'Meta Platforms Ireland', desc: 'FB ads top-up', amount: 25000, status: 'pending_approval', cards: ['all', 'pending_approval'] }),
    row({ id: '0002', name: 'Google Asia Pacific', desc: 'Workspace Oct', amount: 1386, status: 'draft', cards: ['all', 'draft'] }),
    row({ id: '0003', amount: 800 }),
  ],
  batches: [
    {
      key: 'Payroll disbursement Sep 2026',
      name: 'Payroll disbursement Sep 2026',
      count: 2,
      total: 6200,
      latest: '2026-10-05',
      statusText: 'all paid',
      members: [
        { id: null, who: 'Marketing', no: '2 vouchers', amount: 6200, status: 'paid' },
      ],
      locked: true,
    },
  ],
  initialCard: 'all',
  initialQuery: '',
  empty: false,
}

const DETAIL: VoucherDetail = {
  id: '0001',
  no: 'HV-PV-202610-0001',
  status: 'pending_approval',
  credit: false,
  amount: 25000,
  payee: 'Meta Platforms Ireland',
  payeeCompany: null,
  description: 'FB ads top-up',
  notes: null,
  method: 'Bank transfer',
  paymentDate: '2026-10-06',
  bank: { name: 'Hong Leong', number: '5123-0098-77' },
  bankBalance: 90000,
  noCash: false,
  sources: [{ pool: 'Marketing Pool', account: 'Advertising', code: '6100', amount: 25000 }],
  account: 'Advertising',
  accountCodes: '6100',
  pool: 'Marketing Pool',
  settledInvoices: [],
  files: [],
  filesOpen: true,
  takesFiles: true,
  people: [],
  trail: [
    { label: 'Created', by: 'Aina', at: '2026-10-06T01:12:00Z', note: null, state: 'done' },
    { label: 'Submitted', by: 'Aina', at: '2026-10-06T01:30:00Z', note: null, state: 'done' },
    { label: 'Approved', by: null, at: null, note: null, state: 'todo' },
  ],
  createdBy: 'Aina',
  createdAt: '2026-10-06T01:12:00Z',
  can: { create: true, edit: true, void: true, approve: false },
  reversible: false,
  reference: null,
}

const draw = (search = '') =>
  render(
    <FinAppFrame platform="android" rows={['payments', 'receipts', 'invoices', 'billing']}>
      <VoucherApp
        hub="payments"
        search={search}
        ledger={LEDGER}
        record={null}
        refused={null}
        canCreate
        create={{ prefix: 'HV-PV-202610', today: '2026-10-15', open: false, initial: null }}
        today="2026-10-15"
        dept={[]}
        payroll={[]}
        claims={[]}
      />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/daily/payments')
  mocks.openPage.mockResolvedValue({ ok: true, detail: DETAIL, extras: null, canCopy: true })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('Daily › Payment on the phone', () => {
  it('opens on the hub: the top tabs, the month’s total and a stacked card per list', () => {
    draw()
    expect(screen.getByRole('link', { name: 'Payment' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('RM 256,684.60')).toBeInTheDocument()
    expect(screen.getByText('Total paid · October 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All vouchers 3 vouchers RM 27,186\.00$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pending approval 1 voucher RM 25,000\.00$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create payment' })).toBeInTheDocument()
  })

  it('a card opens its list — a step of the browser’s history — and the search narrows it', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^All vouchers/ }))
    expect(window.location.search).toBe('?f=all')
    expect(screen.getByRole('heading', { name: 'All vouchers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Meta Platforms Ireland FB ads top-up RM 25,000\.00/ })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /Search voucher/ }), { target: { value: 'google' } })
    expect(screen.queryByRole('button', { name: /Meta Platforms Ireland/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Google Asia Pacific/ })).toBeInTheDocument()
  })

  it('a row opens the voucher — its hero at once, then the drawer’s groups and steps', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/payments?f=all')
    draw('f=all')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Meta Platforms Ireland/ }))
    })
    expect(mocks.openPage).toHaveBeenCalledWith('0001')
    expect(window.location.search).toBe('?id=0001&from=all')
    expect(screen.getAllByText('HV-PV-202610-0001').length).toBeGreaterThan(0)
    expect(screen.getByText('Pay to Meta Platforms Ireland')).toBeInTheDocument()
    expect(screen.getByText('Deducted from')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/payments/voucher-doc?id=0001')
    // Pending, and this reader does not approve: Edit, Return to draft, the ⋯ (Copy, Void).
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/payments/0001/edit')
    expect(screen.getByRole('button', { name: 'Return to draft' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Copy as a new draft' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Void voucher' })).toBeInTheDocument()
  })

  it('Back from a voucher reached by a link goes up to its list', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/payments?id=0001&from=all')
    await act(async () => {
      draw('id=0001&from=all')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Back to All' }))
    expect(window.location.search).toBe('?f=all')
    expect(screen.getByRole('heading', { name: 'All vouchers' })).toBeInTheDocument()
  })

  it('Payroll batches lists each batch, its departments under it', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Payroll batches/ }))
    expect(window.location.search).toBe('?f=payroll')
    const batch = screen.getByRole('button', { name: /Payroll disbursement Sep 2026/ })
    expect(batch).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(batch)
    expect(batch).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Marketing 2 vouchers 6,200\.00/ })).toBeDisabled()
  })

  it('Create payment opens the desktop’s own window', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Create payment' }))
    expect(screen.getByTestId('create-payment')).toBeInTheDocument()
  })
})
