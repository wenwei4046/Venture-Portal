import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { FinSurface } from '@/components/finv/surface'
import type { NewSourceOptions } from '../_lib/new-source-options'

// Record fund in (2026-10-15, the Finance revamp v2 — D12, the prototype's
// `fund-form`): the design's From, Type, Amount RM, Description, Into bank,
// Date; the rate the system asks; the account, the term and the interest
// switches behind the small buttons — still the Finance phone app's sheet. On a
// desktop (2026-10-27, the user's mockup fund-forms-desktop-mockup.html — "照这个
// 样稿做：分块 OK … 连同 Repayment type 一起"; "只针对 desktop 版的") the window
// lays the deal out in parts — Source, Money in, Interest, Repayment — with a
// Repayment type to choose and the summary and schedule beside them. Either
// sends the form page's fund source and says it waits for approval. The hub's
// head opens it (FundInHub).

const mocks = vi.hoisted(() => ({ create: vi.fn(), open: vi.fn(), withdraw: vi.fn(), flash: vi.fn(), refresh: vi.fn(), hub: vi.fn() }))
vi.mock('../actions', () => ({ createFundSourceFromDialog: mocks.create, openRecordFundIn: mocks.open, withdrawFundSource: mocks.withdraw }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('@/components/treasury/FundHub', () => ({
  default: (p: { head: React.ReactNode; onWithdraw: unknown }) => {
    mocks.hub(p)
    return <div data-testid="head">{p.head}</div>
  },
}))

import RecordFundInDialog from './RecordFundInDialog'
import FundInHub from './FundInHub'

const OPTIONS: NewSourceOptions = {
  companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
  departments: [{ id: 'dep-mkt', name: 'Marketing' }],
  accounts: [
    { code: '4052', name: 'Amount Due to - HOUZS Century', type: 'liability', parent_code: '4050', is_active: true },
    { code: '5001', name: 'Share Capital', type: 'equity', parent_code: null, is_active: true },
  ],
  banks: [{ id: 'bk-hl', bank_name: 'Hong Leong Bank', account_number: '23600599248', is_primary: true }],
}

const sent = (): Record<string, FormDataEntryValue> => Object.fromEntries((mocks.create.mock.calls[0][0] as FormData).entries())
const dialog = () => screen.getByRole('dialog')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.open.mockResolvedValue(OPTIONS)
  mocks.create.mockResolvedValue({ ok: true, id: 'fs-new' })
})

const draw = (phone = false) => {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const form = <RecordFundInDialog open onClose={onClose} onSaved={onSaved} today="2026-10-15" />
  render(phone ? <FinSurface.Provider value={{ platform: 'ios' }}>{form}</FinSurface.Provider> : form)
  return { onClose, onSaved }
}
const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
  })
}

describe('Record fund in on a desktop', () => {
  it('lays the deal out in parts, a repayment type still to choose', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Record fund in')).toBeInTheDocument()
    expect(Array.from(dialog().querySelectorAll('section')).map((s) => s.querySelector('div > div > div')?.textContent)).toEqual(['Source', 'Money in', 'Interest', 'Repayment'])
    expect(screen.getAllByRole('radio', { name: /Subsidiary|Director loan|Dept pool|Outsource/ }).map((r) => r.textContent)).toEqual(['Subsidiary', 'Director loan', 'Dept pool', 'Outsource'])
    expect(screen.getByRole('radio', { name: 'Subsidiary' })).toHaveAttribute('aria-checked', 'true')
    // None chosen — no box opened yet.
    expect(screen.queryByLabelText('Principal a month (RM)')).toBeNull()
    expect(screen.getByText('Choose one and what to fill in opens under it.')).toBeInTheDocument()
    expect(screen.getByText('From, an amount, a rate and a repayment type are needed.')).toBeInTheDocument()
    expect(screen.getByText('Booked to', { exact: false })).toHaveTextContent('Booked to 4000 · Fund Sources Payable — the default.Change')
    expect(within(screen.getByTestId('deal-summary')).getByText('Choose a repayment type to see the schedule.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
  })

  it('asks From what its type names: a company, a department, a name in words', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('option', { name: 'HOUZS Century (HC)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Dept pool' }))
    expect(screen.getByRole('option', { name: 'Marketing' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Director loan' }))
    expect(screen.getByPlaceholderText('The director’s name')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Outsource' }))
    expect(screen.getByPlaceholderText('Who lent it')).toBeInTheDocument()
  })

  it('a fixed amount a month: what it works out to, the schedule beside it, and what is sent', async () => {
    const { onSaved } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'co-hc' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '30000' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('radio', { name: /A fixed amount a month/ }))
    fireEvent.change(screen.getByLabelText('Principal a month (RM)'), { target: { value: '2,800' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('10 × RM 2,800.00, then RM 2,000.00 in Sep 2027 — 11 months to clear RM 30,000.00.')
    const summary = within(screen.getByTestId('deal-summary'))
    expect(summary.getByText('10 × RM 2,800.00 + RM 2,000.00, Nov 2026 – Sep 2027')).toBeInTheDocument()
    expect(summary.getByText('Nov 2026 – Aug 2027')).toBeInTheDocument()
    expect(summary.getByText('Sep 2027').closest('tr')).toHaveAttribute('data-last', 'true')
    expect(screen.getByText('Ready — it goes to the Principal for approval.')).toBeInTheDocument()
    await submit()
    expect(sent()).toMatchObject({ source_type: 'subsidiary', from_id: 'co-hc', amount: '30000.00', cost_rate_percent: '2', lock_in_months: '', principal_per_month: '2800' })
    expect(onSaved).toHaveBeenCalledWith('Fund source from HOUZS Century submitted — waiting for approval')
  })

  it('over a number of months sends them as its periods; none sends no fixed term', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'co-hc' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Savings Oct' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText(/Minimum pay interest/))
    // Its month (2026-10-30): none chosen until one is; a later month opens its month under the two.
    expect(screen.getByText('From which month minimum pay starts and a repayment type are needed.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Starts from')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /From a later month/ }))
    expect(screen.getByRole('radio', { name: /From the first instalment/ })).toHaveAccessibleName(/Nov 2026/)
    fireEvent.change(screen.getByLabelText('Starts from'), { target: { value: '2026-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '4052' } })
    fireEvent.click(screen.getByRole('radio', { name: /Over a number of months/ }))
    fireEvent.change(screen.getByLabelText('Number of months'), { target: { value: '6' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('RM 50,000.00 a month (RM 300,000.00 ÷ 6) — the last in Apr 2027.')
    expect(within(screen.getByTestId('deal-summary')).getByText('From Dec 2026')).toBeInTheDocument()
    await submit()
    expect(sent()).toEqual({
      source_type: 'subsidiary',
      from_id: 'co-hc',
      from_freetext_name: '',
      amount: '300000.00',
      cost_rate_percent: '2',
      lock_in_months: '6',
      effective_date: '2026-10-15',
      repayment_date: '',
      notes: 'Savings Oct',
      account_code: '4052',
      bank_account_id: 'bk-hl',
      min_pay_interest: 'on',
      min_pay_interest_from: '2026-12',
    })
  })

  it('none — no fixed term sends the periods blank', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('radio', { name: 'Director loan' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'Loo K.W.' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '20000' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('radio', { name: /None — no fixed term/ }))
    await submit()
    expect(sent()).toMatchObject({ source_type: 'director_loan', from_id: '', from_freetext_name: 'Loo K.W.', cost_rate_percent: '0', lock_in_months: '' })
    expect(sent()).not.toHaveProperty('principal_per_month')
  })

  it('says the system’s refusal (a pool short of the amount) and keeps the form', async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, reason: 'Insufficient balance. Marketing pool has RM 100.00 but you are requesting RM 500.00.' })
    const { onClose } = draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('radio', { name: 'Dept pool' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'dep-mkt' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('radio', { name: /None — no fixed term/ }))
    await submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance. Marketing pool has RM 100.00')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Record fund in on the phone', () => {
  it('keeps the sheet’s form: its fields in its order, the term behind its button', async () => {
    const { onSaved } = draw(true)
    await act(async () => undefined)
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual(['From', 'Type', 'Amount RM', 'Description', 'Into bank', 'Date', 'Rate % /mo'])
    expect(Array.from((screen.getByLabelText('Type') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Subsidiary', 'Director loan', 'Dept pool', 'Outsource'])
    expect(screen.getByText('From, an amount and a rate are needed.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'co-hc' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    fireEvent.change(screen.getByLabelText('Term · months'), { target: { value: '6' } })
    await submit()
    expect(sent()).toMatchObject({ source_type: 'subsidiary', from_id: 'co-hc', lock_in_months: '6' })
    expect(sent()).not.toHaveProperty('principal_per_month')
    expect(onSaved).toHaveBeenCalledWith('Fund source from HOUZS Century submitted — waiting for approval')
  })
})

describe('Fund IN’s head', () => {
  it('opens Record fund in on the page; the drawer withdraws by this page’s action', async () => {
    render(<FundInHub records={[]} month="2026-10" today="2026-10-15" initialCard="all" can={{ edit: true, void: true, amend: false }} canSetDefault canCreate />)
    expect(mocks.hub.mock.calls.at(-1)![0].onWithdraw).toBe(mocks.withdraw)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record fund in' }))
    })
    expect(screen.getByRole('dialog', { name: 'Record fund in' })).toBeInTheDocument()
  })

  it('has no Record fund in for whoever may not record one', () => {
    render(<FundInHub records={[]} month="2026-10" today="2026-10-15" initialCard="all" can={{ edit: false, void: false, amend: false }} canSetDefault={false} canCreate={false} />)
    expect(screen.getByTestId('head')).toBeEmptyDOMElement()
  })
})
