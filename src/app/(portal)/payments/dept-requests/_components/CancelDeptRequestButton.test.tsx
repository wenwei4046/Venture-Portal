import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-16 — Payments › Dept Requests' Cancel request asks first on the
// computer, as the phone app's does: it refunds the reserved pool and voids a
// pending voucher, and nothing takes that back.

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), refresh: vi.fn() }))
vi.mock('../actions', () => ({ cancelDeptRequestInWords: mocks.cancel }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import CancelDeptRequestButton from './CancelDeptRequestButton'

beforeEach(() => vi.clearAllMocks())

describe('Cancel request on the computer', () => {
  it('opens the question — the request and its amount — and only its answer cancels', async () => {
    mocks.cancel.mockResolvedValue({ ok: true })
    render(<CancelDeptRequestButton requestId="r1" label="Marketing → Meta Platforms" amount="RM 2,500.00" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request (refunds the reserved pool)' }))
    const ask = screen.getByRole('dialog')
    expect(ask).toHaveTextContent('Cancel Marketing → Meta Platforms?')
    expect(ask).toHaveTextContent('RM 2,500.00')
    expect(ask).toHaveTextContent('The pool it reserved is refunded and a pending voucher voided. This cannot be undone.')
    expect(mocks.cancel).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel request' }))
    })
    expect(mocks.cancel).toHaveBeenCalledWith('r1', 'Cancelled by Finance from dept-requests page')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('Cancel leaves the request; a refusal stays in the question, in words', async () => {
    mocks.cancel.mockResolvedValue({ ok: false, reason: 'This request already has a paid voucher.' })
    render(<CancelDeptRequestButton requestId="r1" label="Marketing → Meta Platforms" amount="RM 2,500.00" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request (refunds the reserved pool)' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request (refunds the reserved pool)' }))
    const ask = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel request' }))
    })
    expect(within(ask).getByRole('alert')).toHaveTextContent('This request already has a paid voucher.')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
