import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import StatementsMonth from './StatementsMonth'

/**
 * 2026-10-14 — the Statements page shows one month at a time (user: 在上面能够
 * 选择月份。我不要它把全部月份的 statement 都挤在一个 tab): Service Billing's
 * "← September 2026 ▾ →" at its head, the grid dotting the months that have
 * statements.
 */
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/office-time', async (original) => ({
  ...(await original<typeof import('@/lib/office-time')>()),
  officeMonth: () => '2026-10',
}))

beforeEach(() => vi.clearAllMocks())

const MARKED = { '2026-09': '8 statements', '2026-05': '8 statements' }
const label = () => screen.getByRole('button', { name: /^Pick a month/ })

describe('the Statements month', () => {
  it('steps a month at a time, by the page’s own address', () => {
    render(<StatementsMonth month="2026-09" marked={MARKED} />)
    expect(label()).toHaveTextContent('September 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(push).toHaveBeenCalledWith('/statements/monthly?period=2026-08')
    expect(label()).toHaveTextContent('August 2026')
  })

  it('dots the months that have statements, and says how many on hover', () => {
    render(<StatementsMonth month="2026-09" marked={MARKED} />)
    fireEvent.click(label())
    const grid = within(screen.getByRole('dialog', { name: 'Pick a month' }))
    expect(grid.getByRole('button', { name: 'Sep' })).toHaveAttribute('data-marked', 'true')
    expect(grid.getByRole('button', { name: 'May' })).toHaveAttribute('data-marked', 'true')
    expect(grid.getByRole('button', { name: 'May' })).toHaveAttribute('title', '8 statements')
    expect(grid.getByRole('button', { name: 'Aug' })).not.toHaveAttribute('data-marked')
    expect(grid.getByRole('button', { name: 'Aug' })).not.toHaveAttribute('title')
    fireEvent.click(grid.getByRole('button', { name: 'May' }))
    expect(push).toHaveBeenCalledWith('/statements/monthly?period=2026-05')
  })

  it('follows the month the server rendered — after Back too', () => {
    const { rerender } = render(<StatementsMonth month="2026-09" marked={MARKED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(label()).toHaveTextContent('October 2026')
    rerender(<StatementsMonth month="2026-05" marked={MARKED} />)
    expect(label()).toHaveTextContent('May 2026')
  })
})
