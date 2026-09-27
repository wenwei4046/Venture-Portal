import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PayrollBar from './PayrollBar'

const { sendToPayroll, takeBackFromPayroll, refresh } = vi.hoisted(() => ({
  sendToPayroll: vi.fn(), takeBackFromPayroll: vi.fn(), refresh: vi.fn(),
}))
vi.mock('../../../run-actions', () => ({ sendToPayroll, takeBackFromPayroll }))
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

  it('keeps what the send refused visible, and payroll unchanged', async () => {
    sendToPayroll.mockRejectedValue(new Error('Payroll for Sep 2026 has already been submitted. Reopen payroll before changing commission'))
    render(<PayrollBar {...base} state={{ kind: 'not_sent', total: 91_971.9, blockers: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send RM 91,971.90 to payroll' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('has already been submitted')
    expect(refresh).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send RM 91,971.90 to payroll' })).toBeEnabled())
  })
})
