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

import LoansTable, { type LoanRow } from './LoansTable'

const loan: LoanRow = {
  id: 'loan-9',
  companyName: 'The Cont',
  companyCode: 'CONTS',
  createdAt: '2026-01-02T03:00:00Z',
  disbursedAt: '2026-01-05',
  principal: 60000,
  outstanding: 45000,
  effectiveRate: 0.04,
  status: 'active',
  fundingSource: null,
}
const header = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "应该定在靠左,而不是右" · "view … 可以 remove,我希望双击点开").
describe('LoansTable', () => {
  it('has no View column; a double-click opens the loan', () => {
    render(<LoansTable rows={[loan]} />)
    expect(screen.queryByText('View')).toBeNull()
    expect(header('action')).toBeNull()
    fireEvent.doubleClick(screen.getByText('The Cont'))
    expect(push).toHaveBeenCalledWith('/fund-out/loan-9')
  })

  it('a right-click offers opening it, here or in a new tab, and its schedule to print', () => {
    render(<LoansTable rows={[loan]} />)
    fireEvent.contextMenu(screen.getByText('The Cont').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for The Cont · CONTS' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule'])
  })

  // 2026-10-09 — the handoff: Amend terms on an active loan's menu; the status
  // as a chip, an overdue loan red; the totals of what is shown.
  it('offers Amend terms to an account that may amend, chips the status and totals the list', () => {
    render(<LoansTable rows={[loan, { ...loan, id: 'loan-2', companyName: 'Carres', overdue: true }, { ...loan, id: 'loan-3', companyName: 'HK', status: 'fully_repaid' }]} canAmend />)
    fireEvent.contextMenu(screen.getByText('The Cont').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for The Cont · CONTS' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule', 'Amend terms'])
    // The status cell's chip, not the phone's small print.
    const chip = (name: string) => Array.from(screen.getByText(name).closest('tr')!.querySelectorAll('.chip')).find((c) => !c.closest('.q-sub')) as HTMLElement
    expect(chip('The Cont')).toHaveClass('ledger')
    expect(chip('Carres')).toHaveClass('danger')
    expect(chip('Carres')).toHaveTextContent('overdue')
    expect(chip('HK')).toHaveTextContent('fully repaid')
    expect(document.querySelector('tfoot')).toHaveTextContent('3 loans · principal RM 180,000.00')
    expect(document.querySelector('tfoot')).toHaveTextContent('Outstanding RM 90,000.00')
  })

  it('the disbursement date reads from the left; the figures stay on the right', () => {
    render(<LoansTable rows={[loan]} />)
    // The Disbursed cell, not the phone's small print under the company.
    const cell = screen.getAllByText('5 Jan 2026').find((el) => !el.closest('.q-sub'))!
    expect(cell.closest('td')!.classList.contains('text-right')).toBe(false)
    expect(header('disbursedAt').classList.contains('right')).toBe(false)
    expect(header('principal').classList.contains('right')).toBe(true)
  })
})
