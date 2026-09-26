import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FairMove } from '../../../_lib/fair-calendar'
import FairMovesPanel from './FairMovesPanel'

const { move, refresh } = vi.hoisted(() => ({ move: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../fair-actions', () => ({ moveConfirmedFairBills: move }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

function bill(over: Partial<FairMove> = {}): FairMove {
  return {
    orderId: 'o1', orderNo: 'HC-SO-2610-004', orderDate: '2026-10-02', venue: 'MVEC SOUTHKEY',
    salesperson: 'LUCAS', orderTotal: 5800, cancelled: false,
    fromPeriod: '2026-10-01', toPeriod: '2026-09-01',
    fairStart: '2026-09-28', fairEnd: '2026-09-30', organiser: 'MLE',
    locked: false, confirmed: true,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  move.mockResolvedValue({ moved: 2, months: ['2026-09-01', '2026-10-01'] })
  Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true })
})
afterEach(cleanup)

describe('FairMovesPanel', () => {
  it('shows nothing on a month no move touches', () => {
    const { container } = render(<FairMovesPanel period="2026-08-01" subDepartmentId="fair" moves={[bill()]} />)
    expect(container).toBeEmptyDOMElement()
  })

  // September 2026: eleven bills of August fairs, and August was settled by hand.
  it('shows nothing when every bill it would list belongs to a settled month', () => {
    const { container } = render(<FairMovesPanel period="2026-09-01" subDepartmentId="fair" moves={[
      bill({ fromPeriod: '2026-09-01', toPeriod: '2026-08-01', locked: true }),
      bill({ orderId: 'o2', fromPeriod: '2026-09-01', toPeriod: '2026-08-01', locked: true, confirmed: false }),
    ]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the bills that belong elsewhere and the ones that belong here, each with its fair', () => {
    render(<FairMovesPanel period="2026-10-01" subDepartmentId="fair" moves={[
      bill(),
      bill({ orderId: 'o2', orderNo: 'HC-SO-2610-009', fromPeriod: '2026-11-01', toPeriod: '2026-10-01', fairStart: '2026-10-30', fairEnd: '2026-11-01' }),
    ]} />)
    const panel = screen.getByRole('region', { name: "Bills of another month's fair" })
    expect(panel).toHaveTextContent('1 belong elsewhere · 1 belong here')
    const row = within(panel).getByRole('row', { name: /HC-SO-2610-004/ })
    expect(row).toHaveTextContent('MVEC SOUTHKEY')
    expect(row).toHaveTextContent('28–30 Sep · MLE')
    expect(within(panel).getByRole('row', { name: /HC-SO-2610-009/ })).toHaveTextContent('30 Oct–1 Nov · MLE')
    expect(row).toHaveTextContent('Oct 2026 → Sep 2026')
    expect(row).toHaveTextContent('Confirmed')
    expect(row).toHaveTextContent('RM 5,800.00')
  })

  it('says a guessed bill stays, counts a settled one instead of listing it, and moves only the confirmed ones', async () => {
    render(<FairMovesPanel period="2026-10-01" subDepartmentId="fair-sub" moves={[
      bill(),
      bill({ orderId: 'o2', orderNo: 'HC-SO-2610-010', confirmed: false }),
      bill({ orderId: 'o3', orderNo: 'HC-SO-2610-011', locked: true }),
    ]} />)
    expect(screen.getByRole('row', { name: /HC-SO-2610-010/ })).toHaveTextContent('Guessed — stays')
    expect(screen.queryByRole('row', { name: /HC-SO-2610-011/ })).toBeNull()
    expect(screen.getByText(/1 more belong to a settled month's fair and stay where they are/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Move the 1 confirmed' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(move).toHaveBeenCalledWith('fair-sub')
    expect(screen.getByRole('status')).toHaveTextContent('Moved 2 bills. Compute the run again for Sep 2026, Oct 2026.')
  })

  it('cannot move when nothing here is confirmed and open', () => {
    render(<FairMovesPanel period="2026-10-01" subDepartmentId="fair" moves={[bill({ confirmed: false })]} />)
    expect(screen.getByRole('button', { name: 'Move the 0 confirmed' })).toBeDisabled()
  })

  it('shows a refusal instead of claiming success', async () => {
    move.mockRejectedValueOnce(new Error('The run for Sep 2026 has paid. Reopen it before moving bills into or out of that month'))
    render(<FairMovesPanel period="2026-10-01" subDepartmentId="fair" moves={[bill()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move the 1 confirmed' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The run for Sep 2026 has paid')
    expect(refresh).not.toHaveBeenCalled()
  })
})
