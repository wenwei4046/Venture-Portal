import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PeriodSelector from './PeriodSelector'

/**
 * Changing the month on Service Billing is a query-string navigation, which
 * keeps this selector mounted. Its local `period` used to be seeded once and
 * then only follow the arrows — after browser Back/Forward the box showed a
 * month the page no longer was. It now restarts on the month the server
 * rendered (2026-09-11, same class as the Director Salary picker bug).
 */
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => vi.clearAllMocks())

describe('PeriodSelector across periods', () => {
  it('follows the month the server rendered, including after browser Back', () => {
    const { rerender } = render(<PeriodSelector currentPeriod="2026-09-01" />)
    expect(screen.getByLabelText('Period')).toHaveValue('2026-09')

    // ‹ shows August at once and asks the router for it.
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(push).toHaveBeenCalledWith('/billing?period=2026-08-01')
    expect(screen.getByLabelText('Period')).toHaveValue('2026-08')

    // The navigation lands.
    rerender(<PeriodSelector currentPeriod="2026-08-01" />)
    expect(screen.getByLabelText('Period')).toHaveValue('2026-08')

    // Browser Back: the server renders September again — the box must too.
    rerender(<PeriodSelector currentPeriod="2026-09-01" />)
    expect(screen.getByLabelText('Period')).toHaveValue('2026-09')
  })
})
