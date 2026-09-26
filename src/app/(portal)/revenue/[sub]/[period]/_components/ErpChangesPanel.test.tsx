import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UpsaleView } from '../../../_lib/upsales'
import ErpChangesPanel from './ErpChangesPanel'

const { confirm, dismiss, refresh } = vi.hoisted(() => ({ confirm: vi.fn(), dismiss: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../upsale-actions', () => ({ confirmErpAdjustment: confirm, dismissErpAdjustment: dismiss }))
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

  it('pays nothing into a month whose run has paid', () => {
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked />)
    expect(screen.getByText(/September 2026's run has paid — open a later month to pay these/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pay in Sep 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Not a change' })).toBeEnabled()
  })

  it('says why when the portal refuses', async () => {
    confirm.mockRejectedValue(new Error('That change is no longer waiting — the ERP may have put it back.'))
    render(<ErpChangesPanel period="2026-09-01" pending={[DROP]} locked={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay in Sep 2026' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That change is no longer waiting')
    expect(refresh).not.toHaveBeenCalled()
  })
})
