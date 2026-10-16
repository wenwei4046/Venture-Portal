import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// A person's page goes on below the card and the record in the same wells
// (2026-10-16, the user: "the promotion, permissions and activity go with new
// as well"): Promotion beside Employment, each its title in capitals.

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../promote-actions', () => ({ promoteStaff: vi.fn() }))
vi.mock('../actions', () => ({ deactivateStaff: vi.fn(), reactivateStaff: vi.fn() }))

import PersonChanges from './PersonChanges'
import type { CardLadder } from '../card-actions'

const ladder = (over: Partial<CardLadder> = {}): CardLadder => ({
  level: 'L3',
  next: { level: 'L4', titles: [{ id: 't-senior', name: 'Senior Executive' }] },
  blocker: null,
  ...over,
})

afterEach(cleanup)

const well = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section')!

describe('Promotion and Employment, as wells', () => {
  it('draws two wells, each its title, the next step in the reference’s words', () => {
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active />)
    expect(within(well('Promotion')).getByText('Next up')).toBeInTheDocument()
    expect(within(well('Promotion')).getByText('Senior Executive')).toBeInTheDocument()
    expect(within(well('Promotion')).getByText('L3 → L4')).toBeInTheDocument()
    expect(within(well('Promotion')).getByRole('button', { name: 'Promote' })).toBeEnabled()
    expect(within(well('Employment')).getByText('Status')).toBeInTheDocument()
    expect(within(well('Employment')).getByText('Active')).toBeInTheDocument()
  })

  it('says why Promote is off', () => {
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder({ blocker: 'Would stand above BOSS — move the line first.' })} active />)
    expect(within(well('Promotion')).getByRole('button', { name: 'Promote' })).toBeDisabled()
    expect(within(well('Promotion')).getByText('Would stand above BOSS — move the line first.')).toBeInTheDocument()
  })

  it('asks before deactivating, and an inactive person has only Reactivate and no Promotion', () => {
    const { unmount } = render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active />)
    fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Deactivate' }))
    expect(within(well('Employment')).getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(within(well('Employment')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    unmount()

    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active={false} />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Promotion' })).toBeNull()
    expect(within(well('Employment')).getByText('Inactive')).toBeInTheDocument()
    expect(within(well('Employment')).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })
})
