import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { FinSurface } from '@/components/finv/surface'
import type { NewLoanOptions } from '../_lib/new-loan-options'

// Create fund out (2026-10-15, the Finance revamp v2 — D12, the prototype's
// `fund-form`): the design's To, Amount RM, Description, From bank, Date; the
// system's premium on the quarter's base rate and the account it is booked
// to; the term, the funding source and the interest switches behind the small
// buttons — still the Finance phone app's sheet. On a desktop (2026-10-27, the
// user's mockup fund-forms-desktop-mockup.html — "照这个样稿做"; "只针对 desktop
// 版的") the window lays the loan out in parts — Borrower, Money out, Interest,
// Repayment, Booking — with a Repayment type to choose and the summary and
// schedule beside them. Either sends the form page's loan, every name createLoan
// reads, and says it waits for approval. The hub's head opens it (FundOutHub).

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

const draw = (phone = false) => {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const form = <CreateFundOutDialog open onClose={onClose} onSaved={onSaved} today="2026-10-15" />
  render(phone ? <FinSurface.Provider value={{ platform: 'android' }}>{form}</FinSurface.Provider> : form)
  return { onClose, onSaved }
}
const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
  })
}

describe('Create fund out on a desktop', () => {
  it('lays the loan out in parts: the base, the premium and the rate they make; a repayment type and an account to choose', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Create fund out')).toBeInTheDocument()
    expect(within(dialog()).getByText('Needs Principal approval before it is disbursed')).toBeInTheDocument()
    expect(Array.from(dialog().querySelectorAll('section')).map((s) => s.querySelector('div > div > div')?.textContent)).toEqual(['Borrower', 'Money out', 'Interest', 'Repayment', 'Booking'])
    expect(screen.getByText('Base rate · 2026-Q4')).toBeInTheDocument()
    expect(screen.getByText('To, an amount, an account and a repayment type are needed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
    // The primary bank first.
    expect((screen.getByLabelText('From bank') as HTMLSelectElement).value).toBe('bk-hl')
  })

  it('a fixed amount a month: the interest it makes, the schedule, and the loan sent', async () => {
    const { onClose, onSaved } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '60000' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Working capital' } })
    fireEvent.change(screen.getByLabelText('Premium % /mo'), { target: { value: '1' } })
    expect(screen.getByText('interest a month on RM 60,000.00.', { exact: false })).toHaveTextContent('RM 1,110.00 interest a month on RM 60,000.00.')
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '3010' } })
    fireEvent.change(screen.getByLabelText('Funding source'), { target: { value: 'HC-58k' } })
    fireEvent.click(screen.getByLabelText(/Compound interest/))
    fireEvent.click(screen.getByRole('radio', { name: /A fixed amount a month/ }))
    fireEvent.change(screen.getByLabelText('Principal a month (RM)'), { target: { value: '7000' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('8 × RM 7,000.00, then RM 4,000.00 in Jul 2027 — 9 months to clear RM 60,000.00.')
    const summary = within(screen.getByTestId('deal-summary'))
    expect(summary.getByText('Jul 2027').closest('tr')).toHaveAttribute('data-last', 'true')
    expect(summary.getByText('HC-58k')).toBeInTheDocument()
    await submit()
    expect(sent()).toEqual({
      company_id: 'co-car',
      principal: '60000.00',
      loan_start_date: '2026-10-15',
      custom_rate_percent: '1',
      tenure_months: '',
      principal_per_month: '7000',
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

  it('over a number of months sends the tenure; outside 1–120 it holds', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('radio', { name: /Over a number of months/ }))
    fireEvent.change(screen.getByLabelText('Number of months'), { target: { value: '121' } })
    expect(screen.getAllByText('Whole months, from 1 to 120.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
    fireEvent.change(screen.getByLabelText('Number of months'), { target: { value: '12' } })
    await submit()
    expect(sent()).toMatchObject({ tenure_months: '12' })
    expect(sent()).not.toHaveProperty('principal_per_month')
  })

  it('says the system’s refusal and keeps the form', async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, reason: 'Period 2026-10 is locked' })
    const { onClose } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('radio', { name: /None — no fixed term/ }))
    await submit()
    expect(sent()).toMatchObject({ tenure_months: '' })
    expect(screen.getByRole('alert')).toHaveTextContent('Period 2026-10 is locked')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says so when there is no approved base rate', async () => {
    mocks.open.mockResolvedValueOnce({ ok: false, reason: 'No approved base rate yet — the Principal approves the quarter’s rate in Settings before a loan can be made.' })
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('alert')).toHaveTextContent('No approved base rate yet')
  })
})

describe('Create fund out on the phone', () => {
  it('keeps the sheet’s form: its fields in its order, the term behind its button', async () => {
    draw(true)
    await act(async () => undefined)
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual(['To', 'Amount RM', 'Description', 'From bank', 'Date', 'Custom premium % /mo', 'Account'])
    expect(screen.getByText('Base 0.850% (2026-Q4) + 0.000% = 0.850% /mo, locked for the loan’s life.')).toBeInTheDocument()
    expect(screen.getByText('To, an amount and an account are needed.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'co-car' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    fireEvent.change(screen.getByLabelText('Term · months'), { target: { value: '121' } })
    expect(screen.getByText('The term is 1 to 120 months — or leave it blank for no fixed term.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Term · months'), { target: { value: '12' } })
    await submit()
    expect(sent()).toMatchObject({ tenure_months: '12' })
    expect(sent()).not.toHaveProperty('principal_per_month')
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
