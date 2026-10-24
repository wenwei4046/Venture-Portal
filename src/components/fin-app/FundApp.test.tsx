import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FundRecord } from '@/lib/fund-hub'
import type { RepaymentPlan } from '@/lib/repayment-plan'
import type { TermsChangeComparison, TermsSegment } from '@/lib/treasury-terms'
import type { LoanPageModel } from '@/app/(portal)/fund-out/[id]/_lib/loan-page'
import type { SourcePageModel } from '@/app/(portal)/fund-in/[id]/_lib/source-page'

// Fund › Fund out and Fund in on the phone (2026-10-15, M13–M14): the hub's
// month and the user's cards, a card's list, a deal as its page (the drawer's
// parts, the schedule, the repayments, the terms, the settings, the audit
// log) and its steps — each write the deal page's own Server Action.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  flash: vi.fn(),
  openLoan: vi.fn(),
  openSource: vi.fn(),
  record: vi.fn(),
  cancelPending: vi.fn(),
  requestLoanCancel: vi.fn(),
  setMinPay: vi.fn(),
  createPayment: vi.fn(),
  voidRepayment: vi.fn(),
  revert: vi.fn(),
  amendLoan: vi.fn(),
  amendSource: vi.fn(),
  updateSource: vi.fn(),
  editOptions: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/fund/out',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/fund-out/page-actions', () => ({ openLoanPage: mocks.openLoan }))
vi.mock('@/app/(portal)/fund-in/page-actions', () => ({ openSourcePage: mocks.openSource }))
vi.mock('@/app/(portal)/fund-out/actions', () => ({
  exportLoansCSV: vi.fn(),
  setLoanMinPayInterest: mocks.setMinPay,
  cancelPendingLoan: mocks.cancelPending,
  recordRepaymentFromSheet: mocks.record,
  requestLoanCancel: mocks.requestLoanCancel,
  setLoanFundingSource: vi.fn(),
  setLoanRepaymentStart: vi.fn(),
  voidRepayment: mocks.voidRepayment,
  createLoanFromDialog: vi.fn(),
  openCreateLoan: vi.fn(() => new Promise(() => {})),
  amendLoanInWords: mocks.amendLoan,
}))
vi.mock('@/app/(portal)/fund-in/actions', () => ({
  setFundSourceMinPayInterest: vi.fn(),
  requestFundSourceCancel: vi.fn(),
  setFundSourceNotes: vi.fn(),
  setFundSourceRepaymentStart: vi.fn(),
  withdrawFundSource: vi.fn(),
  revertTermsChange: mocks.revert,
  createFundSourceFromDialog: vi.fn(),
  openRecordFundIn: vi.fn(() => new Promise(() => {})),
  amendFundSourceInWords: mocks.amendSource,
  updateFundSourceInWords: mocks.updateSource,
  openSourceEditOptions: mocks.editOptions,
}))
vi.mock('@/app/(portal)/payments/actions', () => ({ createPaymentFromDialog: mocks.createPayment }))

import FinAppFrame from './FinAppFrame'
import FundApp, { type DealPage, type FundAppCan } from './FundApp'
import { resetNav } from './nav'

const rec = (over: Partial<FundRecord>): FundRecord => ({
  id: 'l1',
  side: 'out',
  party: 'Carres (CAR)',
  type: 'loan',
  typeLabel: 'Loan out',
  amount: 100000,
  outstanding: 91666.67,
  rate: 0.02,
  status: 'active',
  overdue: null,
  date: '2026-03-15',
  createdAt: '2026-05-20T12:21:00Z',
  createdBy: 'Principal',
  approvedAt: '2026-05-20T12:21:00Z',
  approvedBy: 'Principal',
  maturity: '2027-03-15',
  months: 12,
  compound: false,
  minPayInterest: false,
  fundingSource: 'King',
  notes: null,
  bank: null,
  account: null,
  approval: null,
  decidable: false,
  cancelPending: false,
  repaid: 8333.33,
  repaidAt: null,
  repaidBy: null,
  ...over,
})

const LOANS: FundRecord[] = [
  rec({}),
  rec({ id: 'l2', party: '2990', amount: 40000, outstanding: 40000, date: '2026-10-05', fundingSource: null, repaid: 0 }),
  rec({ id: 'l3', party: 'CMI', amount: 20000, outstanding: null, status: 'pending_approval', date: '2026-10-14', approvedAt: null, approvedBy: null, approval: { id: 'ap1', submittedBy: 'u2' }, decidable: true }),
  rec({ id: 'l4', party: 'The Cont (CONTS)', amount: 10000, outstanding: null, status: 'cancelled', date: '2026-09-01' }),
]

const PLAN: RepaymentPlan = {
  kind: 'fixed',
  months: 12,
  paidCount: 1,
  outstandingDue: 20666.66,
  firstDue: '2026-04-15',
  firstInstallment: 10333.33,
  totalInterest: 24000,
  principalPaid: 8333.33,
  interestPaid: 2000,
  principalOwed: 91666.67,
  rows: [
    { no: 1, ym: '2026-04', due: '2026-04-15', installment: 10333.33, principal: 8333.33, interest: 2000, balance: 113666.63, outstanding: 0, remark: 'Paid 20 Apr 2026', tone: 'ledger' },
    { no: 2, ym: '2026-05', due: '2026-05-15', installment: 10333.33, principal: 8333.33, interest: 2000, balance: 103333.3, outstanding: 10333.33, remark: 'Overdue 153 days', tone: 'danger' },
    { no: 3, ym: '2026-11', due: '2026-11-15', installment: 10333.33, principal: 8333.33, interest: 2000, balance: 93000, outstanding: 10333.33, remark: '', tone: '' },
  ],
}

const seg = (over: Partial<TermsSegment>): TermsSegment => ({
  fromYM: '2026-04',
  toYM: null,
  rate: 0.02,
  compounding: false,
  months: 12,
  base: 100000,
  principalPerMonth: 8333.33,
  interestPerMonth: 2000,
  scheduledEndYM: '2027-03',
  changed: false,
  ...over,
})
const CHANGE: TermsChangeComparison = {
  fromYM: '2026-09',
  old: { rate: 0.02, months: 12, principalPerMonth: 8333.33, interestPerMonth: 2000, endYM: '2027-03', compounding: false },
  new: { rate: 0.025, months: 12, principalPerMonth: 8333.33, interestPerMonth: 2500, endYM: '2027-03', compounding: false, base: 100000 },
  reason: null,
  rows: [
    { ym: '2026-09', oldPrincipal: 8333.33, oldInterest: 2000, newPrincipal: 8333.33, newInterest: 2500, diffInterest: 500, diffTotal: 500 },
    { ym: '2026-10', oldPrincipal: 8333.33, oldInterest: 2000, newPrincipal: 8333.33, newInterest: 2500, diffInterest: 500, diffTotal: 500 },
  ],
  totals: { oldInterest: 4000, newInterest: 5000, diffInterest: 1000, oldTotal: 20666.66, newTotal: 21666.66, diffTotal: 1000, shortfall: 0 },
}

const LOAN = (over: Partial<LoanPageModel> = {}): LoanPageModel => ({
  id: 'l1',
  status: 'active',
  companyName: 'Carres',
  borrower: 'Carres (CAR)',
  principal: 100000,
  disbursementDate: '2026-03-15',
  createdBy: 'Principal',
  createdAt: '20 May 2026 · 20:21',
  noFixedTerm: false,
  tenureMonths: 12,
  maturity: '2027-03-15',
  fundingSource: 'King',
  repaymentTerms: 'EMI · 资金来源: King',
  plan: PLAN,
  repayments: [
    { id: 'r1', date: '2026-04-20', type: 'principal', amount: 8333.33, notes: '[LO#2] principal 1/1' },
    { id: 'r2', date: '2026-04-20', type: 'interest', amount: 2000, notes: null },
  ],
  termsSegments: [seg({})],
  termsChanges: [],
  start: { date: '2026-04-15', day: 15, set: false },
  minPayInterest: false,
  late: null,
  monthlyInterest: 2000,
  outstanding: 91666.67,
  totalPrincipalPaid: 8333.33,
  rate: { effective: 0.02, base: 0.0112, premium: 0.0088 },
  tone: 'ledger',
  chip: 'active',
  trail: [],
  audit: [{ at: '20 May 2026 · 20:21', who: 'Principal', what: 'Created the loan to Carres (CAR) · RM 100,000.00' }],
  pendingCancel: null,
  termsRequest: null,
  amend: { ratePct: '2', months: '12', start: '2026-03-15', compound: false, text: 'EMI · 资金来源: King', termsFrom: null, nextMonth: '2026-11' },
  can: { edit: true, void: true, amend: true, fileTerms: false, recordRepayment: true },
  ...over,
})

const SOURCES: FundRecord[] = [
  rec({ id: 's1', side: 'in', party: 'Chai Meng Keat (MK)', type: 'director_loan', typeLabel: 'Director loan', amount: 80000, outstanding: 63996, rate: 0.005, date: '2025-05-31', months: 60, fundingSource: null }),
]
const SOURCE = (over: Partial<SourcePageModel> = {}): SourcePageModel => ({
  id: 's1',
  status: 'active',
  typeLabel: 'Director loan',
  fromLabel: 'Chai Meng Keat',
  fromWithCode: 'Chai Meng Keat (MK)',
  amount: 80000,
  effectiveDate: '2025-05-31',
  maturityDate: '2030-06-15',
  createdBy: 'Finance Manager',
  createdAt: '22 Sep 2026 · 16:35',
  compound: false,
  lockInMonths: 60,
  fullyRepaid: '2030-06-15',
  rate: '0.500% /mo',
  plan: { ...PLAN, rows: [] },
  repayments: [{ id: 'fr1', date: '2025-07-15', type: 'principal', amount: 1333.33, voucherNo: 'HV-PV-202509-0101', notes: 'first' }],
  termsSegments: [seg({})],
  termsChanges: [],
  start: { date: '2025-07-31', day: 31, set: true },
  minPayInterest: false,
  notes: 'lent to: CMI',
  monthlyInterest: 400,
  monthlyPayment: 1733.33,
  outstanding: 63996,
  totalPrincipalPaid: 16004,
  bank: null,
  account: { code: '4056', name: 'Amount Due to - Chai Meng Keat' },
  accountCode: '4056',
  st: { text: 'active', tone: 'ledger' },
  trail: [],
  audit: [],
  pendingCancel: null,
  termsRequest: null,
  can: { financeEdit: true, void: true, amend: true, fileTerms: false, recordRepayment: true },
  repay: {
    lender: 'Chai Meng Keat',
    lenderCompanyId: null,
    accountCode: '4056',
    outstanding: 63996,
    monthlyPrincipal: 1333.33,
    monthlyInterest: 400,
    bankAccounts: [{ id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 65214.6 }],
    pools: [{ value: 'venture_pool', label: 'Venture Pool' }],
    activeAccounts: ['4056', '6000', '9096'],
  },
  amend: { ratePct: '0.5', months: '60', start: '2025-07-31', compound: false, text: 'lent to: CMI', termsFrom: '2026-09', nextMonth: '2026-11' },
  edit: null,
  ...over,
})

const CAN: FundAppCan = { create: true, edit: true, void: true, amend: true, loanAging: true, export: true }

function draw({ side = 'out', search = '', can = CAN, page = null, records }: { side?: 'out' | 'in'; search?: string; can?: FundAppCan; page?: DealPage | null; records?: FundRecord[] } = {}) {
  window.history.replaceState(null, '', `/fin-app/fund/${side}${search ? `?${search}` : ''}`)
  return render(
    <FinAppFrame platform="android" rows={['fund-out', 'fund-in', 'loan']}>
      <FundApp side={side} records={records ?? (side === 'out' ? LOANS : SOURCES)} month="2026-10" today="2026-10-15" search={search} can={can} page={page} refused={null} printedBy="Finance Manager" />
    </FinAppFrame>,
  )
}

beforeEach(() => {
  resetNav()
  mocks.openLoan.mockImplementation(async (id: string) => ({ ok: true, page: LOAN({ id }) }))
  mocks.openSource.mockImplementation(async (id: string) => ({ ok: true, page: SOURCE({ id }) }))
})
afterEach(() => vi.clearAllMocks())

describe('Fund › Fund out on the phone', () => {
  it('opens on the hub: what went out this month, the user’s cards, Create fund out · Loan aging · ⋯', () => {
    draw()
    expect(screen.getByRole('link', { name: 'Fund out' })).toHaveAttribute('aria-current', 'page')
    // Only the 2990 loan moved money in October; the pending one has not gone out yet.
    expect(screen.getByText('RM 40,000.00')).toBeInTheDocument()
    expect(screen.getByText('Fund out · October 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All fund out 4 transfers · 1 pending RM 160,000\.00/ })).toBeInTheDocument()
    for (const name of [/^Active 2 transfers/, /^Overdue 0 transfers/, /^Pending approval 1 transfer/, /^Repaid/, /^Cancelled 1 transfer RM 10,000\.00/]) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create fund out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Loan aging' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('Loan aging moves to the Report tab’s hub', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Loan aging' }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/report/loan')
  })

  it('a reader who may only look sees the hub without its steps', () => {
    draw({ can: { create: false, edit: false, void: false, amend: false, loanAging: false, export: false } })
    expect(screen.queryByRole('button', { name: 'Create fund out' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Loan aging' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('a card opens its list — party, how it is lent, the amount out — and a row its deal', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Active 2 transfers/ }))
    expect(window.location.search).toBe('?f=active')
    expect(screen.getByRole('heading', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByText('2 · RM 140,000.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Carres \(CAR\) 2\.000% \/mo · 12 months · SC King −100,000\.00/ })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '2990' } })
    expect(screen.queryByRole('button', { name: /^Carres/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Carres \(CAR\)/ }))
    })
    expect(window.location.search).toBe('?id=l1&from=active')
    expect(mocks.openLoan).toHaveBeenCalledWith('l1')
  })

  it('a loan is its page: the drawer’s parts, the schedule, the repayments (each reversible), the settings, the audit log', async () => {
    await act(async () => {
      draw({ search: 'id=l1&from=active', page: { side: 'out', loan: LOAN() } })
    })
    expect(mocks.openLoan).not.toHaveBeenCalled() // read with the page
    expect(screen.getByText('Transfer to')).toBeInTheDocument()
    expect(screen.getByText(/Repayment schedule · PAID 1 OF 12/)).toBeInTheDocument()
    expect(screen.getByText('1 · 15 Apr 2026')).toBeInTheDocument()
    expect(screen.getByText('Overdue 153 days')).toBeInTheDocument()
    expect(screen.getByText('principal 8,333.33 · interest 2,000.00')).toBeInTheDocument()
    expect(screen.getByText('Principal · 20 Apr 2026')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Void' })).toHaveLength(2)
    expect(screen.getAllByText('SC King')).toHaveLength(2) // Transfer to, and the setting with its Edit
    expect(screen.getByText('the month after, by default')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument()
    expect(screen.getByText('Created the loan to Carres (CAR) · RM 100,000.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record repayment' })).toBeInTheDocument()
    // Nothing opens the portal (part E4b): Amend terms is a sheet, Print draws the schedule over the app.
    expect(screen.getByRole('button', { name: 'Amend terms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Amend terms|Print/ })).not.toBeInTheDocument()
  })

  it('Amend terms from a month on sends the month and only what changed, answered in words', async () => {
    mocks.amendLoan.mockResolvedValueOnce({ ok: false, reason: '修改失败: 生效月要晚过现行条件的生效月' }).mockResolvedValueOnce({ ok: true })
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Amend terms' }))
    const sheet = await screen.findByRole('dialog', { name: /Amend terms/ })
    expect(within(sheet).getByLabelText('Effective from')).toHaveValue('2026-11')
    expect(within(sheet).getByLabelText('Rate % /mo')).toHaveValue('2')
    fireEvent.change(within(sheet).getByLabelText('Rate % /mo'), { target: { value: '2.5' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Apply from Nov 2026' }))
    })
    const [mode, fd] = mocks.amendLoan.mock.calls[0] as [string, FormData]
    expect(mode).toBe('from')
    // The compound switch, untouched, is not sent — the RPC keeps it.
    expect(Object.fromEntries(fd.entries())).toEqual({ loan_id: 'l1', effective_rate_percent: '2.5', effective_from: '2026-11' })
    expect(await within(sheet).findByText('修改失败: 生效月要晚过现行条件的生效月')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Apply from Nov 2026' }))
    })
    expect(mocks.flash).toHaveBeenCalledWith('New terms from Nov 2026')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('Amend terms over the whole deal saves nothing until something changes, then only that', async () => {
    mocks.amendLoan.mockResolvedValue({ ok: true })
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Amend terms' }))
    const sheet = await screen.findByRole('dialog', { name: /Amend terms/ })
    fireEvent.change(within(sheet).getByLabelText('Takes effect'), { target: { value: 'whole' } })
    expect(within(sheet).getByLabelText('Repayment terms')).toHaveValue('EMI · 资金来源: King')
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    })
    expect(mocks.amendLoan).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByLabelText('Term · months'), { target: { value: '24' } })
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Compound interest' }))
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    })
    const [mode, fd] = mocks.amendLoan.mock.calls[0] as [string, FormData]
    expect(mode).toBe('whole')
    expect(Object.fromEntries(fd.entries())).toEqual({ loan_id: 'l1', compound_interest: 'on', tenure_months: '24' })
    expect(mocks.flash).toHaveBeenCalledWith('Terms saved — the whole deal recalculated')
  })

  it('Print draws the schedule over the app — the terms, every instalment, who printed it', async () => {
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    const sheet = await screen.findByRole('dialog', { name: 'Repayment Schedule · Carres' })
    expect(within(sheet).getByText('FUND OUT · LOAN')).toBeInTheDocument()
    expect(within(sheet).getByText('Printed 15 Oct 2026 · Finance Manager')).toBeInTheDocument()
    expect(within(sheet).getByText('Carres (CAR)')).toBeInTheDocument()
    expect(within(sheet).getByText('2.000% /mo')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Repayment Schedule · Carres' })).not.toBeInTheDocument()
  })

  it('without Treasury · Approve there is no Amend terms', async () => {
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN({ amend: null, can: { edit: true, void: true, amend: false, fileTerms: false, recordRepayment: true } }) }, can: { ...CAN, amend: false } })
    })
    expect(screen.getByRole('button', { name: 'Record repayment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Amend terms' })).not.toBeInTheDocument()
  })

  it('Request cancellation is shut, saying why, while repayments stand', async () => {
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    const item = within(menu).getByRole('menuitem', { name: /Request cancellation/ })
    expect(item).toBeDisabled()
    expect(item).toHaveTextContent('2 repayments recorded — reverse those first')
  })

  it('with none recorded it asks the reason and files it for the Principal', async () => {
    mocks.requestLoanCancel.mockResolvedValue(undefined)
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN({ repayments: [] }) } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Request cancellation' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request cancellation' }))
    expect(await within(dialog).findByText('Say why it is cancelled — the Principal reads it.')).toBeInTheDocument()
    expect(mocks.requestLoanCancel).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'wrong borrower' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Request cancellation' }))
    })
    expect(mocks.requestLoanCancel).toHaveBeenCalledWith('l1', 'wrong borrower')
    expect(mocks.flash).toHaveBeenCalledWith('Cancellation requested — waiting for Principal approval')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('Record repayment records the loan page’s repayment, answered in words', async () => {
    mocks.record.mockResolvedValueOnce({ ok: false, reason: 'Payment date cannot be in the future' }).mockResolvedValueOnce({ ok: true })
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record repayment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: 'principal' } })
    fireEvent.change(within(dialog).getByLabelText('Amount RM'), { target: { value: '999999' } })
    expect(within(dialog).getByText('A principal repayment is at most RM 91,666.67 — what is still owed.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Amount RM'), { target: { value: '5000' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Record repayment' }))
    })
    const fd = mocks.record.mock.calls[0][0] as FormData
    expect(Object.fromEntries(fd.entries())).toEqual({ loan_id: 'l1', payment_type: 'principal', amount: '5000.00', payment_date: '2026-10-15' })
    expect(await within(dialog).findByText('Payment date cannot be in the future')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Record repayment' }))
    })
    expect(mocks.flash).toHaveBeenCalledWith('Principal repayment of RM 5,000.00 recorded')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('Void asks first, then reverses the repayment', async () => {
    mocks.voidRepayment.mockResolvedValue(undefined)
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Void' })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Void this repayment?')).toBeInTheDocument()
    expect(mocks.voidRepayment).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Void repayment' }))
    })
    const fd = mocks.voidRepayment.mock.calls[0][0] as FormData
    expect(fd.get('repayment_id')).toBe('r1')
    expect(fd.get('loan_id')).toBe('l1')
    expect(mocks.flash).toHaveBeenCalledWith('Repayment voided — its entry, bank and pool reversed')
  })

  it('Minimum pay interest turns with one press', async () => {
    mocks.setMinPay.mockResolvedValue(undefined)
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan: LOAN() } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    })
    expect(mocks.setMinPay).toHaveBeenCalledWith('l1', true)
    expect(mocks.flash).toHaveBeenCalledWith('Minimum pay interest turned on')
  })

  it('the terms over time: each segment, each change opening onto its months, the latest one revertible', async () => {
    mocks.revert.mockResolvedValue(undefined)
    const loan = LOAN({ termsSegments: [seg({ toYM: '2026-08' }), seg({ fromYM: '2026-09', rate: 0.025, interestPerMonth: 2500, changed: true })], termsChanges: [CHANGE] })
    await act(async () => {
      draw({ search: 'id=l1', page: { side: 'out', loan } })
    })
    expect(screen.getByText(/Terms over time · 1 change/)).toBeInTheDocument()
    expect(screen.getByText('2026-04 → 2026-08')).toBeInTheDocument()
    expect(screen.getByText('current')).toBeInTheDocument()
    expect(screen.queryByText('2026-10')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Change from 2026-09/ }))
    expect(screen.getByText('2026-10')).toBeInTheDocument()
    expect(screen.getAllByText('+500.00')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Revert' }))
    })
    expect(mocks.revert).toHaveBeenCalledWith('loan', 'l1')
  })

  it('a loan still waiting: Open in Approvals for whoever decides it, Cancel loan asked first', async () => {
    mocks.cancelPending.mockResolvedValue(undefined)
    mocks.openLoan.mockResolvedValue({ ok: true, page: LOAN({ id: 'l3', status: 'pending_approval', repayments: [], can: { edit: true, void: true, amend: true, fileTerms: false, recordRepayment: false } }) })
    window.history.replaceState(null, '', '/fin-app/fund/out?f=pending_approval')
    await act(async () => {
      draw({ search: 'f=pending_approval' })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^CMI/ }))
    })
    // The app's own request screen (part 5), not the portal's /approvals/ap1.
    expect(screen.getByRole('link', { name: 'Open in Approvals' })).toHaveAttribute('href', '/fin-app/page/approvals?id=ap1')
    expect(screen.queryByRole('button', { name: 'Record repayment' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel loan' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/the RM 20,000\.00 loan is cancelled and its approval request closes/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel loan' }))
    })
    expect(mocks.cancelPending).toHaveBeenCalledWith('l3')
    expect(mocks.flash).toHaveBeenCalledWith('Loan to CMI cancelled')
    await waitFor(() => expect(window.location.search).toBe('?f=pending_approval'))
  })
})

describe('Fund › Fund in on the phone', () => {
  it('Record repayment files the voucher Create payment files, then opens it in the app', async () => {
    mocks.createPayment.mockResolvedValue({ ok: true, id: 'pv-9', voucherNo: 'HV-PV-202610-0600', submitted: false })
    await act(async () => {
      draw({ side: 'in', search: 'id=s1', page: { side: 'in', source: SOURCE() } })
    })
    expect(screen.getByText('HV-PV-202509-0101 · first')).toBeInTheDocument()
    expect(screen.getByText('lent to: CMI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record repayment' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('RM 1,733.33')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }))
    })
    const fd = mocks.createPayment.mock.calls[0][0] as FormData
    expect(Object.fromEntries(fd.entries())).toMatchObject({
      direction: 'debit',
      fund_source_id: 's1',
      payee_name: 'Chai Meng Keat',
      amount: '1733.33',
      bank_account_id: 'bank-hl',
      'source_rows[0][account_code]': '4056',
      'source_rows[1][account_code]': '6000',
      description: 'Loan repayment — Chai Meng Keat',
    })
    expect(mocks.flash).toHaveBeenCalledWith('HV-PV-202610-0600 saved as draft — send it for approval')
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=pv-9')
  })

  it('Amend terms on a fund source says since when its terms stand and sends the source’s names', async () => {
    mocks.amendSource.mockResolvedValue({ ok: true })
    await act(async () => {
      draw({ side: 'in', search: 'id=s1', page: { side: 'in', source: SOURCE() } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Amend terms' }))
    const sheet = await screen.findByRole('dialog', { name: /Amend terms/ })
    expect(within(sheet).getByText('Chai Meng Keat · terms since Sep 2026')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'No fixed term from then' }))
    expect(within(sheet).getByLabelText('Months left')).toBeDisabled()
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'repaid in any size' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Apply from Nov 2026' }))
    })
    const [mode, fd] = mocks.amendSource.mock.calls[0] as [string, FormData]
    expect(mode).toBe('from')
    expect(Object.fromEntries(fd.entries())).toEqual({ fund_source_id: 's1', effective_from: '2026-11', no_fixed_term: 'on', reason: 'repaid in any size' })
  })

  it('a fund source still waiting: Edit is a sheet with its lists, sending only what changed', async () => {
    mocks.editOptions.mockResolvedValue({
      accounts: [{ code: '4056', name: 'Amount Due to - Chai Meng Keat', type: 'liability', parent_code: '4000', is_active: true }],
      banks: [
        { id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123', is_primary: true },
        { id: 'bank-mb', bank_name: 'Maybank', account_number: '456', is_primary: false },
      ],
    })
    mocks.updateSource.mockResolvedValue({ ok: true })
    const pending = SOURCE({
      status: 'pending_approval',
      amend: null,
      repay: null,
      can: { financeEdit: true, void: true, amend: true, fileTerms: false, recordRepayment: false },
      edit: { amount: '80000.00', ratePct: '0.500', months: '', effectiveDate: '2025-05-31', repaymentDate: '2025-06-30', notes: 'lent to: CMI', accountCode: '4056', bankId: '' },
    })
    mocks.openSource.mockResolvedValue({ ok: true, page: pending })
    await act(async () => {
      draw({ side: 'in', search: 'id=s1', page: { side: 'in', source: pending }, records: [{ ...SOURCES[0], status: 'pending_approval' }] })
    })
    // The bar's Edit — the settings' own Edits stand above it.
    const edits = screen.getAllByRole('button', { name: 'Edit' })
    fireEvent.click(edits[edits.length - 1])
    const sheet = await screen.findByRole('dialog', { name: /Edit fund source/ })
    expect(within(sheet).getByText('Director loan · Chai Meng Keat')).toBeInTheDocument()
    // Unset, the bank is the primary's — the select opens on it, and it is not a change.
    await waitFor(() => expect(within(sheet).getByLabelText('Into bank')).toHaveValue('bank-hl'))
    expect(within(sheet).getByLabelText('Term · months')).toHaveValue('')
    fireEvent.change(within(sheet).getByLabelText('Amount RM'), { target: { value: '85000' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    })
    const fd = mocks.updateSource.mock.calls[0][0] as FormData
    expect(Object.fromEntries(fd.entries())).toEqual({ id: 's1', amount: '85000' })
    expect(mocks.flash).toHaveBeenCalledWith('Fund source from Chai Meng Keat saved — still waiting for approval')
  })

  it('the hub: Record fund in, no Loan aging', () => {
    draw({ side: 'in' })
    expect(screen.getByText('Fund in · October 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record fund in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Loan aging' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Director loan 1 transfer RM 80,000\.00/ })).toBeInTheDocument()
  })
})
