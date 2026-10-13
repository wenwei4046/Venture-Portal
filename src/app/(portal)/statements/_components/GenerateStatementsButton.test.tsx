import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 2026-10-14 — the Statements page shows one month at a time: Generate opens
 * on the month on show, generating another month goes there, and what it did
 * shows beside the button on the month it was for.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), generateStatements: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../actions', () => ({ generateStatements: mocks.generateStatements }))

import GenerateStatementsButton from './GenerateStatementsButton'

beforeEach(() => vi.clearAllMocks())

const monthBox = () => screen.getByLabelText('Period') as HTMLInputElement

describe('Generate statements, by the month on show', () => {
  it('opens on the month on show, and stays there when that is the month generated', async () => {
    mocks.generateStatements.mockResolvedValue({ generated: 8, skipped: 0, period: '2026-09-01' })
    render(<GenerateStatementsButton month="2026-09" />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate statements' }))
    expect(monthBox().value).toBe('2026-09')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, generate' }))
    await waitFor(() => expect(screen.getByText(/8 generated/)).toBeInTheDocument())
    expect((mocks.generateStatements.mock.calls[0][0] as FormData).get('period_month')).toBe('2026-09-01')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('goes to another month it generated, and shows what it did there only', async () => {
    mocks.generateStatements.mockResolvedValue({ generated: 8, skipped: 1, period: '2026-10-01' })
    const { rerender } = render(<GenerateStatementsButton month="2026-09" />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate statements' }))
    fireEvent.change(monthBox(), { target: { value: '2026-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, generate' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/statements/monthly?period=2026-10'))
    // Still on September until the navigation lands: nothing said here.
    expect(screen.queryByText(/generated/)).toBeNull()
    rerender(<GenerateStatementsButton month="2026-10" />)
    expect(screen.getByText(/8 generated, 1 skipped/)).toBeInTheDocument()
  })

  it('opens on the month now on show after the page moved', () => {
    const { rerender } = render(<GenerateStatementsButton month="2026-09" />)
    rerender(<GenerateStatementsButton month="2026-05" />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate statements' }))
    expect(monthBox().value).toBe('2026-05')
  })
})
