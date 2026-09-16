import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ setOpenBillRank: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../../run-actions', () => ({ setOpenBillRank: mocks.setOpenBillRank }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import OpenBillPicker from './OpenBillPicker'

/**
 * The three clicks.
 *
 * The importer seeds a rank from the running document number and marks it a
 * suggestion, so the board has three states, not two — and the middle one is
 * the whole point: agreeing with the importer must be ONE click, or reviewers
 * agree by not clicking.
 */
function picker(props: Partial<Parameters<typeof OpenBillPicker>[0]> = {}) {
  return render(
    <OpenBillPicker
      orderId="order-1"
      staffName="ANTHONY"
      eventDate="2026-09-04"
      rank={null}
      suggested={false}
      disabled={false}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setOpenBillRank.mockResolvedValue(undefined)
})

describe('OpenBillPicker', () => {
  it('claims a rank nothing holds', () => {
    picker()
    fireEvent.click(screen.getByRole('button', { name: /1st/ }))
    expect(mocks.setOpenBillRank).toHaveBeenCalledWith('order-1', 1)
  })

  it('confirms the suggestion when the held rank is clicked', () => {
    picker({ rank: 2, suggested: true })
    fireEvent.click(screen.getByRole('button', { name: /2nd/ }))
    // Not null: clicking what the importer guessed means "yes, that one".
    expect(mocks.setOpenBillRank).toHaveBeenCalledWith('order-1', 2)
  })

  it('clears a rank a human already confirmed', () => {
    picker({ rank: 2, suggested: false })
    fireEvent.click(screen.getByRole('button', { name: /2nd/ }))
    expect(mocks.setOpenBillRank).toHaveBeenCalledWith('order-1', null)
  })

  it('moves the pick when another rank is clicked', () => {
    picker({ rank: 1, suggested: true })
    fireEvent.click(screen.getByRole('button', { name: /3rd/ }))
    expect(mocks.setOpenBillRank).toHaveBeenCalledWith('order-1', 3)
  })

  it('shows the rank but offers no buttons once the month has paid', () => {
    picker({ rank: 1, disabled: true, disabledReason: 'The run has paid' })
    expect(screen.getByText('1st')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says a dash when a locked month holds no pick', () => {
    picker({ disabled: true })
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('surfaces a refused save instead of silently doing nothing', async () => {
    mocks.setOpenBillRank.mockRejectedValue(new Error('That order has no matched salesperson yet.'))
    picker()
    fireEvent.click(screen.getByRole('button', { name: /1st/ }))
    expect(
      await screen.findByText('That order has no matched salesperson yet.'),
    ).toBeInTheDocument()
  })
})
