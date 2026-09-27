import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PayrollBar from './PayrollBar'

const bar = () => screen.getByRole('region', { name: 'Payroll · September 2026' })

afterEach(cleanup)

describe('PayrollBar', () => {
  // User 2026-09-27: Send = Complete, per salesperson — tick five and send
  // them, or send everybody not yet sent. One button for the month cannot.
  it('says the month is not in payroll yet, and sends nothing itself', () => {
    render(<PayrollBar monthLabel="September 2026" state={{ kind: 'not_sent', total: 91_971.9, blockers: [] }} />)
    expect(bar()).toHaveTextContent('Not in payroll yet')
    expect(bar()).toHaveTextContent('it goes salesperson by salesperson, as each one is sent.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('lists what has to be settled first', () => {
    render(<PayrollBar monthLabel="September 2026" state={{ kind: 'not_sent', total: 10, blockers: ['Staff NEWBIE has sales this period but no rank.'] }} />)
    expect(bar()).toHaveTextContent('one thing has to be settled first')
    expect(screen.getByRole('list', { name: 'To settle before payroll' })).toHaveTextContent('Staff NEWBIE has sales this period but no rank.')
  })

  it('says what payroll holds once a month is in it, and whether the page has moved since', () => {
    render(<PayrollBar monthLabel="September 2026" state={{
      kind: 'sent', sentTotal: 300, sentAt: '2026-10-15T02:30:00Z', total: 320, current: false, changedPeople: 1, blockers: [],
    }} />)
    expect(bar()).toHaveTextContent('In payroll · RM 300.00')
    expect(bar()).toHaveTextContent(/Sent 15 Oct 2026, 10:30/)
    expect(bar()).toHaveTextContent('RM 320.00, RM 20.00 more · 1 person changed')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sends nothing for a month settled by hand (August 2026)', () => {
    render(<PayrollBar monthLabel="September 2026" state={{ kind: 'settled', settledBefore: 'September 2026' }} />)
    expect(bar()).toHaveTextContent('Settled by hand')
    expect(bar()).toHaveTextContent('The portal pays from September 2026, so nothing on this page goes to payroll')
  })

  it('says why a closed payroll month takes nothing, in the guard\'s own words', () => {
    render(<PayrollBar monthLabel="September 2026" state={{
      kind: 'closed', sentTotal: 91_971.9,
      closedAs: 'Payroll for Sep 2026 has already been submitted. Reopen payroll before changing commission',
    }} />)
    expect(bar()).toHaveTextContent('In payroll · RM 91,971.90')
    expect(bar()).toHaveTextContent('Payroll for Sep 2026 has already been submitted. Reopen payroll before changing commission. Until then nothing here can change the September 2026 payroll.')
  })

  // The unified Payroll (2026-09-27): where a sent salesperson lands, and a month HR has closed for good.
  it('points at HR › Payroll while the month can still take people', () => {
    render(<PayrollBar monthLabel="September 2026" period="2026-09-01" state={{ kind: 'not_sent', total: 10, blockers: [] }} />)
    expect(screen.getByRole('link', { name: 'HR › Payroll →' })).toHaveAttribute('href', '/hr-costing/payroll/2026-09-01')
    expect(bar()).toHaveTextContent("shows on HR › Payroll → as Completed; HR's Submit to Finance sends them on.")
  })

  it('names a Total Closed month as such, and offers no way in', () => {
    render(<PayrollBar monthLabel="September 2026" period="2026-09-01" state={{
      kind: 'closed', sentTotal: null, closedAs: 'Payroll for September 2026 is closed for good',
    }} />)
    expect(bar()).toHaveTextContent('HR has closed the September 2026 payroll for good (Total Close), so nothing here can change it. Only the Principal can reopen the month.')
    expect(screen.queryByRole('link')).toBeNull()
  })
})
