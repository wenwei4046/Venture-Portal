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
const THREE: LoanRow[] = [
  loan,
  { ...loan, id: 'loan-2', companyName: 'Carres', companyCode: 'CAR', overdue: true, fundingSource: 'HC-58k' },
  { ...loan, id: 'loan-3', companyName: 'HK', companyCode: 'HK', status: 'fully_repaid' },
]
const header = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement
// The desk's table; the phone's cards carry the same names.
const table = () => document.querySelector('table') as HTMLTableElement
const inTable = () => within(table())
const footCell = (key: string) => table().querySelector(`tfoot td[data-col="${key}"]`) as HTMLElement

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "应该定在靠左,而不是右" · "view … 可以 remove,我希望双击点开").
describe('LoansTable', () => {
  it('has no View column; a double-click opens the loan', () => {
    render(<LoansTable rows={[loan]} />)
    expect(screen.queryByText('View')).toBeNull()
    expect(header('action')).toBeNull()
    fireEvent.doubleClick(inTable().getByText('The Cont'))
    expect(push).toHaveBeenCalledWith('/fund-out/loan-9')
  })

  it('a right-click offers opening it, here or in a new tab, and its schedule to print', () => {
    render(<LoansTable rows={[loan]} />)
    fireEvent.contextMenu(inTable().getByText('The Cont').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for The Cont · CONTS' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule'])
  })

  // 2026-10-09 — the handoff: Amend terms on an active loan's menu; the status
  // as a chip, an overdue loan red.
  it('offers Amend terms to an account that may amend, and chips the status', () => {
    render(<LoansTable rows={THREE} canAmend />)
    fireEvent.contextMenu(inTable().getByText('The Cont').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for The Cont · CONTS' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule', 'Amend terms'])
    const chip = (name: string) => inTable().getByText(name).closest('tr')!.querySelector('.chip') as HTMLElement
    expect(chip('The Cont')).toHaveClass('ledger')
    expect(chip('Carres')).toHaveClass('danger')
    expect(chip('Carres')).toHaveTextContent('overdue')
    expect(chip('HK')).toHaveTextContent('fully repaid')
  })

  it('the disbursement date reads from the left; the figures stay on the right', () => {
    render(<LoansTable rows={[loan]} />)
    expect(inTable().getByText('5 Jan 2026').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(header('disbursedAt').classList.contains('right')).toBe(false)
    expect(header('principal').classList.contains('right')).toBe(true)
  })

  // 2026-10-10 — the handoff: the company's code, the day the money went out
  // and the funding source (SC) as one line under the name.
  it('puts the code, the disbursement date and the funding source under the company', () => {
    render(<LoansTable rows={[...THREE, { ...loan, id: 'loan-4', companyName: 'Hookka', status: 'pending_approval', disbursedAt: null }]} />)
    const company = (name: string) => inTable().getByText(name).closest('td') as HTMLElement
    expect(company('Carres')).toHaveTextContent('CAR · 5 Jan 2026 · SC HC-58k')
    expect(company('The Cont')).toHaveTextContent('CONTS · 5 Jan 2026')
    expect(company('The Cont')).not.toHaveTextContent('SC')
    // Not yet disbursed: the day it was recorded.
    expect(company('Hookka')).toHaveTextContent('CONTS · 2 Jan 2026')
  })

  // 2026-10-10 — the handoff: a peach Total row under Principal and Outstanding.
  it('totals the Principal and the Outstanding under their columns', () => {
    render(<LoansTable rows={THREE} />)
    const foot = table().querySelector('tfoot tr') as HTMLElement
    expect(foot.children).toHaveLength(table().querySelectorAll('thead th').length)
    expect(foot.children[0]).toHaveTextContent('Total')
    expect(footCell('principal')).toHaveTextContent('RM 180,000.00')
    // What is still out: the two active loans.
    expect(footCell('outstanding')).toHaveTextContent('RM 90,000.00')
  })

  // 2026-10-10 — the handoff: ▽ on every column; an amount or a date by Range too.
  it('filters every column, the amounts and the date by range as well', () => {
    render(<LoansTable rows={THREE} />)
    const hasRange = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Filter ${name}` }))
      const dialog = screen.getByRole('dialog', { name: `Filter ${name}` })
      const range = within(dialog).queryByRole('button', { name: 'Range' }) !== null
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
      return range
    }
    expect(['Company', 'Principal', 'Outstanding', 'Rate', 'Status', 'Disbursed'].map((n) => [n, hasRange(n)])).toEqual([
      ['Company', false], ['Principal', true], ['Outstanding', true], ['Rate', false], ['Status', false], ['Disbursed', true],
    ])
  })

  // 2026-10-10 — the handoff's phone: a card per loan — the company with the
  // principal on its right, its line of small print, the chip, the rest labelled.
  it('on a phone reads each loan as a card, with a Total at the foot', () => {
    render(<LoansTable rows={THREE} />)
    expect(table().closest('.hidden')).toHaveClass('md:block')
    const list = screen.getByRole('list', { name: 'Loans' })
    expect(list.closest('.md\\:hidden')).not.toBeNull()
    const cards = () => within(list).getAllByRole('link')
    const carres = cards().find((c) => c.getAttribute('href') === '/fund-out/loan-2') as HTMLElement
    expect(carres.querySelector('.fund-prow-title')).toHaveTextContent('Carres')
    expect(carres.querySelector('.fund-prow-fig')).toHaveTextContent('60,000.00Principal')
    expect(carres.querySelector('.fund-prow-sub')).toHaveTextContent('CAR · 5 Jan 2026 · SC HC-58k')
    expect(carres.querySelector('.chip')).toHaveTextContent('overdue')
    for (const text of ['Outstanding 45,000.00', 'Rate 4.000%', 'Disbursed 5 Jan 2026']) expect(carres, text).toHaveTextContent(text)
    const hk = cards().find((c) => c.getAttribute('href') === '/fund-out/loan-3') as HTMLElement
    expect(hk).not.toHaveTextContent('Outstanding')
    const foot = list.querySelector('.fund-pfoot') as HTMLElement
    expect(foot).toHaveTextContent('Total')
    expect(foot).toHaveTextContent('180,000.00')
    expect(foot).toHaveTextContent('Outstanding 90,000.00')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search loans' }), { target: { value: 'car' } })
    expect(cards().map((c) => c.getAttribute('href'))).toEqual(['/fund-out/loan-2'])
  })
})
