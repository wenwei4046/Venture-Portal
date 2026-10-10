import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import PeriodSelector from './PeriodSelector'

/**
 * Changing the month on Service Billing is a query-string navigation, which
 * keeps this selector mounted. Its local `period` used to be seeded once and
 * then only follow the arrows — after browser Back/Forward the box showed a
 * month the page no longer was. It now restarts on the month the server
 * rendered (2026-09-11, same class as the Director Salary picker bug).
 *
 * 2026-10-10 — the handoff's month control: "← October 2026 ▾ →", the label
 * opening a grid of the year's months with "This month" under it.
 */
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/office-time', async (original) => ({
  ...(await original<typeof import('@/lib/office-time')>()),
  officeMonth: () => '2026-10',
}))

beforeEach(() => vi.clearAllMocks())

const label = () => screen.getByRole('button', { name: /^Pick a month/ })

describe('PeriodSelector across periods', () => {
  it('follows the month the server rendered, including after browser Back', () => {
    const { rerender } = render(<PeriodSelector currentPeriod="2026-09-01" />)
    expect(label()).toHaveTextContent('September 2026')

    // ← shows August at once and asks the router for it.
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(push).toHaveBeenCalledWith('/statements?period=2026-08-01')
    expect(label()).toHaveTextContent('August 2026')

    // The navigation lands.
    rerender(<PeriodSelector currentPeriod="2026-08-01" />)
    expect(label()).toHaveTextContent('August 2026')

    // Browser Back: the server renders September again — the control must too.
    rerender(<PeriodSelector currentPeriod="2026-09-01" />)
    expect(label()).toHaveTextContent('September 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(push).toHaveBeenLastCalledWith('/statements?period=2026-10-01')
  })
})

describe('the month control', () => {
  it('reads "← September 2026 ▾ →" — no native month box, no PERIOD caption', () => {
    render(<PeriodSelector currentPeriod="2026-09-01" />)
    expect(document.querySelector('input[type="month"]')).toBeNull()
    expect(screen.queryByText('Period')).toBeNull()
    expect(label()).toHaveAttribute('aria-expanded', 'false')
    expect(label()).toHaveTextContent('▾')
  })

  it('opens a grid of the year’s months: picking one goes there, the year steps, This month comes home', () => {
    render(<PeriodSelector currentPeriod="2026-09-01" />)
    fireEvent.click(label())
    const pop = screen.getByRole('dialog', { name: 'Pick a month' })
    expect(within(pop).getByText('2026')).toBeInTheDocument()
    const months = within(pop).getAllByRole('button', { name: /^[A-Z][a-z]{2}$/ })
    expect(months.map((b) => b.textContent)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
    expect(within(pop).getByRole('button', { name: 'Sep' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(pop).getByRole('button', { name: 'Oct' })).toHaveAttribute('data-now', 'true')

    fireEvent.click(within(pop).getByRole('button', { name: 'Jun' }))
    expect(push).toHaveBeenCalledWith('/statements?period=2026-06-01')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(label())
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    expect(within(screen.getByRole('dialog')).getByText('2027')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Jan' }))
    expect(push).toHaveBeenLastCalledWith('/statements?period=2027-01-01')

    fireEvent.click(label())
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(push).toHaveBeenLastCalledWith('/statements?period=2026-10-01')
  })

  it('closes the grid on Escape', () => {
    render(<PeriodSelector currentPeriod="2026-09-01" />)
    fireEvent.click(label())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
