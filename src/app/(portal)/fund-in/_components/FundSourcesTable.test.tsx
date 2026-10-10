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
const THREE: FundSourceRow[] = [
  source,
  { ...source, id: 'fs-2', fromLabel: 'Carres', status: 'active', outstanding: 40000, maturityDate: '2099-01-01' },
  { ...source, id: 'fs-3', fromLabel: 'HC', status: 'pending_approval', outstanding: null },
]
const header = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement
// The desk's table; the phone's cards carry the same names.
const table = () => document.querySelector('table') as HTMLTableElement
const inTable = () => within(table())
const footCell = (key: string) => table().querySelector(`tfoot td[data-col="${key}"]`) as HTMLElement

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "应该定在靠左,而不是右" · "view … 可以 remove,我希望双击点开").
describe('FundSourcesTable', () => {
  it('has no View column; a double-click opens the source', () => {
    render(<FundSourcesTable rows={[source]} />)
    expect(screen.queryByText('View')).toBeNull()
    expect(header('action')).toBeNull()
    fireEvent.doubleClick(inTable().getByText('Liang'))
    expect(push).toHaveBeenCalledWith('/fund-in/fs-1')
  })

  it('a right-click offers opening it, here or in a new tab, and its schedule to print', () => {
    render(<FundSourcesTable rows={[source]} />)
    fireEvent.contextMenu(inTable().getByText('Liang').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Liang · Loan' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule'])
  })

  // 2026-10-09 — the handoff: Amend terms on an active source's menu, for an
  // account that may amend.
  it('offers Amend terms on an active source, to an account that may amend', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<FundSourcesTable rows={[{ ...source, status: 'active' }]} canAmend />)
    fireEvent.contextMenu(inTable().getByText('Liang').closest('tr')!)
    const menu = screen.getByRole('menu', { name: 'Actions for Liang · Loan' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['打开', '在新分页打开', 'Print schedule', 'Amend terms'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Print schedule/ }))
    expect(open).toHaveBeenCalledWith('/fund-in/fs-1?print=1', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('the two dates read from the left; the figures stay on the right, under their headings', () => {
    render(<FundSourcesTable rows={[source]} />)
    expect(inTable().getByText('15 Jan 2026').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(inTable().getByText('15 Jan 2027').closest('td')!.classList.contains('text-right')).toBe(false)
    expect(header('effectiveDate').classList.contains('right')).toBe(false)
    expect(header('amount').classList.contains('right')).toBe(true)
    expect(header('rate').classList.contains('right')).toBe(true)
  })

  it('chips the status', () => {
    render(<FundSourcesTable rows={THREE} />)
    const chip = (from: string) => inTable().getByText(from).closest('tr')!.querySelector('.chip') as HTMLElement
    expect(chip('Liang')).toHaveClass('info')
    expect(chip('Carres')).toHaveClass('ledger')
    expect(chip('HC')).toHaveClass('wait')
    expect(chip('HC')).toHaveTextContent('pending approval')
  })

  // 2026-10-10 — the handoff: a peach Total row, each sum under its own column.
  it('totals the Amount and the Outstanding under their columns', () => {
    render(<FundSourcesTable rows={THREE} />)
    const foot = table().querySelector('tfoot tr') as HTMLElement
    expect(foot.children).toHaveLength(table().querySelectorAll('thead th').length)
    expect(foot.children[0]).toHaveTextContent('Total')
    expect(footCell('amount')).toHaveTextContent('RM 180,000.00')
    expect(footCell('amount')).toHaveClass('num')
    expect(footCell('outstanding')).toHaveTextContent('RM 100,000.00')
    expect(footCell('rate')).toHaveTextContent('')
  })

  // 2026-10-10 — the handoff: ▽ on every column; an amount or a date also by Range.
  it('filters every column, the amounts and the dates by range as well', () => {
    render(<FundSourcesTable rows={THREE} />)
    const hasRange = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Filter ${name}` }))
      const dialog = screen.getByRole('dialog', { name: `Filter ${name}` })
      const range = within(dialog).queryByRole('button', { name: 'Range' }) !== null
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
      return range
    }
    expect(['Type', 'From', 'Date', 'Amount', 'Outstanding', 'Rate', 'Lock-in', 'Maturity', 'Status'].map((n) => [n, hasRange(n)])).toEqual([
      ['Type', false], ['From', false], ['Date', true], ['Amount', true], ['Outstanding', true], ['Rate', false], ['Lock-in', false], ['Maturity', true], ['Status', false],
    ])
    // A source with nothing outstanding is outside any range of it.
    fireEvent.click(screen.getByRole('button', { name: 'Filter Outstanding' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter Outstanding' })).getByRole('button', { name: 'Range' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Max' }), { target: { value: '50000' } })
    expect(Array.from(table().querySelectorAll('tbody tr')).map((r) => r.querySelector('td:nth-child(2)')?.textContent)).toEqual(['Carres'])
  })

  // 2026-10-10 — the handoff's phone: a card per source — the type with the
  // amount on its right, the status chip, the rest labelled — and a Total.
  it('on a phone reads each source as a card, with a Total at the foot', () => {
    render(<FundSourcesTable rows={THREE} />)
    expect(table().closest('.hidden')).toHaveClass('md:block')
    const list = screen.getByRole('list', { name: 'Fund sources' })
    expect(list.closest('.md\\:hidden')).not.toBeNull()
    const cards = () => within(list).getAllByRole('link')
    const card = cards()[0]
    expect(card).toHaveAttribute('href', '/fund-in/fs-1')
    expect(card.querySelector('.fund-prow-title')).toHaveTextContent('Loan')
    expect(card.querySelector('.fund-prow-fig')).toHaveTextContent('60,000.00Amount')
    expect(card.querySelector('.chip')).toHaveTextContent('repaid')
    for (const text of ['From Liang', 'Date 15 Jan 2026', 'Outstanding 60,000.00', 'Rate 1.000%', 'Lock-in 12 mo', 'Maturity 15 Jan 2027']) {
      expect(card, text).toHaveTextContent(text)
    }
    // HC is pending — nothing outstanding to show.
    expect(cards()[2]).not.toHaveTextContent('Outstanding')
    const foot = list.querySelector('.fund-pfoot') as HTMLElement
    expect(foot).toHaveTextContent('Total')
    expect(foot).toHaveTextContent('180,000.00')
    expect(foot).toHaveTextContent('Outstanding 100,000.00')
    // The phone's own search box narrows the cards.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fund sources' }), { target: { value: 'carr' } })
    expect(cards().map((c) => c.getAttribute('href'))).toEqual(['/fund-in/fs-2'])
  })
})
