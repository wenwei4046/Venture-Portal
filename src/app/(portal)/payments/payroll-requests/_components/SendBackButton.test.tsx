import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-16 — Payroll Requests' Send back to HR asks in the kit's question,
// the phone app's words, instead of a second click in Chinese: the request is
// cancelled and its accruals reversed, and nothing takes that back.

const mocks = vi.hoisted(() => ({ sendBack: vi.fn(), refresh: vi.fn() }))
vi.mock('../actions', () => ({ sendBackPayrollInWords: mocks.sendBack }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import SendBackButton from './SendBackButton'

beforeEach(() => vi.clearAllMocks())

describe('Send back to HR on the computer', () => {
  it('asks first, in English, and sends back the batch only on its answer', async () => {
    mocks.sendBack.mockResolvedValue({ ok: true })
    render(<SendBackButton period="2026-10-01" periodLabel="Oct 2026 #2" batchId="b2" />)
    expect(screen.queryByText(/打回/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send back to HR' }))
    const ask = screen.getByRole('dialog')
    expect(ask).toHaveTextContent('Send Oct 2026 #2 back to HR?')
    expect(ask).toHaveTextContent('The request is cancelled, its payroll accruals reversed, and its people go back to Completed for HR to change and submit again. This cannot be undone.')
    expect(mocks.sendBack).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Send back' }))
    })
    expect(mocks.sendBack).toHaveBeenCalledWith('b2', '2026-10-01')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('a request from before batches goes back by its month; a refusal stays in the question', async () => {
    mocks.sendBack.mockResolvedValue({ ok: false, reason: '打回失败：this payroll already has a funding voucher' })
    render(<SendBackButton period="2026-08-01" periodLabel="Aug 2026" />)
    fireEvent.click(screen.getByRole('button', { name: 'Send back to HR' }))
    const ask = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Send back' }))
    })
    expect(mocks.sendBack).toHaveBeenCalledWith(null, '2026-08-01')
    expect(within(ask).getByRole('alert')).toHaveTextContent('this payroll already has a funding voucher')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
