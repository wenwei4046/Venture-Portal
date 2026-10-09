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

  it('a right-click offers opening it, here or in a new tab, and its schedule to print', () => {
    render(<FundSourcesTable rows={[source]} />)
    fireEvent.contextMenu(screen.getByText('Liang').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Liang · Loan' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule'])
  })

  // 2026-10-09 — the handoff: Amend terms on an active source's menu, for an
  // account that may amend.
  it('offers Amend terms on an active source, to an account that may amend', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<FundSourcesTable rows={[{ ...source, status: 'active' }]} canAmend />)
    fireEvent.contextMenu(screen.getByText('Liang').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Liang · Loan' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule', 'Amend terms'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Print schedule/ }))
    expect(open).toHaveBeenCalledWith('/fund-in/fs-1?print=1', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('the two dates read from the left; the figures stay on the right, under their headings', () => {
    render(<FundSourcesTable rows={[source]} />)
    expect(screen.getByText('15 Jan 2026').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(screen.getByText('15 Jan 2027').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(header('effectiveDate').classList.contains('right')).toBe(false)
    expect(header('amount').classList.contains('right')).toBe(true)
    expect(header('rate').classList.contains('right')).toBe(true)
  })

  // 2026-10-09 — the handoff: a phone keeps who and how much is still owed;
  // the type, the date and the status are its small print.
  it('a phone keeps From and Outstanding, the rest as small print', () => {
    render(<FundSourcesTable rows={[source]} />)
    const kept = Array.from(document.querySelectorAll('thead th[data-col]'))
      .filter((h) => !h.classList.contains('m-hide'))
      .map((h) => (h as HTMLElement).dataset.col)
    expect(kept).toEqual(['fromLabel', 'outstanding'])
    expect(screen.getByText('Liang').closest('td')!.querySelector('.q-sub')).toHaveTextContent('Loan · 15 Jan 2026')
  })

  it('chips the status, ranges the amount and the date, and totals what is shown', () => {
    render(
      <FundSourcesTable
        rows={[
          source,
          { ...source, id: 'fs-2', fromLabel: 'Carres', status: 'active', outstanding: 40000, maturityDate: '2099-01-01' },
          { ...source, id: 'fs-3', fromLabel: 'HC', status: 'pending_approval', outstanding: null },
        ]}
      />,
    )
    // The status cell's chip, not the phone's small print.
    const chip = (from: string) => Array.from(screen.getByText(from).closest('tr')!.querySelectorAll('.chip')).find((c) => !c.closest('.q-sub')) as HTMLElement
    expect(chip('Liang')).toHaveClass('info')
    expect(chip('Carres')).toHaveClass('ledger')
    expect(chip('HC')).toHaveClass('wait')
    expect(chip('HC')).toHaveTextContent('pending approval')
    expect(document.querySelector('tfoot')).toHaveTextContent('3 sources · amount RM 180,000.00')
    expect(document.querySelector('tfoot')).toHaveTextContent('Outstanding RM 100,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Amount' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
  })
})
