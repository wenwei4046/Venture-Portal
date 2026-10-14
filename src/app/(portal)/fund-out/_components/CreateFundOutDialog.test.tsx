import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { NewLoanOptions } from '../_lib/new-loan-options'

// Create fund out (2026-10-15, the Finance revamp v2 — D12, the prototype's
// `fund-form`): the design's To, Amount RM, Description, From bank, Date; the
// system's premium on the quarter's base rate and the account it is booked
// to; the term, the funding source and the interest switches behind the small
// buttons. It sends the form page's loan, every name createLoan reads, and
// says it waits for approval. The hub's head opens it (FundOutHub).

const mocks = vi.hoisted(() => ({ create: vi.fn(), open: vi.fn(), cancel: vi.fn(), flash: vi.fn(), refresh: vi.fn(), hub: vi.fn() }))
vi.mock('../actions', () => ({ createLoanFromDialog: mocks.create, openCreateLoan: mocks.open, cancelPendingLoan: mocks.cancel }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('./ExportCSVButton', () => ({ default: () => <button type="button">Export CSV</button> }))
vi.mock('@/components/treasury/FundHub', () => ({
  default: (p: { head: React.ReactNode; onWithdraw: unknown }) => {
    mocks.hub(p)
    return <div data-testid="head">{p.head}</div>
  },
}))

import CreateFundOutDialog from './CreateFundOutDialog'
import FundOutHub from './FundOutHub'

const OPTIONS: NewLoanOptions = {
  companies: [
    { id: 'co-car', name: 'Carres', short_code: 'CAR' },
    { id: 'co-2990', name: '2990', short_code: '2990' },
  ],
  baseRate: { rate: 0.0085, quarter: '2026-Q4' },
  bsAccounts: [
    { code: '1200', name: 'Loans to Subsidiaries', account_type: 'asset', parent_code: null },
    { code: '3010', name: 'Amount Due from - Carres', account_type: 'asset', parent_code: '3000' },
  ],
  banks: [
    { id: 'bk-hl', bank_name: 'Hong Leong Bank', account_number: '23600599248', current_balance: 500000, is_primary: true },
    { id: 'bk-mb', bank_name: 'Maybank', account_number: '5141-2210-0087', current_balance: 1000, is_primary: false },
  ],
}

const sent = (): Record<string, FormDataEntryValue> => Object.fromEntries((mocks.create.mock.calls[0][0] as FormData).entries())
const dialog = () => screen.getByRole('dialog')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.open.mockResolvedValue({ ok: true, options: OPTIONS })
  mocks.create.mockResolvedValue({ ok: true, id: 'loan-new' })
})

describe('Create fund out', () => {
  const draw = () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<CreateFundOutDialog open onClose={onClose} onSaved={onSaved} today="2026-10-15" />)
    return { onClose, onSaved }
  }

  it('says what the design says — its fields in its order, then the rate and the account the system asks', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Create fund out')).toBeInTheDocument()
    expect(within(dialog()).getByText('Needs Principal approval before it is disbursed')).toBeInTheDocument()
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual(['To', 'Amount RM', 'Description', 'From bank', 'Date', 'Custom premium % /mo', 'Account'])
    expect(screen.getByPlaceholderText('What is this for?')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2990' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Carres (CAR)' })).toBeInTheDocument()
    expect(screen.getByText('Base 0.850% (2026-Q4) + 0.000% = 0.850% /mo, locked for the loan’s life.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
    expect(screen.getByText('To, an amount and an account are needed.')).toBeInTheDocument()
    // The primary bank first.
    expect((screen.getByLabelText('From bank') as HTMLSelectElement).value).toBe('bk-hl')
  })

  it('sends the form page’s loan and says it waits for approval', async () => {
    const { onClose, onSaved } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '150000' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Working capital' } })
    fireEvent.change(screen.getByLabelText('Custom premium % /mo'), { target: { value: '1' } })
    expect(screen.getByText('Base 0.850% (2026-Q4) + 1.000% = 1.850% /mo, locked for the loan’s life.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '3010' } })
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    fireEvent.change(screen.getByLabelText('Term · months'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Funding source' }))
    fireEvent.change(screen.getByLabelText('Funding source'), { target: { value: 'HC-58k' } })
    fireEvent.click(screen.getByRole('button', { name: 'Interest' }))
    fireEvent.click(screen.getByLabelText('Compound interest'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(sent()).toEqual({
      company_id: 'co-car',
      principal: '150000.00',
      loan_start_date: '2026-10-15',
      custom_rate_percent: '1',
      tenure_months: '12',
      repayment_start_date: '',
      funding_source: 'HC-58k',
      disbursement_account_code: '3010',
      bank_account_id: 'bk-hl',
      repayment_terms: 'Working capital',
      compound_interest: 'on',
    })
    expect(onSaved).toHaveBeenCalledWith('Loan to Carres submitted — waiting for approval')
    expect(onClose).toHaveBeenCalled()
  })

  it('says the system’s refusal and keeps the form', async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, reason: 'Period 2026-10 is locked' })
    const { onClose } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '1200' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Period 2026-10 is locked')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('holds a term outside 1–120 months', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    fireEvent.change(screen.getByLabelText('Term · months'), { target: { value: '121' } })
    expect(screen.getByText('The term is 1 to 120 months — or leave it blank for no fixed term.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
  })

  it('says so when there is no approved base rate', async () => {
    mocks.open.mockResolvedValueOnce({ ok: false, reason: 'No approved base rate yet — the Principal approves the quarter’s rate in Settings before a loan can be made.' })
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('alert')).toHaveTextContent('No approved base rate yet')
  })
})

describe('Fund OUT’s head', () => {
  const head = (over: Partial<Parameters<typeof FundOutHub>[0]> = {}) =>
    render(
      <FundOutHub
        records={[]}
        month="2026-10"
        today="2026-10-15"
        initialCard="all"
        can={{ edit: true, void: true, amend: false }}
        canSetDefault
        canCreate
        canLoanAging
        canExport
        {...over}
      />,
    )

  it('opens Create fund out on the page; Loan aging and Export CSV beside it; the drawer cancels by this page’s action', async () => {
    head()
    expect(screen.getByRole('link', { name: 'Loan aging' })).toHaveAttribute('href', '/reports/loan-aging')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    expect(mocks.hub.mock.calls.at(-1)![0].onWithdraw).toBe(mocks.cancel)
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create fund out' }))
    })
    expect(screen.getByRole('dialog', { name: 'Create fund out' })).toBeInTheDocument()
    expect(mocks.open).toHaveBeenCalled()
  })

  it('leaves out what the reader may not use', () => {
    head({ canCreate: false, canLoanAging: false, canExport: false })
    expect(screen.getByTestId('head')).toBeEmptyDOMElement()
  })
})
