import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// 2026-10-10 — the Journal Entries list as the handoff's sheet table: sort
// arrows and ▽ filters (Range on Date and Amount), a double-click opens the
// voucher, a right-click offers Open / Open in new tab and what the old
// Actions column did (Edit, Copy, Delete); the voucher number in the body
// face and AUTO as the amber tag.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), deleteJournalVoucher: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('../actions', () => ({ deleteJournalVoucher: mocks.deleteJournalVoucher }))
// The saved column layout is fetched from the browser client; here it has none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import JvList, { type JvRow } from './JvList'

const ROWS: JvRow[] = [
  { id: 'je1', entry_no: 'HV-JV-2610-024', transaction_date: '2026-10-06', description: 'HC term loan interest accrual — Oct', segment: 'treasury', total_amount: 8163.33, lineCount: 2 },
  { id: 'je2', entry_no: 'HV-JV-2610-021', transaction_date: '2026-10-05', description: 'Payroll accrual — Directors', segment: 'director_office', total_amount: 42920, lineCount: 6, auto: true },
]

/** A voucher's row, found by its number. */
const row = (no: string) => screen.getByRole('link', { name: no }).closest('tr') as HTMLElement
const menuItems = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)
const confirm = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', confirm)
})

describe('the Journal Entries list', () => {
  it('is a sheet table: ▽ on every column, a range on Date and Amount, in a scroll box', () => {
    render(<JvList rows={ROWS} />)
    const table = screen.getByRole('table')
    expect(table.closest('.st-box')).not.toBeNull()
    for (const name of ['Voucher', 'Date', 'Description', 'Segment', 'Amount']) {
      expect(screen.getByRole('button', { name: `Filter ${name}` })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Filter Date' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Date' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(screen.getByRole('dialog', { name: 'Filter Amount' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
  })

  it('sorts by a column on its heading', () => {
    render(<JvList rows={ROWS} />)
    const numbers = () => Array.from(document.querySelectorAll('tbody tr')).map((r) => r.querySelector('a')?.textContent)
    expect(numbers()).toEqual(['HV-JV-2610-024', 'HV-JV-2610-021'])
    fireEvent.click(screen.getByText('Amount'))
    expect(numbers()).toEqual(['HV-JV-2610-021', 'HV-JV-2610-024'])
  })

  it('opens a voucher on a double-click', () => {
    render(<JvList rows={ROWS} />)
    fireEvent.doubleClick(within(row('HV-JV-2610-024')).getByText('Treasury'))
    expect(mocks.push).toHaveBeenCalledWith('/reconciliation/journal-entries/je1')
  })

  it('has no Actions column: a right-click offers opening it and Edit / Copy / Delete', () => {
    render(<JvList rows={ROWS} canCreate canEdit />)
    expect(screen.queryByText('Actions')).toBeNull()
    expect(within(row('HV-JV-2610-024')).queryByRole('button', { name: 'Delete' })).toBeNull()
    fireEvent.contextMenu(row('HV-JV-2610-024'))
    const menu = screen.getByRole('menu', { name: 'Actions for HV-JV-2610-024' })
    expect(menuItems(menu)).toEqual(['打开', '在新分页打开', 'Edit', 'Copy', 'Delete'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Copy/ }))
    expect(mocks.push).toHaveBeenCalledWith('/reconciliation/journal-entries/new?from=je1')
  })

  it('an auto accrual is fixed, not edited', () => {
    render(<JvList rows={ROWS} canCreate canEdit />)
    fireEvent.contextMenu(row('HV-JV-2610-021'))
    const menu = screen.getByRole('menu', { name: 'Actions for HV-JV-2610-021' })
    expect(menuItems(menu)).toEqual(['打开', '在新分页打开', 'Fix mistakes', 'Copy', 'Delete'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Fix mistakes/ }))
    expect(mocks.push).toHaveBeenCalledWith('/reconciliation/journal-entries/je2/edit')
  })

  it('offers only what the account may do', () => {
    render(<JvList rows={ROWS} />)
    fireEvent.contextMenu(row('HV-JV-2610-024'))
    expect(menuItems(screen.getByRole('menu'))).toEqual(['打开', '在新分页打开'])
  })

  it('deletes (the reversing delete) after asking, then refreshes', async () => {
    confirm.mockReturnValue(true)
    mocks.deleteJournalVoucher.mockResolvedValue(undefined)
    render(<JvList rows={ROWS} canEdit />)
    fireEvent.contextMenu(row('HV-JV-2610-024'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    expect(confirm).toHaveBeenCalledWith('Delete HV-JV-2610-024? GL, bank and pool effects are reversed. This cannot be undone.')
    await waitFor(() => expect(mocks.deleteJournalVoucher).toHaveBeenCalledWith('je1'))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })

  it('asks first, and does nothing when told no', () => {
    confirm.mockReturnValue(false)
    render(<JvList rows={ROWS} canEdit />)
    fireEvent.contextMenu(row('HV-JV-2610-024'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    expect(mocks.deleteJournalVoucher).not.toHaveBeenCalled()
  })

  it('says why a delete failed', async () => {
    confirm.mockReturnValue(true)
    mocks.deleteJournalVoucher.mockRejectedValue(new Error('Period is closed'))
    render(<JvList rows={ROWS} canEdit />)
    fireEvent.contextMenu(row('HV-JV-2610-024'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    expect(await screen.findByText('Period is closed')).toBeInTheDocument()
  })

  it('sets the number in the body face and AUTO as the amber tag', () => {
    render(<JvList rows={ROWS} />)
    const no = screen.getByRole('link', { name: 'HV-JV-2610-024' })
    expect(no).toHaveAttribute('href', '/reconciliation/journal-entries/je1')
    expect(no).toHaveClass('font-sans', 'font-medium')
    expect(no).not.toHaveClass('font-mono')
    const auto = screen.getByText('AUTO')
    expect(auto).toHaveClass('adm-tag')
    expect(auto.closest('.chip')).toBeNull()
    expect(row('HV-JV-2610-021')).toHaveTextContent('6 lines')
  })

  it('totals what is shown, and the search narrows it', () => {
    render(<JvList rows={ROWS} />)
    expect(document.querySelector('tfoot')).toHaveTextContent('Total')
    expect(document.querySelector('tfoot')).toHaveTextContent('51,083.33')
    fireEvent.change(screen.getByPlaceholderText('Search voucher, description, segment, amount…'), { target: { value: 'payroll' } })
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(document.querySelector('tfoot')).toHaveTextContent('42,920.00')
  })

  it('lets the arrangement be kept as the default by whoever may', () => {
    render(<JvList rows={ROWS} canSetDefault />)
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    expect(screen.getByRole('button', { name: '设为预设' })).toBeInTheDocument()
  })
})
