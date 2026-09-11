import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AllocatorTabs from './AllocatorTabs'
import type { AllocatorData, TxnRow } from './types'

/**
 * The allocator's month input navigates by ?period= only, which keeps this
 * client workspace mounted. The landing tab (seeded from the month's records)
 * and a record being corrected used to carry over into the next month. The
 * workspace now restarts per month (2026-09-11, same class as the Director
 * Salary grid bug).
 */
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/billing-allocator',
}))
vi.mock('./CalculateTab', () => ({
  default: ({ editTxn }: { editTxn?: { txnNo: string } | null }) => (
    <div>{editTxn ? `Calculate — correcting ${editTxn.txnNo}` : 'Calculate — fresh'}</div>
  ),
}))
vi.mock('./RecordsTab', () => ({
  default: ({ data, onEdit }: { data: { txns: TxnRow[] }; onEdit: (t: TxnRow) => void }) => (
    <button onClick={() => onEdit(data.txns[0])}>correct first record</button>
  ),
}))
vi.mock('./StaffTab', () => ({ default: () => <div>Staff</div> }))
vi.mock('./SetupTab', () => ({ default: () => <div>Setup</div> }))

const txn: TxnRow = {
  id: 't1',
  txnNo: 'ALC-2026-08-001',
  description: 'Office rent',
  billedRef: null,
  locked: false,
  amount: 1000,
  method: 'headcount',
  categoryId: null,
  categoryName: '',
  hcPeriod: null,
  details: [],
}

function data(period: string, txns: TxnRow[]): AllocatorData {
  return {
    period,
    companies: [],
    companySettings: [],
    departments: [],
    staff: [],
    snapshotPeriods: [],
    hrPeriods: [],
    snapshotSplitsByPeriod: {},
    coaAccounts: [],
    categories: [],
    templates: [],
    txns,
    invoices: [],
  }
}

beforeEach(() => vi.clearAllMocks())

describe('AllocatorTabs across periods', () => {
  it('starts the next month fresh instead of carrying the correction over', () => {
    // August has records → lands on Records; start correcting one.
    const { rerender } = render(<AllocatorTabs data={data('2026-08', [txn])} />)
    fireEvent.click(screen.getByText('correct first record'))
    expect(screen.getByText('Calculate — correcting ALC-2026-08-001')).toBeVisible()

    // September has none → lands on Calculate, with nothing being corrected.
    rerender(<AllocatorTabs data={data('2026-09', [])} />)
    expect(screen.getByText('Calculate — fresh')).toBeVisible()
    expect(screen.queryByText(/correcting/)).toBeNull()
  })
})
