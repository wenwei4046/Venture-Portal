import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AllocatorTabs from './AllocatorTabs'
import type { AllocatorData, StaffRow, TemplateRow, TxnRow } from './types'

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
vi.mock('./StaffTab', () => ({ default: () => <div>Staff list</div> }))
vi.mock('./SetupTab', () => ({ default: () => <div>Setup list</div> }))

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

const person = (id: string, status: StaffRow['status']): StaffRow => ({ id, name: id, status, department: '', createdAt: '', splits: [] })
const template = (id: string): TemplateRow => ({ id, name: id, method: 'headcount', amount: 0, categoryId: null, status: 'active', splits: [] })

function data(period: string, txns: TxnRow[], over: Partial<AllocatorData> = {}): AllocatorData {
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
    ...over,
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

// 2026-10-07 — the tabs on the sheet (the user approved the allocator sample):
// a counted rail in English — Records by the month's records, Staff by the
// active people, Setup by the templates — and the month picker in the page
// head, not here.
describe('the allocator’s tabs on the sheet', () => {
  it('counts what each tab holds and lands on the month’s records', () => {
    render(
      <AllocatorTabs
        data={data('2026-09', [txn, { ...txn, id: 't2' }], {
          staff: [person('a', 'active'), person('b', 'active'), person('c', 'inactive')],
          templates: [template('Office Rental'), template('Utilities')],
        })}
      />,
    )
    const tab = (name: RegExp) => screen.getByRole('button', { name })
    const count = (name: RegExp) => tab(name).querySelector('[data-tab-count]')?.textContent
    expect(count(/^Records/)).toBe('2')
    expect(count(/^Staff/)).toBe('2')
    expect(count(/^Setup/)).toBe('2')
    expect(tab(/^Calculate/).querySelector('[data-tab-count]')).toBeNull()
    expect(tab(/^Records/)).toHaveAttribute('data-active')
    expect(document.querySelector('input[type="month"]')).toBeNull()

    fireEvent.click(tab(/^Staff/))
    expect(screen.getByText('Staff list')).toBeVisible()
    expect(tab(/^Staff/)).toHaveAttribute('data-active')
  })
})
