import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ErpFeedChip from './ErpFeedChip'

const { closeMonth, reopenMonth, refresh } = vi.hoisted(() => ({ closeMonth: vi.fn(), reopenMonth: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../sync-actions', () => ({ closeErpMonth: closeMonth, reopenErpMonth: reopenMonth }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const props = { period: '2026-08-01', subDepartmentId: 'fair', monthLabel: 'August 2026' }

beforeEach(() => {
  vi.clearAllMocks()
  closeMonth.mockResolvedValue({ periodMonth: '2026-08-01', closedAt: '2026-09-26T06:00:00Z', closedByName: 'Principal', note: null })
  reopenMonth.mockResolvedValue({ held: 12, replay: { replayed: 9, applied: 8, stillHeld: 1 } })
})
afterEach(cleanup)

describe('ErpFeedChip', () => {
  it('a live month opens its menu on a right-click as well as a click, and closes only after confirming', async () => {
    render(<ErpFeedChip {...props} closed={null} held={0} />)
    const chip = screen.getByRole('button', { name: /Live from ERP/ })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.contextMenu(chip)
    expect(screen.getByRole('dialog', { name: 'August 2026 and the ERP feed' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close this month to the ERP feed…' }))
    expect(screen.getByText('Close August 2026 to the ERP feed?')).toBeVisible()
    expect(closeMonth).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Why (optional)'), { target: { value: 'paid from the claim form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close month' }))
    await waitFor(() => expect(closeMonth).toHaveBeenCalledWith('2026-08-01', 'fair', 'paid from the claim form'))
    expect(await screen.findByRole('status')).toHaveTextContent('August 2026 is closed to the ERP feed.')
    // The chip's own state is the server's: the page re-renders with it closed.
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('cancel leaves the month live; Escape and a click outside put the menu away', () => {
    render(<div><p>outside</p><ErpFeedChip {...props} closed={null} held={0} /></div>)
    fireEvent.click(screen.getByRole('button', { name: /Live from ERP/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close this month to the ERP feed…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Close this month to the ERP feed…' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Live from ERP/ }))
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(closeMonth).not.toHaveBeenCalled()
  })

  it('a closed month says who closed it and what it held, and reopening replays it', async () => {
    render(<ErpFeedChip {...props} held={12}
      closed={{ closedAt: '2026-09-26T06:00:00Z', closedByName: 'Principal', note: 'paid from the claim form' }} />)
    const chip = screen.getByRole('button', { name: /ERP closed · 12 held/ })
    fireEvent.click(chip)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Principal closed August 2026')
    expect(dialog).toHaveTextContent('“paid from the claim form”')
    expect(dialog).toHaveTextContent('12 deliveries held')

    fireEvent.click(screen.getByRole('button', { name: 'Reopen and replay 12' }))
    await waitFor(() => expect(reopenMonth).toHaveBeenCalledWith('2026-08-01', 'fair'))
    expect(await screen.findByRole('status')).toHaveTextContent('August 2026 is live again. 9 replayed: 8 applied, 1 still held.')
  })

  it('a month settled by hand says when the portal starts paying, and has nothing to reopen', () => {
    render(<ErpFeedChip {...props} held={3} firstPaidLabel="September 2026"
      closed={{ closedAt: '2026-09-26T06:00:00Z', closedByName: 'Principal', note: 'June–August paid from the claim forms', reason: 'before_cutover' }} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: /Settled by hand · 3 held/ }))
    const dialog = screen.getByRole('dialog', { name: 'August 2026 and the ERP feed' })
    expect(dialog).toHaveTextContent('August 2026 was paid outside the portal — the portal pays from September 2026.')
    expect(dialog).toHaveTextContent('“June–August paid from the claim forms”')
    expect(dialog).toHaveTextContent('3 deliveries held')
    expect(screen.queryByRole('button', { name: /Reopen/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Close this month/ })).toBeNull()
  })

  it('says why when the portal refuses', async () => {
    closeMonth.mockRejectedValue(new Error('Could not close the month: Only HR or the Principal may close a month to the ERP feed'))
    render(<ErpFeedChip {...props} closed={null} held={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Live from ERP/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close this month to the ERP feed…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close month' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only HR or the Principal')
    expect(refresh).not.toHaveBeenCalled()
  })
})
