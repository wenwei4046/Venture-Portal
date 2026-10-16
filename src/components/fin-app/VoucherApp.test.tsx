import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { HubLedger, HubRow } from '@/app/(portal)/payments/_lib/hub-ledger'
import type { VoucherDetail } from '@/app/(portal)/payments/_lib/voucher-detail'

// Daily › Payment in the Finance phone app (2026-10-15, M02–M05): the hub's
// stacked cards open a list, a row opens the voucher (the drawer's parts, read
// by openVoucherPage), Back steps back; the windows are the desktop's.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), openPage: vi.fn(), openEdit: vi.fn(), update: vi.fn(), flash: vi.fn(), voidWords: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/daily/payments',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/app/(portal)/payments/page-actions', () => ({ openVoucherPage: mocks.openPage, openVoucherEdit: mocks.openEdit }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/payments/actions', () => ({
  approveVoucher: vi.fn(),
  getAttachmentSignedUrl: vi.fn(),
  returnVoucherToDraft: vi.fn(),
  reversePaidPayment: vi.fn(),
  submitForApproval: vi.fn(),
  uploadVoucherAttachment: vi.fn(),
  voidPaidReceipt: vi.fn(),
  voidVoucher: vi.fn(),
  updatePaymentVoucherInWords: mocks.update,
  voidVoucherStepInWords: mocks.voidWords,
}))
vi.mock('@/app/(portal)/payments/_components/CreatePaymentDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-payment">Create payment sheet</div> : null),
}))
vi.mock('@/app/(portal)/receipts/_components/CreateReceiptDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-receipt">Create receipt sheet</div> : null),
}))
vi.mock('@/app/(portal)/receipts/_components/LoanRepaymentDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="loan-repayment">Loan repayment received sheet</div> : null),
}))
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

const draw = (search = '', canExport = true) =>
  render(
    <FinAppFrame platform="android" rows={['payments', 'receipts', 'invoices', 'billing']}>
      <VoucherApp
        hub="payments"
        search={search}
        ledger={LEDGER}
        record={null}
        refused={null}
        canCreate
        canExport={canExport}
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
    // The bar's first button is one word (2026-10-16): two filled it edge to edge on the phone.
    expect(screen.getByRole('button', { name: 'Payment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create payment' })).toBeNull()
  })

  it('a card opens its list — a step of the browser’s history — and the search narrows it', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^All vouchers/ }))
    expect(window.location.search).toBe('?f=all')
    expect(screen.getByRole('heading', { name: 'All vouchers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Meta Platforms Ireland FB ads top-up RM 25,000\.00/ })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /Search voucher/ }), { target: { value: 'google' } })
    expect(screen.queryByRole('button', { name: /Meta Platforms Ireland/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Google Asia Pacific/ })).toBeInTheDocument()
  })

  it('Edit opens the voucher’s form in a sheet and sends only what changed', async () => {
    mocks.openEdit.mockResolvedValue({
      ok: true,
      data: {
        statutoryDetailsLocked: false,
        salaryDetailsLocked: false,
        voucher: { id: '0001', voucher_no: 'HV-PV-202610-0001', voucher_type: 'expense', direction: 'debit', amount: 100, payee_name: 'Meta Platforms Ireland', payee_company_id: null, bank_account_id: 'bank', description: 'Ads Oct', notes: null, payment_method: 'bank_transfer', payment_date: '2026-10-05', target_pool: null, fund_source_id: null, loan_id: null, repayment_breakdown: null },
        initialSources: [{ pool: 'venture_pool', amount: '100.00', account_code: '9010', override_account_type: '', override_gl_account_code: '', override_reason: '' }],
        extraPools: [],
        fundSourceAccount: null,
        initialCreditAccountCode: null,
        companies: [],
        bankAccounts: [{ id: 'bank', bank_name: 'Hong Leong Bank', account_number: '123', current_balance: 5000 }],
        glAccounts: [{ code: '9010', name: 'Advertising', type: 'expense', parent_code: null }],
      },
    })
    mocks.update.mockResolvedValue({ ok: true })
    window.history.replaceState(null, '', '/fin-app/daily/payments?f=all')
    draw('f=all')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Meta Platforms Ireland/ }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(mocks.openEdit).toHaveBeenCalledWith('0001')
    const sheet = await screen.findByRole('dialog', { name: /Edit HV-PV-202610-0001/ })
    expect(await within(sheet).findByLabelText('Description')).toHaveValue('Ads Oct')
    expect(within(sheet).getByLabelText('Line 1 account')).toHaveValue('9010')
    fireEvent.change(within(sheet).getByLabelText('Description'), { target: { value: 'Ads Oct — Meta' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    })
    const fd = mocks.update.mock.calls[0][0] as FormData
    expect(Object.fromEntries(fd.entries())).toEqual({ id: '0001', description: 'Ads Oct — Meta' })
    expect(mocks.flash).toHaveBeenCalledWith('Voucher saved')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('Void is answered in words — the app stays on its screen (its action ends on the portal’s Payments)', async () => {
    mocks.voidWords.mockResolvedValue({ ok: true })
    window.history.replaceState(null, '', '/fin-app/daily/payments?f=all')
    draw('f=all')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Meta Platforms Ireland/ }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Void voucher' }))
    const ask = await screen.findByRole('dialog', { name: /Void HV-PV-202610-0001\?/ })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Void voucher' }))
    })
    const [kind, fd] = mocks.voidWords.mock.calls[0] as [string, FormData]
    expect(kind).toBe('void')
    expect(fd.get('id')).toBe('0001')
    expect(mocks.flash).toHaveBeenCalledWith('HV-PV-202610-0001 voided')
    expect(mocks.push).not.toHaveBeenCalled()
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
    // Edit is the app's own sheet (part E4b), not the portal's /payments/0001/edit.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
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

  it('the ⋯ keeps Export to whoever may export (Treasury · Export, 2026-10-16)', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: /^Export/ })).toBeInTheDocument()
    cleanup()
    resetNav()
    draw('', false)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: /^Claims/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^Export/ })).toBeNull()
  })

  it('Payment opens the desktop’s own window — Create payment, as a sheet', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }))
    expect(screen.getByTestId('create-payment')).toBeInTheDocument()
  })
})

const RECEIVE: HubLedger = {
  ...LEDGER,
  receipts: true,
  seesPayroll: false,
  hero: { label: 'Total received · October 2026', amount: 52000 },
  cards: [
    { key: 'all', count: 1, other: 0, amount: 52000 },
    { key: 'paid', count: 1, other: 0, amount: 52000 },
    { key: 'voided', count: 0, other: 0, amount: 0 },
  ],
  rows: [row({ id: '0101', no: 'HV-OR-202610-0101', name: 'HOUZS Century', desc: 'Service fee Sep', amount: 52000 })],
  batches: [],
}

const drawReceive = () =>
  render(
    <FinAppFrame platform="android" rows={['payments', 'receipts', 'invoices', 'billing']}>
      <VoucherApp hub="receipts" search="" ledger={RECEIVE} record={null} refused={null} canCreate canExport prefix="HV-OR-202610" today="2026-10-16" />
    </FinAppFrame>,
  )

describe('Daily › Receive on the phone', () => {
  beforeEach(() => window.history.replaceState(null, '', '/fin-app/daily/receipts'))

  it('the bar says Receipt and Repayment — one word each, as Payment’s (2026-10-16)', () => {
    drawReceive()
    expect(screen.getByRole('link', { name: 'Receive' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Receipt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Repayment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create receipt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Loan repayment' })).toBeNull()
  })

  it('each opens the desktop’s own sheet — Create receipt, Loan repayment received', () => {
    drawReceive()
    fireEvent.click(screen.getByRole('button', { name: 'Receipt' }))
    expect(screen.getByTestId('create-receipt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Repayment' }))
    expect(screen.getByTestId('loan-repayment')).toBeInTheDocument()
    expect(screen.queryByTestId('create-receipt')).toBeNull()
  })

  it('All receipts carries Receipt in its bar', () => {
    drawReceive()
    fireEvent.click(screen.getByRole('button', { name: /^All receipts/ }))
    expect(window.location.search).toBe('?f=all')
    expect(screen.getByRole('heading', { name: 'All receipts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Receipt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Repayment' })).toBeNull()
  })
})
