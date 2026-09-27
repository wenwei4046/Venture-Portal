import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PayrollBar from './PayrollBar'

const { takeBackFromPayroll, refresh } = vi.hoisted(() => ({
  takeBackFromPayroll: vi.fn(), refresh: vi.fn(),
}))
vi.mock('../../../run-actions', () => ({ takeBackFromPayroll }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const base = { period: '2026-09-01', monthLabel: 'September 2026', subDepartmentId: 'sub-fair', runId: null }
const bar = () => screen.getByRole('region', { name: 'Payroll · September 2026' })

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PayrollBar', () => {
  it('sends nothing for a month settled by hand (August 2026)', () => {
    render(<PayrollBar {...base} monthLabel="September 2026" state={{ kind: 'settled', settledBefore: 'September 2026' }} />)
    expect(bar()).toHaveTextContent('Settled by hand')
    expect(bar()).toHaveTextContent('The portal pays from September 2026, so nothing on this page goes to payroll')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says why a closed payroll month takes nothing, in the guard\'s own words', () => {
    render(<PayrollBar {...base} runId="run-1" state={{
      kind: 'closed', sentTotal: 91_971.9,
      closedAs: 'Payroll for Sep 2026 has already been submitted. Reopen payroll before changing commission',
    }} />)
    expect(bar()).toHaveTextContent('In payroll · RM 91,971.90')
    expect(bar()).toHaveTextContent('Payroll for Sep 2026 has already been submitted. Reopen payroll before changing commission. Until then nothing here can change the September 2026 payroll.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  // Unified Payroll (2026-09-27): no whole-month send — a salesperson goes
  // to payroll when closed here, and HR submits them from HR › Payroll.
  it('offers no whole-month send, only the way to HR › Payroll', () => {
    render(<PayrollBar {...base} state={{ kind: 'not_sent', total: 91_971.9, blockers: [] }} />)
    expect(bar()).toHaveTextContent('Goes to payroll person by person')
    expect(bar()).toHaveTextContent('A salesperson goes to payroll when you close them here')
    expect(screen.queryByRole('button', { name: /Send/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'HR › Payroll →' })).toHaveAttribute('href', '/hr-costing/payroll/2026-09-01')
  })

  it('lets a month an old run put in payroll be taken back, never updated', async () => {
    takeBackFromPayroll.mockResolvedValue(undefined)
    render(<PayrollBar {...base} runId="run-1" state={{ kind: 'sent', sentTotal: 89_460.99, sentAt: '2026-09-26T14:29:04Z', total: 91_971.9, current: false, changedPeople: 3, blockers: [] }} />)
    expect(screen.queryByRole('button', { name: /Update payroll/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Take back' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Take back' })[0])
    await waitFor(() => expect(takeBackFromPayroll).toHaveBeenCalledWith('run-1'))
  })
})
