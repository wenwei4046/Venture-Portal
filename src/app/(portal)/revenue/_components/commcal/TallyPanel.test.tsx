import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// Comm Cal › Tally (2026-11-12): each month by SO date (what Houzs pays)
// beside by fair date (what we pay salespeople on), the gap, what is carried,
// and the picked month's bills that sit in two months.

const nav = vi.hoisted(() => ({ push: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))

import TallyPanel from './TallyPanel'
import { buildTally, type TallyBrand, type TallyOrder } from '@/lib/commission/tally'

const BRANDS: TallyBrand[] = [
  { code: 'AKEMI', name: 'Akemi', refPrefixes: ['HC'], hcBillPct: 0.14, ownScheme: false },
  { code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13, ownScheme: false },
  { code: '2990S', name: '2990s', refPrefixes: [], hcBillPct: null, ownScheme: true },
]

function order(over: Partial<TallyOrder>): TallyOrder {
  return {
    orderId: 'o', orderNo: 'HC-SO-2610-001', refNo: 'HC1001', periodMonth: '2026-10-01', orderDate: '2026-10-05',
    salesperson: 'ANTHONY', customer: 'MR TAN', brandCode: 'AKEMI', commissionable: 1000,
    cancelled: false, excludedReason: null, depositMet: true, ...over,
  }
}

// September: one bill keyed on 10 Oct. October: one keyed on 2 Nov, still under its deposit.
const ORDERS: TallyOrder[] = [
  order({ orderId: 's1', orderNo: 'HC-SO-2609-010', periodMonth: '2026-09-01', orderDate: '2026-09-12' }),
  order({ orderId: 's2', orderNo: 'HC-SO-2610-145', refNo: 'HC13509', periodMonth: '2026-09-01', orderDate: '2026-10-10', commissionable: 3888, salesperson: 'SALLY' }),
  order({ orderId: 'x1', orderNo: 'HC-SO-2610-020', periodMonth: '2026-10-01', orderDate: '2026-10-08', commissionable: 2000 }),
  order({ orderId: 'x2', orderNo: 'HC-SO-2611-022', refNo: 'ZNT6389', brandCode: 'ZANOTTI', periodMonth: '2026-10-01', orderDate: '2026-11-02', commissionable: 9500, salesperson: 'STANLEY', depositMet: false }),
  order({ orderId: 'n1', orderNo: 'HC-SO-2611-030', periodMonth: '2026-11-01', orderDate: '2026-11-06', commissionable: 500 }),
]

const report = () => buildTally(ORDERS, BRANDS, {
  feedFloor: '2026-08-01',
  from: '2026-09-01',
  fairDates: new Map([['s2', '2026-09-19'], ['x2', '2026-10-30']]),
})

const SUB = { name: 'Fair', slug: 'fair' }

beforeEach(() => {
  vi.clearAllMocks()
  nav.search = ''
  window.history.replaceState(null, '', '/revenue/fair?tab=tally')
})

describe('Comm Cal › Tally', () => {
  it('lists every month in its two calendars, with the gap and what is carried', () => {
    render(<TallyPanel report={report()} sub={SUB} />)
    const table = screen.getByRole('table', { name: 'Tally by month' })
    expect(within(table).getByText('By SO date · Houzs pays')).toBeInTheDocument()
    expect(within(table).getByText('By fair date · we pay')).toBeInTheDocument()

    // October: Houzs pays on 2,000 + 3,888 (September's, keyed in October); we pay on 2,000 + 9,500.
    const oct = within(table).getByRole('row', { name: /October 2026/ })
    const cells = within(oct).getAllByRole('cell').map(c => c.textContent)
    expect(cells).toEqual(['October 2026', '2', '5,888.00', '824.32', '2', '11,500.00', '1,515.00', '690.68', '1,235.00'])

    // September: ours alone carries the bill keyed in October.
    const sep = within(table).getByRole('row', { name: /September 2026/ })
    expect(within(sep).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['September 2026', '1', '1,000.00', '140.00', '2', '4,888.00', '684.32', '544.32', '544.32'],
    )

    // November: Houzs pays October's late bill; nothing is carried past it.
    const nov = within(table).getByRole('row', { name: /November 2026/ })
    expect(within(nov).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['November 2026', '2', '10,000.00', '1,305.00', '1', '500.00', '70.00', '(1,235.00)', '0.00'],
    )
  })

  it('opens on the latest month with a bill in two months, and says it in the cards', () => {
    render(<TallyPanel report={report()} sub={SUB} />)
    const cards = screen.getByRole('region', { name: 'Tally for November 2026' })
    expect(within(cards).getByRole('group', { name: 'November · by SO date' })).toHaveTextContent('RM 1,305.00')
    expect(within(cards).getByRole('group', { name: 'November · by SO date' })).toHaveTextContent('2 bills · Houzs pays')
    expect(within(cards).getByRole('group', { name: 'November · by fair date' })).toHaveTextContent('RM 70.00')
    expect(within(cards).getByRole('group', { name: 'November gap' })).toHaveTextContent('RM (1,235.00)')
    expect(within(cards).getByRole('group', { name: 'November gap' })).toHaveTextContent('1 bill in two months')
    expect(within(cards).getByRole('group', { name: 'Carried after November' })).toHaveTextContent('RM 0.00')
  })

  it('lists the picked month’s bills in two months, each with what the other side does', () => {
    nav.search = 'tab=tally&month=2026-10'
    render(<TallyPanel report={report()} sub={SUB} />)
    expect(screen.getByText('October 2026 · bills in two months')).toBeInTheDocument()

    const ours = screen.getByRole('table', { name: 'Fair date in Oct 2026 · SO date in another month' })
    const late = within(ours).getByRole('row', { name: /HC-SO-2611-022/ })
    expect(within(late).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['HC-SO-2611-022ZNT6389', 'STANLEY', 'Zanotti', '30 Oct 2026', '2 Nov 2026', '9,500.00', '13%', '1,235.00', 'Houzs pays Nov 2026Below deposit'],
    )

    const theirs = screen.getByRole('table', { name: 'SO date in Oct 2026 · fair date in another month' })
    const september = within(theirs).getByRole('row', { name: /HC-SO-2610-145/ })
    expect(within(september).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['HC-SO-2610-145HC13509', 'SALLY', 'Akemi', '19 Sep 2026', '10 Oct 2026', '3,888.00', '14%', '544.32', 'We paid Sep 2026'],
    )
  })

  it('a month’s row picks it — the URL keeps which', () => {
    render(<TallyPanel report={report()} sub={SUB} />)
    fireEvent.click(screen.getByRole('row', { name: /September 2026/ }))
    expect(window.location.search).toBe('?tab=tally&month=2026-09')
    // The month it opens on is the bare tab.
    fireEvent.click(screen.getByRole('row', { name: /November 2026/ }))
    expect(window.location.search).toBe('?tab=tally')
  })

  it('a bill’s row opens the bill', () => {
    nav.search = 'tab=tally&month=2026-10'
    render(<TallyPanel report={report()} sub={SUB} />)
    fireEvent.click(screen.getByRole('row', { name: /HC-SO-2611-022/ }))
    expect(nav.push).toHaveBeenCalledWith('/revenue/fair/2026-10-01/orders/x2')
  })

  it('says None for a side with no such bill', () => {
    nav.search = 'tab=tally&month=2026-09'
    render(<TallyPanel report={report()} sub={SUB} />)
    const theirs = screen.getByRole('table', { name: 'SO date in Sep 2026 · fair date in another month' })
    expect(within(theirs).getByText('None')).toBeInTheDocument()
  })

  it('names the bills whose brand has no Bill to HC %, and where to set it', () => {
    const withOwn = buildTally(
      [...ORDERS, order({ orderId: 'z1', orderNo: '2990-SO-2611-001', refNo: 'TNN0209', brandCode: '2990S', periodMonth: '2026-11-01', orderDate: '2026-11-03' })],
      BRANDS,
      { feedFloor: '2026-08-01', from: '2026-09-01' },
    )
    render(<TallyPanel report={withOwn} sub={SUB} />)
    const flag = screen.getByText('1 bill · no Bill to HC %')
    expect(flag.closest('a')).toHaveAttribute('href', '/revenue/fair/rules?tab=brands')
  })

  it('says so when there is nothing to tally', () => {
    render(<TallyPanel report={{ from: null, months: [], twoMonthBills: 0, noPctBills: 0 }} sub={SUB} />)
    expect(screen.getByText('Nothing to tally yet.')).toBeInTheDocument()
  })
})
