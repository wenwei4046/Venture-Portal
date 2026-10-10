import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// 2026-10-10 — the monthly reconciliations as the handoff's sheet table: sort
// arrows, ▽ filters (Range on the month and the counts), a scroll box; the
// row's one button (Continue / Open); a double-click opens the session and a
// right-click offers it, a new tab, its report, Mark done / Reopen, Delete.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), setSessionStatus: vi.fn(), deleteSession: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('../actions', () => ({ setSessionStatus: mocks.setSessionStatus, deleteSession: mocks.deleteSession }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import ReconSessionsTable, { type SessionRow } from './ReconSessionsTable'

const ROWS: SessionRow[] = [
  { id: 's1', bank: 'Maybank', periodMonth: '2026-09-01', file: 'MBB-sep.xlsx', cleared: 48, total: 53, status: 'open' },
  { id: 's2', bank: 'Hong Leong', periodMonth: '2026-08-01', file: 'HL_AUG26.csv', cleared: 171, total: 171, status: 'done' },
]

const row = (file: string) => screen.getByText(file).closest('tr') as HTMLElement
const menuItems = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)
const confirm = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', confirm)
})

describe('the monthly reconciliations', () => {
  it('is a sheet table: ▽ filters, a range on the month and the counts, in a scroll box', () => {
    render(<ReconSessionsTable rows={ROWS} />)
    expect(screen.getByRole('table').closest('.st-box')).not.toBeNull()
    for (const name of ['Bank', 'Month', 'File', 'Cleared', 'Open items', 'Status']) {
      expect(screen.getByRole('button', { name: `Filter ${name}` })).toBeInTheDocument()
    }
    for (const name of ['Month', 'Open items']) {
      fireEvent.click(screen.getByRole('button', { name: `Filter ${name}` }))
      expect(within(screen.getByRole('dialog', { name: `Filter ${name}` })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    }
  })

  it('reads each session: month, cleared of total, what is open, the status chip and one button', () => {
    render(<ReconSessionsTable rows={ROWS} />)
    const open = row('MBB-sep.xlsx')
    expect(open).toHaveTextContent('Sep 2026')
    expect(open).toHaveTextContent('48 / 53')
    expect(within(open).getByText('5')).toHaveClass('text-alert')
    expect(within(open).getAllByText('open').find((e) => !e.closest('.q-sub'))!.closest('.chip')).toHaveClass('alert')
    expect(within(open).getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/reconciliation/s1')
    const done = row('HL_AUG26.csv')
    expect(within(done).getByText('✓ 0')).toHaveClass('text-ledger')
    expect(within(done).getAllByText('done').find((e) => !e.closest('.q-sub'))!.closest('.chip')).toHaveClass('ledger')
    expect(within(done).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/reconciliation/s2')
    // Report / Mark done / Delete live in the row's menu now.
    expect(within(open).queryByRole('link', { name: 'Report' })).toBeNull()
    expect(within(open).queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('opens a session on a double-click', () => {
    render(<ReconSessionsTable rows={ROWS} />)
    fireEvent.doubleClick(row('MBB-sep.xlsx'))
    expect(mocks.push).toHaveBeenCalledWith('/reconciliation/s1')
  })

  it('offers its report, Mark done and Delete on a right-click', async () => {
    mocks.setSessionStatus.mockResolvedValue({})
    render(<ReconSessionsTable rows={ROWS} />)
    fireEvent.contextMenu(row('MBB-sep.xlsx'))
    expect(screen.getByRole('menu', { name: 'Actions for Maybank · Sep 2026' })).toBeInTheDocument()
    expect(menuItems()).toEqual(['打开', '在新分页打开', 'Report', 'Mark done', 'Delete'])
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Report/ }))
    expect(mocks.push).toHaveBeenCalledWith('/reconciliation/s1/report')

    fireEvent.contextMenu(row('MBB-sep.xlsx'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Mark done/ }))
    await waitFor(() => expect(mocks.setSessionStatus).toHaveBeenCalledWith('s1', 'done'))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })

  it('reopens a done session', async () => {
    mocks.setSessionStatus.mockResolvedValue({})
    render(<ReconSessionsTable rows={ROWS} />)
    fireEvent.contextMenu(row('HL_AUG26.csv'))
    expect(menuItems()).toEqual(['打开', '在新分页打开', 'Report', 'Reopen', 'Delete'])
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Reopen/ }))
    await waitFor(() => expect(mocks.setSessionStatus).toHaveBeenCalledWith('s2', 'open'))
  })

  it('deletes only once asked, and says why it could not', async () => {
    render(<ReconSessionsTable rows={ROWS} />)
    confirm.mockReturnValue(false)
    fireEvent.contextMenu(row('MBB-sep.xlsx'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    expect(confirm).toHaveBeenCalledWith('Delete this reconciliation (statement lines and matches)?')
    expect(mocks.deleteSession).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    mocks.deleteSession.mockResolvedValue({ error: 'not allowed' })
    fireEvent.contextMenu(row('MBB-sep.xlsx'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Delete/ }))
    await waitFor(() => expect(mocks.deleteSession).toHaveBeenCalledWith('s1'))
    expect(await screen.findByText('not allowed')).toBeInTheDocument()
  })

  it('lets the arrangement be kept as the default by whoever may', () => {
    render(<ReconSessionsTable rows={ROWS} canSetDefault />)
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    expect(screen.getByRole('button', { name: '设为预设' })).toBeInTheDocument()
  })
})
