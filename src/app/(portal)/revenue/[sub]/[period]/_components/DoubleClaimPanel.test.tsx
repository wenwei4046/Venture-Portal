import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DoubleClaimBill, DoubleClaimGroup } from '@/lib/commission/double-claims'
import { groupDoubleClaims } from '@/lib/commission/double-claims'
import DoubleClaimPanel from './DoubleClaimPanel'

const { dismiss, restore } = vi.hoisted(() => ({ dismiss: vi.fn(), restore: vi.fn() }))
vi.mock('../../../double-claim-actions', () => ({ dismissDoubleClaim: dismiss, restoreDoubleClaim: restore }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

const bill = (billRef: string, orderNo: string, periodMonth: string, extra: Partial<DoubleClaimBill> = {}): DoubleClaimBill => ({
  billRef, orderId: `${orderNo}-id`, orderNo, periodMonth, orderDate: periodMonth.replace(/01$/, '20'),
  staffId: 'ch', employeeName: 'CHEA HUAN', agentName: 'Chea Huan', orderTotal: 8290,
  source: 'erp_sync', paidByRun: false, dismissed: false, ...extra,
})

const hc11366 = (dismissed = false): DoubleClaimGroup[] => groupDoubleClaims([
  bill('HC11366', 'HC11366', '2026-08-01', { source: 'file', dismissed }),
  bill('HC11366', 'HC-SO-2610-001', '2026-09-01', { dismissed, paidByRun: false }),
])

const props = { period: '2026-09-01', subDepartmentId: 'fair', basePath: '/revenue/fair', unavailable: null }

beforeEach(() => {
  vi.clearAllMocks()
  dismiss.mockResolvedValue(2)
  restore.mockResolvedValue(undefined)
  // happy-dom has no dialogs; the browser's confirm() is what the button asks.
  Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true })
})
afterEach(cleanup)

describe('DoubleClaimPanel', () => {
  it('says nothing when there is nothing to ask', () => {
    const { container } = render(<DoubleClaimPanel {...props} groups={[]} carried={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one paper on two bills in two months — which is which, and where each came from', () => {
    render(<DoubleClaimPanel {...props} groups={hc11366()} carried={[]} />)
    const panel = screen.getByRole('region', { name: 'Possible double claims' })
    expect(panel).toHaveTextContent('1 to check')
    expect(panel).toHaveTextContent('HC11366on 2 bills in August 2026 and September 2026')
    const rows = within(panel).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'Aug 2026HC11366CHEA HUANRM 8,290.00Imported',
      'Sep 2026HC-SO-2610-001CHEA HUANRM 8,290.00ERP',
    ])
    expect(within(panel).getByRole('link', { name: 'HC11366' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders/HC11366-id')
  })

  it('marking a pair as separate sales asks first, then saves', async () => {
    render(<DoubleClaimPanel {...props} groups={hc11366()} carried={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Checked — separate sales' }))
    expect(window.confirm).toHaveBeenCalledWith('HC11366: these 2 bills are separate sales, not one bill claimed twice?')
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith('fair', 'HC11366'))
  })

  it('an answered pair steps aside but can be asked again', async () => {
    render(<DoubleClaimPanel {...props} groups={hc11366(true)} carried={[]} />)
    expect(screen.getByRole('region', { name: 'Possible double claims' })).toHaveTextContent('0 to check')
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 checked — separate sales' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith('fair', 'HC11366'))
  })

  it("names the months no run paid whose bills ride into this one — CH's June and July in August", () => {
    render(<DoubleClaimPanel {...props} period="2026-08-01" groups={[]}
      carried={[{ periodMonth: '2026-06-01', bills: 1, value: 3888 }, { periodMonth: '2026-07-01', bills: 9, value: 74026 }]} />)
    const panel = screen.getByRole('region', { name: 'Possible double claims' })
    expect(panel).toHaveTextContent('10 bills carried in from June 2026 and July 2026 · RM 77,914.00')
    expect(panel).toHaveTextContent('computing August 2026 would pay these bills again')
    expect(panel).toHaveTextContent('Jun 2026 · 1 bill · RM 3,888.00')
    expect(panel).toHaveTextContent('Jul 2026 · 9 bills · RM 74,026.00')
  })

  it('says so when the check itself could not run', () => {
    render(<DoubleClaimPanel {...props} groups={[]} carried={[]} unavailable="function revenue_possible_double_claims does not exist" />)
    expect(screen.getByRole('region', { name: 'Possible double claims' }))
      .toHaveTextContent('The check for bills claimed twice could not run: function revenue_possible_double_claims does not exist')
  })
})
