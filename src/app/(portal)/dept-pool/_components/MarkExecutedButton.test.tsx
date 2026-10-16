import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-16 — Mark executed (HR Costing: Execute transfers) asks first on the
// computer, as the phone app's does: nothing sets a submission back.

const mocks = vi.hoisted(() => ({ execute: vi.fn(), refresh: vi.fn() }))
vi.mock('../hr-actions', () => ({ executeHrCostingInWords: mocks.execute }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import MarkExecutedButton from './MarkExecutedButton'

beforeEach(() => vi.clearAllMocks())

describe('Mark executed on the computer', () => {
  it('in a submission’s <summary>, asks without folding the month open; its answer marks it', async () => {
    mocks.execute.mockResolvedValue({ ok: true })
    render(
      <details>
        <summary>
          September 2026 <MarkExecutedButton id="s9" month="September 2026" total="RM 48,210.00" className="btn" />
        </summary>
        <p>the departments</p>
      </details>,
    )
    // The click is the button's alone: its default (the summary folding the month open) is prevented.
    expect(fireEvent.click(screen.getByRole('button', { name: 'Mark executed' }))).toBe(false)
    const ask = screen.getByRole('dialog')
    expect(ask).toHaveTextContent('Mark September 2026 executed?')
    expect(ask).toHaveTextContent('HR costing · RM 48,210.00')
    expect(ask).toHaveTextContent('This cannot be undone.')
    expect(mocks.execute).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Mark executed' }))
    })
    expect(mocks.execute).toHaveBeenCalledWith('s9')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('HR Costing’s Execute transfers asks the same; a refusal stays in the question, in words', async () => {
    mocks.execute.mockResolvedValue({ ok: false, reason: 'Failed to execute HR costing: permission denied' })
    render(<MarkExecutedButton id="s9" month="September 2026" label="Execute transfers" className="btn" />)
    fireEvent.click(screen.getByRole('button', { name: 'Execute transfers' }))
    const ask = screen.getByRole('dialog')
    expect(ask).toHaveTextContent('HR costing')
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Mark executed' }))
    })
    expect(within(ask).getByRole('alert')).toHaveTextContent('Failed to execute HR costing: permission denied')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
