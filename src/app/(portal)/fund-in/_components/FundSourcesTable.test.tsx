import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import FundSourcesTable, { type FundSourceRow } from './FundSourcesTable'

const source: FundSourceRow = {
  id: 'fs-1',
  typeLabel: 'Loan',
  fromLabel: 'Liang',
  effectiveDate: '2026-01-15',
  amount: 60000,
  outstanding: 60000,
  costRate: 0.01,
  lockInMonths: 12,
  maturityDate: '2027-01-15',
  status: 'repaid',
  notes: null,
}
const header = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "应该定在靠左,而不是右" · "view … 可以 remove,我希望双击点开").
describe('FundSourcesTable', () => {
  it('has no View column; a double-click opens the source', () => {
    render(<FundSourcesTable rows={[source]} />)
    expect(screen.queryByText('View')).toBeNull()
    expect(header('action')).toBeNull()
    fireEvent.doubleClick(screen.getByText('Liang'))
    expect(push).toHaveBeenCalledWith('/fund-in/fs-1')
  })

  it('a right-click offers opening it, here or in a new tab', () => {
    render(<FundSourcesTable rows={[source]} />)
    fireEvent.contextMenu(screen.getByText('Liang').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Liang · Loan' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开'])
  })

  it('the two dates read from the left; the figures stay on the right, under their headings', () => {
    render(<FundSourcesTable rows={[source]} />)
    expect(screen.getByText('15 Jan 2026').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(screen.getByText('15 Jan 2027').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(header('effectiveDate').classList.contains('right')).toBe(false)
    expect(header('amount').classList.contains('right')).toBe(true)
    expect(header('rate').classList.contains('right')).toBe(true)
  })

  // The phone grid kept Type and Date only because Date was right-aligned
  // (first column + first right-aligned one). It still keeps those two.
  it('a phone keeps the same two columns it did', () => {
    render(<FundSourcesTable rows={[source]} />)
    const kept = Array.from(document.querySelectorAll('thead th[data-col]'))
      .filter((h) => !h.classList.contains('m-hide'))
      .map((h) => (h as HTMLElement).dataset.col)
    expect(kept).toEqual(['typeLabel', 'effectiveDate'])
  })
})
