import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// Comm Cal › Tally (2026-11-12): each month on its two sides — what Houzs pays
// (a bill's deposit reached, by its SO date) beside what we pay salespeople (the
// month whose close released the bill) — the gap, what is carried, and the
// picked month's bills the two sides pay apart, and the ones neither pays.

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

/** A bill paid in full the day it was keyed, at a fair, not closed yet — unless said otherwise. */
function order(over: Partial<TallyOrder>): TallyOrder {
  const orderDate = over.orderDate ?? '2026-10-05'
  return {
    orderId: 'o', orderNo: 'HC-SO-2610-001', refNo: 'HC1001', periodMonth: '2026-10-01', orderDate,
    staffId: 'anthony', salesperson: 'ANTHONY', customer: 'MR TAN', brandCode: 'AKEMI', goods: 1000,
    cancelled: false, excludedReason: null, depositMet: true, reachedOn: orderDate, hasFair: true, fairDate: null, releasedMonth: null,
    ...over,
  }
}

// September, closed: one bill keyed on 10 Oct. October: one paid by its close, one keyed on 2 Nov whose
// salesperson is not closed yet, one under its deposit. November: its own.
const ORDERS: TallyOrder[] = [
  order({ orderId: 's1', orderNo: 'HC-SO-2609-010', periodMonth: '2026-09-01', orderDate: '2026-09-12', releasedMonth: '2026-09-01' }),
  order({ orderId: 's2', orderNo: 'HC-SO-2610-145', refNo: 'HC13509', periodMonth: '2026-09-01', orderDate: '2026-10-10', reachedOn: '2026-09-19', fairDate: '2026-09-19', goods: 3888, salesperson: 'SALLY', staffId: 'sally', releasedMonth: '2026-09-01' }),
  order({ orderId: 'x1', orderNo: 'HC-SO-2610-020', orderDate: '2026-10-08', goods: 2000, releasedMonth: '2026-10-01' }),
  order({ orderId: 'x2', orderNo: 'HC-SO-2611-022', refNo: 'ZNT6389', brandCode: 'ZANOTTI', orderDate: '2026-11-02', reachedOn: '2026-10-30', fairDate: '2026-10-30', goods: 9500, salesperson: 'STANLEY', staffId: 'stanley' }),
  order({ orderId: 'h1', orderNo: 'HC-SO-2610-077', refNo: 'HC1400', orderDate: '2026-10-07', goods: 18400, depositMet: false, reachedOn: null, salesperson: 'WEI PIN', staffId: 'weipin' }),
  order({ orderId: 'n1', orderNo: 'HC-SO-2611-030', periodMonth: '2026-11-01', orderDate: '2026-11-06', goods: 500 }),
]

const OPTS = { feedFloor: '2026-08-01', from: '2026-09-01' }
const report = () => buildTally(ORDERS, BRANDS, OPTS)

const SUB = { name: 'Fair', slug: 'fair' }

beforeEach(() => {
  vi.clearAllMocks()
  nav.search = ''
  window.history.replaceState(null, '', '/revenue/fair?tab=tally')
})

describe('Comm Cal › Tally', () => {
  it('lists every month on its two sides, with the gap and what is carried', () => {
    render(
      <TallyPanel
        report={report()}
        sub={SUB}
        commission={{ '2026-10-01': { total: 987.65, closed: 13 }, '2026-09-01': { total: 400, closed: 27 } }}
      />,
    )
    const table = screen.getByRole('table', { name: 'Tally by month' })
    expect(within(table).getByText('Houzs pays')).toBeInTheDocument()
    expect(within(table).getByText('We pay')).toBeInTheDocument()
    expect(within(table).getByText('We − Houzs')).toBeInTheDocument()

    // October: Houzs pays on 2,000 + 3,888 (September's, keyed in October); we pay on 2,000 + 9,500 — one of
    // the two not closed yet — and its closed salespeople are paid 987.65. The bill under its deposit is in neither.
    const oct = within(table).getByRole('row', { name: /October 2026/ })
    const cells = within(oct).getAllByRole('cell').map(c => c.textContent)
    expect(cells).toEqual(['October 2026', '2', '5,888.00', '824.32', '21 open', '11,500.00', '1,515.00', '987.65', '690.68', '1,235.00'])
    expect(within(oct).getByText('987.65')).toHaveAttribute('title', '13 salespeople closed')
    expect(within(oct).getByText('1 open')).toHaveAttribute('title', "1 bill waits for its salesperson's close")

    // September: paid by its closes — ours alone carries the bill keyed in October.
    const sep = within(table).getByRole('row', { name: /September 2026/ })
    expect(within(sep).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['September 2026', '1', '1,000.00', '140.00', '2', '4,888.00', '684.32', '400.00', '544.32', '544.32'],
    )

    // November: Houzs pays October's late bill; nothing is carried past it. Nobody closed yet.
    const nov = within(table).getByRole('row', { name: /November 2026/ })
    expect(within(nov).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['November 2026', '2', '10,000.00', '1,305.00', '11 open', '500.00', '70.00', '—', '(1,235.00)', '0.00'],
    )
  })

  it('opens on the latest month with a bill paid apart, and says it in the cards', () => {
    render(<TallyPanel report={report()} sub={SUB} />)
    const cards = screen.getByRole('region', { name: 'Tally for November 2026' })
    expect(within(cards).getByRole('group', { name: 'November · Houzs pays' })).toHaveTextContent('RM 1,305.00')
    expect(within(cards).getByRole('group', { name: 'November · Houzs pays' })).toHaveTextContent('2 bills')
    expect(within(cards).getByRole('group', { name: 'November · we pay' })).toHaveTextContent('RM 70.00')
    expect(within(cards).getByRole('group', { name: 'November · we pay' })).toHaveTextContent('1 bill · 1 not closed')
    expect(within(cards).getByRole('group', { name: 'November gap' })).toHaveTextContent('RM (1,235.00)')
    expect(within(cards).getByRole('group', { name: 'November gap' })).toHaveTextContent('1 bill paid apart')
    expect(within(cards).getByRole('group', { name: 'Carried after November' })).toHaveTextContent('RM 0.00')
  })

  it('lists the picked month’s bills paid apart, each with what the other side does', () => {
    nav.search = 'tab=tally&month=2026-10'
    render(<TallyPanel report={report()} sub={SUB} />)
    expect(screen.getByText('October 2026 · bills paid apart')).toBeInTheDocument()

    const ours = screen.getByRole('table', { name: 'We pay in Oct 2026 · Houzs does not' })
    const late = within(ours).getByRole('row', { name: /HC-SO-2611-022/ })
    // Bill · Salesperson · Fair day · SO date · Deposit · Sales · Bill to HC (its brand and % under it) · Houzs.
    expect(within(late).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['HC-SO-2611-022ZNT6389', 'STANLEY', '30 Oct 2026', '2 Nov 2026', '30 Oct 2026', '9,500.00', '1,235.00Zanotti · 13%', 'Houzs pays Nov 2026Not closed yet'],
    )
    expect(within(late).getByText('Houzs pays Nov 2026')).toHaveAttribute('title', 'SO date 2 Nov 2026')

    const theirs = screen.getByRole('table', { name: 'Houzs pays in Oct 2026 · we do not' })
    const september = within(theirs).getByRole('row', { name: /HC-SO-2610-145/ })
    expect(within(september).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['HC-SO-2610-145HC13509', 'SALLY', '19 Sep 2026', '10 Oct 2026', '19 Sep 2026', '3,888.00', '544.32Akemi · 14%', 'We paid Sep 2026'],
    )
  })

  it('lists the picked month’s bills under their deposit — neither side pays them', () => {
    nav.search = 'tab=tally&month=2026-10'
    render(<TallyPanel report={report()} sub={SUB} />)
    const held = screen.getByRole('table', { name: 'Below deposit in Oct 2026 · neither pays' })
    const row = within(held).getByRole('row', { name: /HC-SO-2610-077/ })
    expect(within(row).getAllByRole('cell').map(c => c.textContent)).toEqual(
      ['HC-SO-2610-077HC1400', 'WEI PIN', '—', '7 Oct 2026', '—', '18,400.00', '2,576.00Akemi · 14%', 'Below deposit'],
    )
    // Its total is the list's own: it is in neither side's figures above.
    expect(within(held).getByText('1 bill')).toBeInTheDocument()
  })

  it('a month’s row picks it — the URL keeps which', () => {
    render(<TallyPanel report={report()} sub={SUB} />)
    fireEvent.click(screen.getByRole('row', { name: /September 2026/ }))
    expect(window.location.search).toBe('?tab=tally&month=2026-09')
    // The month it opens on is the bare tab.
    fireEvent.click(screen.getByRole('row', { name: /November 2026/ }))
    expect(window.location.search).toBe('?tab=tally')
  })

  it('a bill’s row opens the bill, in the month its sales are counted in', () => {
    nav.search = 'tab=tally&month=2026-11'
    render(<TallyPanel report={report()} sub={SUB} />)
    // Listed under November — where Houzs pays it — and October's bill all the same.
    fireEvent.click(screen.getByRole('row', { name: /HC-SO-2611-022/ }))
    expect(nav.push).toHaveBeenCalledWith('/revenue/fair/2026-10-01/orders/x2')
  })

  it('says None for a list with no such bill', () => {
    nav.search = 'tab=tally&month=2026-09'
    render(<TallyPanel report={report()} sub={SUB} />)
    for (const name of ['Houzs pays in Sep 2026 · we do not', 'Below deposit in Sep 2026 · neither pays']) {
      expect(within(screen.getByRole('table', { name })).getByText('None')).toBeInTheDocument()
    }
  })

  it('says a bill the ERP names no fair on: we pay it, Houzs never does', () => {
    const withNoFair = buildTally(
      [
        ...ORDERS,
        order({ orderId: 'f1', orderNo: 'HC-SO-2610-090', refNo: 'HC1500', orderDate: '2026-10-14', goods: 1780, hasFair: false, releasedMonth: '2026-10-01' }),
        // …and one of a brand with no Bill to HC % set.
        order({ orderId: 'f2', orderNo: '2990-SO-2610-009', refNo: 'TNN0209', brandCode: '2990S', orderDate: '2026-10-20', goods: 2990, hasFair: false, releasedMonth: '2026-10-01' }),
      ],
      BRANDS,
      OPTS,
    )
    nav.search = 'tab=tally&month=2026-10'
    render(<TallyPanel report={withNoFair} sub={SUB} />)
    const ours = screen.getByRole('table', { name: 'We pay in Oct 2026 · Houzs does not' })
    const row = within(ours).getByRole('row', { name: /HC-SO-2610-090/ })
    expect(within(row).getByText('No fair in ERP')).toHaveAttribute('title', 'The ERP names no fair on this order — its Event Commission counts it in neither report')
    expect(within(within(ours).getByRole('row', { name: /2990-SO-2610-009/ })).getAllByRole('cell').at(-2)).toHaveTextContent('—2990s · no %')
    // Still carried a month on: nothing clears it.
    const nov = within(screen.getByRole('table', { name: 'Tally by month' })).getByRole('row', { name: /November 2026/ })
    expect(within(nov).getAllByRole('cell').at(-1)).toHaveTextContent('249.20')
  })

  it('names the bills whose brand has no Bill to HC %, and where to set it', () => {
    const withOwn = buildTally(
      [...ORDERS, order({ orderId: 'z1', orderNo: '2990-SO-2611-001', refNo: 'TNN0209', brandCode: '2990S', periodMonth: '2026-11-01', orderDate: '2026-11-03' })],
      BRANDS,
      OPTS,
    )
    render(<TallyPanel report={withOwn} sub={SUB} />)
    const flag = screen.getByText('1 bill · no Bill to HC %')
    expect(flag.closest('a')).toHaveAttribute('href', '/revenue/fair/rules?tab=brands')
  })

  it('offers the picked month’s workbook only to whoever may export', () => {
    nav.search = 'tab=tally&month=2026-10'
    const { unmount } = render(<TallyPanel report={report()} sub={SUB} canExport />)
    const link = screen.getByRole('link', { name: 'Export Oct 2026' })
    expect(link).toHaveAttribute('href', '/revenue/fair/tally/export?month=2026-10')
    expect(link).toHaveAttribute('download')
    unmount()

    render(<TallyPanel report={report()} sub={SUB} />)
    expect(screen.queryByRole('link', { name: /Export/ })).toBeNull()
  })

  it('says so when there is nothing to tally', () => {
    render(<TallyPanel report={{ from: null, months: [], apartBills: 0, noPctBills: 0 }} sub={SUB} />)
    expect(screen.getByText('Nothing to tally yet.')).toBeInTheDocument()
  })
})
