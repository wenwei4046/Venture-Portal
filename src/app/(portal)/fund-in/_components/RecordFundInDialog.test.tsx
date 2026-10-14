import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { NewSourceOptions } from '../_lib/new-source-options'

// Record fund in (2026-10-15, the Finance revamp v2 — D12, the prototype's
// `fund-form`): the design's From, Type, Amount RM, Description, Into bank,
// Date; the rate the system asks; the account, the term and the interest
// switches behind the small buttons. From asks what the type names — a
// company, a department, a name in words. It sends the form page's fund
// source and says it waits for approval. The hub's head opens it (FundInHub).

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

describe('Record fund in', () => {
  const draw = () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<RecordFundInDialog open onClose={onClose} onSaved={onSaved} today="2026-10-15" />)
    return { onClose, onSaved }
  }

  it('says what the design says — its fields in its order, then the rate the system asks', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Record fund in')).toBeInTheDocument()
    expect(within(dialog()).getByText('Needs Principal approval before it is booked')).toBeInTheDocument()
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual(['From', 'Type', 'Amount RM', 'Description', 'Into bank', 'Date', 'Rate % /mo'])
    expect(Array.from((screen.getByLabelText('Type') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Subsidiary', 'Director loan', 'Dept pool', 'Outsource'])
    expect(screen.getByText('From, an amount and a rate are needed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
  })

  it('asks From what its type names: a company, a department, a name in words', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('option', { name: 'HOUZS Century (HC)' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'department_pool' } })
    expect(screen.getByRole('option', { name: 'Marketing' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'director_loan' } })
    expect(screen.getByPlaceholderText('The director’s name')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'outsource' } })
    expect(screen.getByPlaceholderText('Who lent it')).toBeInTheDocument()
  })

  it('sends the form page’s fund source and says it waits for approval', async () => {
    const { onClose, onSaved } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'co-hc' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Savings Oct' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '4052' } })
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    fireEvent.change(screen.getByLabelText('Term · months'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Interest' }))
    fireEvent.click(screen.getByLabelText('Minimum pay interest'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
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
    })
    expect(onSaved).toHaveBeenCalledWith('Fund source from HOUZS Century submitted — waiting for approval')
    expect(onClose).toHaveBeenCalled()
  })

  it('sends a director’s loan by the name typed', async () => {
    const { onSaved } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'director_loan' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'Loo K.W.' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '20000' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '0' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(sent()).toMatchObject({ source_type: 'director_loan', from_id: '', from_freetext_name: 'Loo K.W.', cost_rate_percent: '0' })
    expect(onSaved).toHaveBeenCalledWith('Fund source from Loo K.W. submitted — waiting for approval')
  })

  it('says the system’s refusal (a pool short of the amount) and keeps the form', async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, reason: 'Insufficient balance. Marketing pool has RM 100.00 but you are requesting RM 500.00.' })
    const { onClose } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'department_pool' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'dep-mkt' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Rate % /mo'), { target: { value: '1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance. Marketing pool has RM 100.00')
    expect(onClose).not.toHaveBeenCalled()
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
