import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UpsaleView } from '../../../_lib/upsales'
import ErpChangesPanel from './ErpChangesPanel'

const { confirm, dismiss, reopen, refresh, push } = vi.hoisted(() => ({ confirm: vi.fn(), dismiss: vi.fn(), reopen: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('../../../upsale-actions', () => ({ confirmErpAdjustment: confirm, dismissErpAdjustment: dismiss, reopenErpAdjustment: reopen }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))

/** HC13911 was paid in August on 16,888; the ERP now says 14,800. */
const DROP: UpsaleView = {
  id: 'd1', staffId: 'ch', staffName: 'CHEA HUAN', kind: 'drop', source: 'erp', status: 'pending',
  erpDocNo: 'HC-SO-013911', settledAmount: 16_888, erpAmount: 14_800, originalPeriod: '2026-08-01',
  erpReason: null, settledPeriod: null, settledBy: null,
  periodMonth: '2026-09-01', amount: -2_088, soldOn: '2026-09-18', fairEventId: null, fairLabel: null,
  originalRef: 'HC13911', note: null,
}
const UPSELL: UpsaleView = {
  ...DROP, id: 'u1', staffId: 'yuny', staffName: 'YUNY', kind: 'upsale', erpDocNo: 'HC5315',
  settledAmount: 4_000, erpAmount: 4_500, amount: 500, originalRef: 'HC5315',
}

beforeEach(() => {
  vi.clearAllMocks()
  confirm.mockResolvedValue(undefined)
  dismiss.mockResolvedValue(undefined)
  reopen.mockResolvedValue(undefined)
  Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true })
})
afterEach(cleanup)

describe('ErpChangesPanel', () => {
  it('says nothing when the ERP changed nothing settled', () => {
    const { container } = render(<ErpChangesPanel period="2026-09-01" pending={[]} locked={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  // A tab of the month's workbench since 2026-09-30: always drawn, and says so when empty.
  it('as a tab, says there is nothing to answer', () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[]} locked={false} inTab />)
    expect(screen.getByRole('region', { name: 'Drops and upsells the ERP found' }))
      .toHaveTextContent('Nothing to answer — the ERP has changed no settled bill since the last answer, and nothing it found is paid into September 2026.')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('as a tab, sums up what waits and what was paid in', () => {
    const PAID: UpsaleView = { ...DROP, id: 'p0', status: 'confirmed', amount: -300, originalRef: 'HC100' }
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP, UPSELL]} paid={[PAID]} locked={false} inTab />)
    const panel = screen.getByRole('region', { name: 'Drops and upsells the ERP found' })
    expect(panel).toHaveTextContent('To answer2')
    expect(panel).toHaveTextContent('Drops waitingRM (2,088.00)')
    expect(panel).toHaveTextContent('Upsells waitingRM 500.00')
    expect(panel).toHaveTextContent('Paid in September 20261net RM (300.00)')
    expect(within(screen.getByRole('table', { name: 'Drops and upsells to answer' })).getByRole('row', { name: /2 to answer/ }))
      .toHaveTextContent('drops RM (2,088.00) · upsells RM 500.00RM (1,588.00)')
  })

  it('shows each change against what was settled, drops and upsells apart (user 2026-09-26)', () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP, UPSELL]} locked={false} />)
    const panel = screen.getByRole('region', { name: 'Drops and upsells the ERP found' })
    expect(panel).toHaveTextContent('2 to answer')
    expect(panel).toHaveTextContent('drops RM (2,088.00) · upsells RM 500.00')

    const row = within(panel).getByRole('row', { name: /HC13911/ })
    expect(row).toHaveTextContent('HC-SO-013911')
    expect(row).toHaveTextContent('CHEA HUAN')
    expect(row).toHaveTextContent('Aug 2026')
    expect(row).toHaveTextContent('RM 16,888.00')
    expect(row).toHaveTextContent('RM 14,800.00')
    expect(row).toHaveTextContent('RM (2,088.00)Drop sales')
    // The document and the paper are the same number: said once.
    expect(within(panel).getByRole('row', { name: /HC5315/ })).toHaveTextContent('RM 500.00Upsell')
    expect(within(within(panel).getByRole('row', { name: /HC5315/ })).getAllByText('HC5315')).toHaveLength(1)
  })

  it('pays a change into the month on screen', async () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay in Sep 2026' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('d1', '2026-09-01'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('lets the ERP’s figure stand only after asking', async () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked={false} />)
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Not a change' }))
    expect(dismiss).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Not a change' }))
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith('d1'))
    expect(window.confirm).toHaveBeenLastCalledWith("HC13911: let the ERP's figure stand and pay no drop?")
  })

  // Why is the button's tooltip, not a notice above the table (2026-10-12).
  it('pays nothing into a month that is in payroll', () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked />)
    expect(screen.queryByText(/is in payroll — open a later month/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Pay in Sep 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pay in Sep 2026' }))
      .toHaveAttribute('title', 'September 2026 is in payroll — open a later month to pay these')
    expect(screen.getByRole('button', { name: 'Not a change' })).toBeEnabled()
  })

  // August 2026 was paid from the claim form and takes no run: a change paid
  // into it would never be paid at all.
  it('pays nothing into a month settled by hand', () => {
    render(<ErpChangesPanel period="2026-08-01" pending={[DROP]} locked={false} settledBefore="September 2026" />)
    expect(screen.queryByText(/was settled by hand and takes no run/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Pay in Aug 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pay in Aug 2026' }))
      .toHaveAttribute('title', 'August 2026 was settled by hand and takes no run — pay these in September 2026 or later')
    expect(screen.getByRole('button', { name: 'Not a change' })).toBeEnabled()
  })

  // The Upsales & drops tab, where these were listed with their Undo, went
  // with the hand-typed form (2026-09-27): they are listed here now.
  describe('what was paid into the month', () => {
    const PAID: UpsaleView = { ...DROP, id: 'p1', status: 'confirmed', originalRef: 'HC13052', erpDocNo: 'HC-SO-2609-061', amount: -500, staffName: 'MELVIN CHONG' }

    it('lists them under what still waits, and shows the panel for them alone', () => {
      render(<ErpChangesPanel period="2026-09-01" pending={[]} paid={[PAID]} locked={false} />)
      const panel = screen.getByRole('region', { name: 'Drops and upsells the ERP found' })
      expect(panel).not.toHaveTextContent('to answer')
      expect(panel).toHaveTextContent('Paid in September 2026 · 1 · net RM (500.00)')
      const row = within(screen.getByRole('table', { name: 'Paid in September 2026' })).getByRole('row', { name: /HC13052/ })
      expect(row).toHaveTextContent('HC-SO-2609-061')
      expect(row).toHaveTextContent('MELVIN CHONG')
      expect(row).toHaveTextContent('RM (500.00)Drop sales')
      expect(screen.queryByRole('button', { name: /Pay in/ })).toBeNull()
    })

    it('sends one back to wait only after asking', async () => {
      render(<ErpChangesPanel period="2026-09-01" pending={[]} paid={[PAID]} locked={false} />)
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(reopen).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Confirm — back to waiting' }))
      await waitFor(() => expect(reopen).toHaveBeenCalledWith('p1'))
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('offers no Undo while the month is in payroll', () => {
      render(<ErpChangesPanel period="2026-09-01" pending={[]} paid={[PAID]} locked />)
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    })
  })

  it('says why when the portal refuses', async () => {
    confirm.mockRejectedValue(new Error('That change is no longer waiting — the ERP may have put it back.'))
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay in Sep 2026' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That change is no longer waiting')
    expect(refresh).not.toHaveBeenCalled()
  })

  // 2026-10-13 — the ERP audit trail: "判断是 upsell 还是 drop sales or
  // cancelation … 如果是 cancellation … 这边应该能看到 … 就要 deduction".
  describe('what the ERP changed, and what gave the commission (2026-10-13)', () => {
    const CANCELLED: UpsaleView = {
      ...DROP, id: 'c1', erpDocNo: 'HC-SO-013367', originalRef: 'HC8972', staffName: 'MELVIN CHONG',
      settledAmount: 10_399, erpAmount: 0, amount: -10_399, erpReason: 'cancelled', settledBy: 'hand', settledPeriod: '2026-08-01',
    }
    const CLOSED: UpsaleView = {
      ...DROP, id: 'k1', erpDocNo: 'HC-SO-2609-101', originalRef: 'HC14001', staffName: 'LUCAS',
      settledAmount: 4_000, erpAmount: 3_000, amount: -1_000, erpReason: 'amount', settledBy: 'close', settledPeriod: '2026-09-01',
      originalPeriod: '2026-09-01',
    }

    it('says a cancellation is one, and what gave the commission', () => {
      render(<ErpChangesPanel period="2026-10-01" pending={[CANCELLED, CLOSED]} locked={false} briefs={{
        c1: { savedLabel: '12 Oct 2026 14:41', kind: 'cancelled', statusAfter: 'CANCELLED', summary: ['Status Confirmed → Cancelled'] },
      }} />)
      const table = screen.getByRole('table', { name: 'Drops and upsells to answer' })
      const row = within(table).getByRole('row', { name: /HC8972/ })
      expect(row).toHaveTextContent('RM (10,399.00)Cancelled')
      expect(row).toHaveTextContent('Claim form · Aug 2026')
      expect(row).toHaveTextContent('CancelledSaved 12 Oct 2026 14:41Status Confirmed → Cancelled')
      // Found before the trail was kept: nothing to say of it.
      expect(within(table).getByRole('row', { name: /HC14001/ })).toHaveTextContent('LUCAS—Closed · Sep 2026')
    })

    it('pays a change only in a month after the close that gave the commission', () => {
      render(<ErpChangesPanel period="2026-09-01" pending={[CLOSED, DROP]} locked={false} />)
      const closed = within(screen.getByRole('row', { name: /HC14001/ })).getByRole('button', { name: 'Pay in Sep 2026' })
      expect(closed).toBeDisabled()
      expect(closed).toHaveAttribute('title', expect.stringContaining('Pay this change in Oct 2026 or later'))
      expect(within(screen.getByRole('row', { name: /HC13911/ })).getByRole('button', { name: 'Pay in Sep 2026' })).toBeEnabled()
    })

    it('lists the month\'s audit trail: what each save changed and what it meant', () => {
      const href = '/revenue/fair/2026-10-01/orders/o1?from=x'
      render(<ErpChangesPanel period="2026-10-01" pending={[]} locked={false} inTab trail={{
        since: '13 Oct 2026', more: false, rows: [
          { id: 't2', savedLabel: '14 Oct 2026 09:10', orderNo: 'HC-SO-2610-001', paper: 'HC14002', href, seller: 'LUCAS',
            kind: 'drop', statusAfter: 'CONFIRMED', before: 5_000, after: 4_000, delta: -1_000,
            summary: ['AKEMI EQUINOX MATT (Q): RM 5,000.00 → RM 4,000.00'], commission: 'Not given yet — Oct 2026 counts it as it is now' },
          { id: 't1', savedLabel: '13 Oct 2026 18:00', orderNo: 'HC-SO-2610-002', paper: null, href: null, seller: 'ANTHONY',
            kind: 'upsell', statusAfter: 'CONFIRMED', before: 2_000, after: 2_500, delta: 500,
            summary: ['Added PILLOW · RM 500.00'], commission: 'Given (Closed · Oct 2026) — RM 500.00 waiting for an answer' },
        ],
      }} />)
      const trail = screen.getByRole('table', { name: 'ERP audit trail' })
      const drop = within(trail).getByRole('row', { name: /HC-SO-2610-001/ })
      expect(drop).toHaveTextContent('14 Oct 2026 09:10HC-SO-2610-001HC14002LUCASDrop salesRM 5,000.00RM 4,000.00RM (1,000.00)')
      expect(drop).toHaveTextContent('AKEMI EQUINOX MATT (Q): RM 5,000.00 → RM 4,000.00Not given yet — Oct 2026 counts it as it is now')
      expect(within(drop).getByRole('link', { name: 'HC-SO-2610-001' })).toHaveAttribute('href', href)
      fireEvent.doubleClick(within(drop).getByText('LUCAS'))
      expect(push).toHaveBeenCalledWith(href)
      expect(within(trail).getByRole('row', { name: /HC-SO-2610-002/ })).toHaveTextContent('UpsellRM 2,000.00RM 2,500.00RM 500.00')
      expect(within(trail).getByRole('row', { name: /2 saves/ })).toHaveTextContent('RM (500.00)')
    })

    it('says when no save moved money', () => {
      render(<ErpChangesPanel period="2026-10-01" pending={[]} locked={false} inTab trail={{ since: '13 Oct 2026', more: false, rows: [] }} />)
      expect(screen.getByRole('region', { name: "ERP audit trail of October 2026's bills" }))
        .toHaveTextContent('No save has moved money on October 2026\'s bills since the record began.')
    })
  })

  // 2026-10-12 — "for all sales order list on the table, need to able press in to show order detail".
  it('opens the bill each change was found on — its number, or a double-click on its row', () => {
    const href = '/revenue/fair/2026-08-01/orders/bill-13911?from=%2Frevenue%2Ffair%2F2026-09-01%3Fview%3Dchanges'
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP, UPSELL]} locked={false} billLinks={{ d1: href }} />)
    const table = screen.getByRole('table', { name: 'Drops and upsells to answer' })
    expect(within(table).getByRole('link', { name: 'HC13911' })).toHaveAttribute('href', href)
    // HC5315 is no bill the portal holds: no link, and its row opens nothing.
    expect(within(table).queryByRole('link', { name: 'HC5315' })).toBeNull()
    fireEvent.doubleClick(within(within(table).getByRole('row', { name: /HC5315/ })).getByText('YUNY'))
    expect(push).not.toHaveBeenCalled()
    fireEvent.doubleClick(within(within(table).getByRole('row', { name: /HC13911/ })).getByText('CHEA HUAN'))
    expect(push).toHaveBeenCalledWith(href)
    // A double-click on its buttons is the buttons'.
    push.mockClear()
    fireEvent.doubleClick(within(within(table).getByRole('row', { name: /HC13911/ })).getByRole('button', { name: 'Pay in Sep 2026' }))
    expect(push).not.toHaveBeenCalled()
  })
})
