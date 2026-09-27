import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UpsaleView } from '../../../_lib/upsales'
import ErpChangesPanel from './ErpChangesPanel'

const { confirm, dismiss, reopen, refresh } = vi.hoisted(() => ({ confirm: vi.fn(), dismiss: vi.fn(), reopen: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../upsale-actions', () => ({ confirmErpAdjustment: confirm, dismissErpAdjustment: dismiss, reopenErpAdjustment: reopen }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

/** HC13911 was paid in August on 16,888; the ERP now says 14,800. */
const DROP: UpsaleView = {
  id: 'd1', staffId: 'ch', staffName: 'CHEA HUAN', kind: 'drop', source: 'erp', status: 'pending',
  erpDocNo: 'HC-SO-013911', settledAmount: 16_888, erpAmount: 14_800, originalPeriod: '2026-08-01',
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

  it('pays nothing into a month that is in payroll', () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked />)
    expect(screen.getByText(/September 2026 is in payroll — open a later month to pay these\./)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pay in Sep 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Not a change' })).toBeEnabled()
  })

  // August 2026 was paid from the claim form and takes no run: a change paid
  // into it would never be paid at all.
  it('pays nothing into a month settled by hand', () => {
    render(<ErpChangesPanel period="2026-08-01" pending={[DROP]} locked={false} settledBefore="September 2026" />)
    expect(screen.getByText(/August 2026 was settled by hand and takes no run — pay these in September 2026 or later/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pay in Aug 2026' })).toBeDisabled()
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
})
