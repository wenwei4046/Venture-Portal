import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { EngineInput, Rank, SalesOrder } from '@/lib/commission/types'
import { buildPayRow } from '@/lib/revenue-pay'
import { upsalesToOrders } from '@/lib/commission/upsales'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import CommissionWorkbench, { type PayrollBarFacts } from './CommissionWorkbench'

const { saveOpenPicks, refresh, push, excludeOrder, includeOrder, sendToPayroll, takeBackFromPayroll, url } = vi.hoisted(() => {
  // Next re-renders `useSearchParams` from the browser's own pushState and
  // replaceState; the stand-in does the same through this subscription.
  const listeners = new Set<() => void>()
  return {
    saveOpenPicks: vi.fn(), refresh: vi.fn(), push: vi.fn(), excludeOrder: vi.fn(), includeOrder: vi.fn(),
    sendToPayroll: vi.fn(), takeBackFromPayroll: vi.fn(),
    url: {
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
      changed() { for (const listener of listeners) listener() },
    },
  }
})
vi.mock('../../../run-actions', () => ({ saveOpenBillPicks: saveOpenPicks, excludeOrder, includeOrder, sendToPayroll, takeBackFromPayroll }))
vi.mock('../../../close-actions', () => ({ closeSalespeople: vi.fn(), reopenSalespeople: vi.fn() }))
vi.mock('next/navigation', async () => {
  const { useMemo, useSyncExternalStore } = await import('react')
  return {
    useRouter: () => ({ refresh, push }),
    useSearchParams: () => {
      const search = useSyncExternalStore(url.subscribe, () => window.location.search, () => '')
      return useMemo(() => new URLSearchParams(search), [search])
    },
  }
})
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))

const originalPush = window.history.pushState.bind(window.history)
const originalReplace = window.history.replaceState.bind(window.history)
/** What Back (or a reload) does to the month page: the same page, on the URL it had. */
function visit(search: string) {
  originalReplace(null, '', `/revenue/fair/2026-08-01${search}`)
  act(() => url.changed())
}

const rank = (rankKey: string, productRate: number, sortOrder: number, titleLabel: string): Rank => ({
  rankKey, productRate, sortOrder, titleId: rankKey, titleLabel, label: `${productRate * 100}%`,
  canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null,
})

function sale(id: string, amount = 1_000, extra: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id, orderNo: `SO-${id}`, staffId: 'agent', periodMonth: '2026-08-01',
    orderDate: '2026-08-12', eventDate: '2026-08-12', orderTotal: amount, paidAmount: amount,
    lines: [
      { id: `${id}-goods`, itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: amount, costAmount: amount * 0.6 },
      { id: `${id}-kpi`, itemGroup: 'ACC', productCode: 'PILLOW', brandCode: 'AKEMI', qty: 1, lineAmount: 0, costAmount: 0 },
    ], ...extra,
  }
}

function fixture(): CommissionWorkbenchData {
  const input: EngineInput = {
    periodMonth: '2026-08-01',
    scheme: {
      openBillBasis: 'uplift_on_commission', overrideIncludesKpi: false,
      enableProductRevenue: true, enableKpi: true, enableOpenBill: true, enableOverride: true,
      enableMarginPenalty: true, enableMarginIncentive: true,
      itemGroups: [{ group: 'SOFA', commissionable: true }, { group: 'ACC', commissionable: true }],
      depositThresholdPct: 0.3, defaultRateMode: 'fixed',
    },
    ranks: [rank('agent', 0.05, 1, 'Revenue Specialist'), rank('leader', 0.08, 2, 'Team Leader')],
    hierarchy: [
      { staffId: 'agent', uplineStaffId: 'leader', baseRankKey: 'agent', titleId: 'agent', rateMode: 'fixed' },
      { staffId: 'leader', uplineStaffId: null, baseRankKey: 'leader', titleId: 'leader', rateMode: 'fixed' },
    ],
    orders: [sale('one'), sale('two', 2_000)],
    kpiItems: [{ productCode: 'PILLOW', kpiAmount: 20 }],
    kpiThresholds: [{ minQty: 2, bonusPct: 0.2 }],
    openBillRules: [{ rank: 1, pct: 0.5 }, { rank: 2, pct: 0.4 }, { rank: 3, pct: 0.3 }],
    openBillTags: [{ orderId: 'one', rank: 1 }],
    marginBands: [{ brandCode: 'AKEMI', bandKey: 'reward', label: 'Reward', kind: 'incentive', marginPct: 0.36, monthlyIncentive: 1_000, commissionMultiplier: 1 }],
    priorMonths: [],
  }
  return {
    input, currentHierarchy: input.hierarchy,
    currentRules: { hierarchy: input.hierarchy, kpiItems: input.kpiItems, kpiThresholds: input.kpiThresholds, openBillRules: input.openBillRules },
    unmatchedOrderNos: [], payRows: [], payUnavailable: true,
    people: [
      { staffId: 'agent', name: 'Anthony', employeeCode: 'HV001' },
      { staffId: 'leader', name: 'Alex', employeeCode: 'HV002' },
    ],
    orders: [
      { orderId: 'one', venue: 'Arena', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL', fair: null },
      { orderId: 'two', venue: 'Convention Centre', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL', fair: null },
    ],
  }
}

function salaryFixture() {
  const data = fixture()
  data.payUnavailable = false
  data.payRows = [{ ...buildPayRow({
    staffId: 'agent', employeeName: 'Anthony', employeeCode: 'HV001', designation: 'Revenue Specialist', employmentType: 'full_time',
    commissionHere: 1223, commissionElsewhere: 100, payrollAdjustment: 20,
    payrollExists: false, payrollStatus: null, payrollCommission: null, payrollGross: null, payrollNet: null,
    input: {
      basicSalary: 500, statutoryAllowance: 100, nonStatutoryAllowance: 30, otAmount: 40,
      deductionAmount: 11, skbbkAmount: 4, daysWorked: 31, daysInMonth: 31,
      epfEr: 60, socsoEr: 10, eisEr: 2, epfEe: 50, socsoEe: 5, eisEe: 1,
      pcb: 15, taxMode: 'pcb', withholdingRate: 0,
    },
  }), components: null }]
  return data
}

const monthStats = { salesValue: 3_000, commissionableValue: 2_800, totalOrders: 2, unmatchedAgents: 0, linesWithoutCost: 0 }

const PAYROLL: PayrollBarFacts = {
  subDepartmentId: 'sub-fair', monthLabel: 'August 2026', runId: null, sentAt: null, settledBefore: null, payrollClosed: null,
}

function renderBoard(data = fixture(), runStatus: string | null = null, savedTotals: { staffId: string; total: number }[] = []) {
  return render(<CommissionWorkbench data={data} sub="fair" period="2026-08-01" runStatus={runStatus} savedTotals={savedTotals} monthStats={monthStats} />)
}

function choose(name: string) { fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}$`) })) }
function personalTable() { return screen.getByRole('table', { name: 'Personal commission by sales order' }) }
function salesRow(table: HTMLElement, orderNo: string) { return within(table).getByRole('row', { name: new RegExp(orderNo) }) }
function openTab() { fireEvent.click(screen.getByRole('tab', { name: /^Open Bill/ })) }

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  saveOpenPicks.mockResolvedValue(undefined)
  excludeOrder.mockResolvedValue({ orderNo: 'SO-one', changed: true, openBillRank: 1 })
  includeOrder.mockResolvedValue({ orderNo: 'SO-one', changed: true, counts: true, stillOut: null, openBillRank: 1 })
  originalReplace(null, '', '/revenue/fair/2026-08-01')
  vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, next) => { originalPush(data, unused, next); url.changed() })
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, next) => { originalReplace(data, unused, next); url.changed() })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CommissionWorkbench', () => {
  it('opens an agent as a focused page and restores the month overview on return', () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      monthOverview={<><h1>August 2026 overview</h1><p>Total sales value · RM 3,000.00</p></>}
      payroll={PAYROLL} />)
    expect(screen.getByRole('heading', { name: 'August 2026 overview' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Monthly commission summary' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Payroll · August 2026' })).toBeVisible()
    choose('Anthony')
    expect(screen.getByRole('heading', { name: 'Anthony' })).toBeVisible()
    expect(screen.queryByText('August 2026 overview')).toBeNull()
    expect(screen.queryByText('Total sales value · RM 3,000.00')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Monthly commission summary' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Payroll · August 2026' })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Commission views' })).toBeNull()
    expect(screen.queryByText('Review settings')).toBeNull()
    expect(screen.queryByText('Targets, thresholds & margin by brand')).toBeNull()
    expect(screen.queryByText('Claims & travel')).toBeNull()
    expect(screen.getByRole('tablist', { name: 'Salesperson commission type' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    expect(screen.getByRole('heading', { name: 'August 2026 overview' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Monthly commission summary' })).toBeVisible()
    expect(screen.getByRole('tablist', { name: 'Commission views' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Payroll · August 2026' })).toBeVisible()
    expect(screen.queryByText('Claims & travel')).toBeNull()
  })

  it('keeps six month cards above the ledger and recalculates commission independently of search and source sales totals', () => {
    renderBoard()
    const summary = () => screen.getByRole('region', { name: 'Monthly commission summary' })
    const card = (name: string) => within(summary()).getByRole('group', { name, exact: true })

    expect(within(summary()).getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual([
      'Total sales value', 'Commissionable value', 'Total orders', 'Salespeople', 'Total commission', 'Lines without a cost',
    ])
    expect(card('Total sales value')).toHaveTextContent('RM 3,000.00')
    // Two figures on purpose (user 2026-09-26): the whole bill, and the part that earns.
    expect(card('Commissionable value')).toHaveTextContent('RM 2,800.00')
    expect(card('Commissionable value')).toHaveTextContent('RM 200.00 no commission')
    expect(within(card('Total orders')).getByText('2')).toBeVisible()
    expect(within(card('Salespeople')).getByText('2')).toBeVisible()
    expect(card('Total commission')).toHaveTextContent('RM 1,313.00')
    expect(within(card('Lines without a cost')).getByText('0')).toBeVisible()
    expect(within(summary()).getByText('Unmatched agents')).toHaveTextContent('Unmatched agents 0')
    expect(screen.queryByRole('heading', { name: 'Salespeople' })).toBeNull()
    expect(screen.queryByText('Personal sales and downline overriding, together in one view.')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search salesperson' }), { target: { value: 'Anthony' } })
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull()
    expect(within(card('Salespeople')).getByText('2')).toBeVisible()
    expect(card('Total commission')).toHaveTextContent('RM 1,313.00')

    fireEvent.click(screen.getByText(/^Calculation setup/))
    fireEvent.click(screen.getByRole('checkbox', { name: 'KPI incentive' }))
    expect(card('Total commission')).toHaveTextContent('RM 1,265.00')
    expect(card('Total commission')).toHaveTextContent('Draft calculation')
    expect(card('Total sales value')).toHaveTextContent('RM 3,000.00')
    expect(within(card('Total orders')).getByText('2')).toBeVisible()
    expect(within(card('Salespeople')).getByText('2')).toBeVisible()
    expect(within(card('Lines without a cost')).getByText('0')).toBeVisible()
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  it("shows each salesperson's sales value beside what of it earns, and names what does not (user 2026-09-26)", () => {
    // A Kuching bill: the goods, and the transport the ERP folds into the total.
    const data = fixture()
    data.input.scheme.itemGroups = [...data.input.scheme.itemGroups, { group: 'SERVICE', commissionable: false }]
    data.input.orders = [...data.input.orders, sale('three', 1_000, {
      orderTotal: 1_147, paidAmount: 1_147,
      lines: [
        { id: 'three-goods', itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: 1_000, costAmount: 600 },
        { id: 'three-transport', itemGroup: 'SERVICE', productCode: 'TRANSPORTATION CHARGES', qty: 1, lineAmount: 147, costAmount: 0 },
      ],
    })]
    renderBoard(data)

    const summary = screen.getByRole('table', { name: 'Salesperson commission summary' })
    expect(within(summary).getByRole('columnheader', { name: 'Commissionable value' })).toBeVisible()
    const anthony = within(summary).getByRole('row', { name: /Anthony/ })
    expect(anthony).toHaveTextContent('RM 4,147.00')
    expect(anthony).toHaveTextContent('RM 4,000.00RM 147.00 no commission')
    const alex = within(summary).getByRole('row', { name: /Alex/ })
    expect(alex).not.toHaveTextContent('no commission')

    choose('Anthony')
    const table = personalTable()
    expect(within(table).getByRole('columnheader', { name: 'Commissionable value' })).toBeVisible()
    expect(salesRow(table, 'SO-three')).toHaveTextContent('RM 1,147.00')
    expect(salesRow(table, 'SO-three')).toHaveTextContent('RM 1,000.00RM 147.00 no commission')
    expect(salesRow(table, 'SO-one')).not.toHaveTextContent('no commission')
  })

  it('sets upsells and drops beside the bills, never counted among them (user 2026-09-26)', () => {
    const data = fixture()
    data.input.orders = [
      ...data.input.orders,
      ...upsalesToOrders([
        { id: 'up', staff_id: 'agent', amount: 300, sold_on: '2026-08-20', original_ref: 'HC5315' },
        { id: 'drop', staff_id: 'agent', amount: -2_088, sold_on: '2026-08-21', original_ref: 'HC13911', kind: 'drop' },
      ], '2026-08-01'),
    ]
    renderBoard(data)

    const summary = screen.getByRole('table', { name: 'Salesperson commission summary' })
    expect(within(summary).getByRole('columnheader', { name: 'Upsell' })).toBeVisible()
    expect(within(summary).getByRole('columnheader', { name: 'Drop sales' })).toBeVisible()
    const cells = within(within(summary).getByRole('row', { name: /Anthony/ })).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent(/^2$/) // the two bills, not four
    expect(cells[3]).toHaveTextContent('RM 3,000.00')
    expect(cells[6]).toHaveTextContent('RM 300.00')
    expect(cells[7]).toHaveTextContent('RM (2,088.00)')
    const alex = within(within(summary).getByRole('row', { name: /Alex/ })).getAllByRole('cell')
    expect(alex[6]).toHaveTextContent('—')
    expect(alex[7]).toHaveTextContent('—')
  })

  // Moved up from the saved run's table, which went (user 2026-09-26).
  it('shows Group sales between the commissionable value and the upsells', () => {
    renderBoard()
    const summary = screen.getByRole('table', { name: 'Salesperson commission summary' })
    const headers = within(summary).getAllByRole('columnheader').map(h => h.textContent)
    expect(headers.slice(headers.indexOf('Commissionable value'), headers.indexOf('Upsell') + 1))
      .toEqual(['Commissionable value', 'Group sales', 'Upsell'])
    const anthony = within(within(summary).getByRole('row', { name: /Anthony/ })).getAllByRole('cell')
    expect(anthony[5]).toHaveTextContent('RM 3,000.00')
    // Alex sold nothing himself; his group is his downline's sales.
    const alex = within(within(summary).getByRole('row', { name: /Alex/ })).getAllByRole('cell')
    expect(alex[3]).toHaveTextContent('RM 0.00')
    expect(alex[5]).toHaveTextContent('RM 3,000.00')
    expect(within(summary).getByRole('row', { name: /All salespeople · total commission/ }).firstElementChild).toHaveAttribute('colspan', '11')
  })

  it('lists the bills below deposit across the team with how much is still to collect, and opens a name on theirs', () => {
    const data = fixture()
    data.input.orders = [sale('one'), sale('two', 2_000, { paidAmount: 100 })]
    renderBoard(data)
    const tab = screen.getByRole('tab', { name: /^Below deposit/ })
    expect(tab).toHaveTextContent('1')
    fireEvent.click(tab)
    expect(screen.getByRole('heading', { name: 'Waiting on a deposit' })).toBeVisible()
    expect(screen.getByText(/Below 30% of the order total/)).toBeVisible()
    const table = screen.getByRole('table', { name: 'Orders below deposit' })
    expect(within(table).queryByText('SO-one')).toBeNull()
    const row = salesRow(table, 'SO-two')
    const cells = within(row).getAllByRole('cell')
    expect(cells[1]).toHaveTextContent('Anthony')
    expect(cells[4]).toHaveTextContent('RM 2,000.00')
    expect(cells[6]).toHaveTextContent('RM 100.005% of the bill')
    expect(cells[7]).toHaveTextContent('RM 600.0030% of the bill')
    expect(cells[8]).toHaveTextContent('RM 500.00')
    expect(within(row).getByRole('link', { name: 'SO-two' })).toHaveAttribute('href',
      `/revenue/fair/2026-08-01/orders/two?from=${encodeURIComponent('/revenue/fair/2026-08-01?view=deposit')}`)
    expect(screen.getByText('Still to collect', { selector: 'span' }).parentElement).toHaveTextContent('RM 500.00')

    fireEvent.click(within(row).getByRole('button', { name: 'Anthony' }))
    expect(screen.getByRole('heading', { name: 'Anthony' })).toBeVisible()
    expect(screen.getByRole('tab', { name: /^Below deposit/ })).toHaveAttribute('aria-selected', 'true')
    const mine = screen.getByRole('table', { name: 'Anthony orders below deposit' })
    expect(within(mine).queryByRole('columnheader', { name: 'Sales person' })).toBeNull()
    expect(salesRow(mine, 'SO-two')).toHaveTextContent('RM 500.00')
    expect(within(mine).queryByText('SO-one')).toBeNull()
  })

  it("adds Below deposit beside Personal and Overriding on a salesperson's page", () => {
    const data = fixture()
    data.input.orders = [sale('one'), sale('two', 2_000, { paidAmount: 0 })]
    renderBoard(data)
    choose('Anthony')
    const tabs = within(screen.getByRole('tablist', { name: 'Salesperson commission type' })).getAllByRole('tab')
    expect(tabs.map(t => t.textContent)).toEqual(['Personal 2', 'Overriding 0', 'Below deposit 1'])
    // The held bill stays in the personal ledger, where it earns nothing yet.
    expect(salesRow(personalTable(), 'SO-two')).toHaveTextContent('Deposit pending')
    fireEvent.click(tabs[2])
    const table = screen.getByRole('table', { name: 'Anthony orders below deposit' })
    expect(within(table).getAllByRole('row')).toHaveLength(3) // header, SO-two, subtotal
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 600.00')
    expect(screen.queryByText('Columns', { exact: true })).toBeNull()
    expect(screen.getByText(/Still to collect · 1 bill below deposit/).parentElement).toHaveTextContent('RM 600.00')
    choose('← Sales people')
    choose('Alex')
    fireEvent.click(screen.getByRole('tab', { name: /^Below deposit/ }))
    expect(screen.getByText('Every bill has met its deposit.')).toBeVisible()
  })

  it('shows Sales by venue as a tab in the same table, reading each fair rather than picking one', () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      venues={[
        { key: 'fair:f1', venueKey: 'ARENA', displayName: 'Arena', fairId: 'f1', event: '12–14 Aug', organizer: 'Fair Co', orders: 2, people: 1, total: 3_000, commissionable: 2_800 },
        { key: 'place:HALL', venueKey: 'HALL', displayName: 'Hall', fairId: null, event: null, organizer: null, orders: 1, people: 1, total: 500, commissionable: 500 },
      ]} />)
    const tab = screen.getByRole('tab', { name: /^Sales by venue/ })
    expect(tab).toHaveTextContent('2')
    fireEvent.click(tab)
    const table = screen.getByRole('table', { name: 'Sales by venue' })
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent))
      .toEqual(['Venue', 'Event', 'Organizer', 'Salespeople', 'Bills', 'Sales value'])
    const arena = salesRow(table, 'Arena')
    expect(arena).toHaveTextContent('12–14 Aug')
    expect(arena).toHaveTextContent('Fair Co')
    expect(arena).toHaveTextContent('RM 3,000.00RM 200.00 no commission')
    expect(within(arena).getByRole('link', { name: 'Arena' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders?venue=ARENA')
    expect(within(salesRow(table, 'Hall')).getAllByText('Not linked')).toHaveLength(2)
    // Nothing to pick here any more: the fair calendar locates every bill.
    expect(within(table).queryByRole('combobox')).toBeNull()
    expect(within(table).queryByText(/same place as/)).toBeNull()
    expect(salesRow(table, 'All venues')).toHaveTextContent('RM 3,500.00')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search venues' }), { target: { value: 'fair co' } })
    expect(within(table).queryByText('Hall')).toBeNull()
    expect(salesRow(table, 'Visible venues')).toHaveTextContent('RM 3,000.00')
  })

  it('opens on salesperson selection, then shows one personal row per order with a reconcilable total', () => {
    renderBoard()
    expect(screen.getByRole('tab', { name: /^Total Sales Orders/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('table', { name: 'Salesperson commission summary' })).toBeVisible()
    expect(screen.queryByRole('table', { name: 'Personal commission by sales order' })).toBeNull()
    expect(screen.getAllByText('RM 1,313.00').length).toBeGreaterThan(0)

    choose('Anthony')
    const table = personalTable()
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(salesRow(table, 'SO-one')).getByText('RM 432.33')).toBeVisible()
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 20.00+ RM 4.00 · 20% bonus')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Arena')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Home Fair')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Fair Co')
    expect(within(table).getByRole('columnheader', { name: 'Total commission' })).toBeVisible()
    expect(within(table).getByRole('link', { name: 'SO-one' })).toHaveAttribute('href',
      `/revenue/fair/2026-08-01/orders/one?from=${encodeURIComponent('/revenue/fair/2026-08-01?person=agent')}`)
    expect(screen.getAllByText('RM 1,223.00').length).toBeGreaterThan(0)
  })

  it('lets an upline with no personal orders inspect each downline order and overriding rate', () => {
    renderBoard()
    choose('Alex')
    expect(within(personalTable()).queryByRole('link', { name: 'SO-one' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^Overriding/ }))
    const table = screen.getByRole('table', { name: 'Overriding commission by downline order' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Anthony')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Revenue Specialist')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('5%')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 30.003% overriding')
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 60.003% overriding')
    expect(within(table).getByText('RM 90.00')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    expect(screen.getByRole('table', { name: 'Salesperson commission summary' })).toBeVisible()
  })

  // User 2026-09-27: the one thing adjusted in the portal is whether a bill
  // counts — so this button takes it out for real, as right-click does on
  // All bills, and it stays out whatever the ERP sends next.
  it("takes a bill out for real with Don't count, and puts it back with Undo", async () => {
    renderBoard()
    choose('Anthony')
    fireEvent.click(within(salesRow(personalTable(), 'SO-one')).getByRole('button', { name: 'Don’t count' }))
    await waitFor(() => expect(excludeOrder).toHaveBeenCalledWith('one', null))
    expect(refresh).toHaveBeenCalledOnce()
    // The same notice, and the same Undo, as the right-click menu's.
    const notice = await screen.findByText(/SO-one no longer counts in August 2026/)
    expect(notice).toHaveTextContent('and gave up its 1st Open Bill.')
    // Nothing lives on this screen alone any more: no draft, nothing to reset.
    expect(sessionStorage.getItem('commission-draft:fair:2026-08-01')).not.toContain('excluded')
    const undo = within(notice).getByRole('button', { name: 'Undo' })
    await waitFor(() => expect(undo).toBeEnabled())
    fireEvent.click(undo)
    await waitFor(() => expect(includeOrder).toHaveBeenCalledWith('one'))
    expect(await screen.findByText(/SO-one counts again, back as the 1st Open Bill/)).toBeVisible()
  })

  it('lists the bills taken out by hand on their seller\'s page, to count again', async () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      notCounted={[
        { orderId: 'gone', orderNo: 'SO-gone', orderDate: '2026-08-20', staffId: 'agent', orderTotal: 1_500 },
        { orderId: 'other', orderNo: 'SO-other', orderDate: '2026-08-21', staffId: 'leader', orderTotal: 900 },
      ]} />)
    choose('Anthony')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show not counted (1)' }))
    const table = screen.getByRole('table', { name: 'Anthony bills not counted' })
    const row = salesRow(table, 'SO-gone')
    expect(row).toHaveTextContent('Taken out by hand')
    expect(row).toHaveTextContent('RM 1,500.00')
    expect(within(table).queryByText('SO-other')).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Count again' }))
    await waitFor(() => expect(includeOrder).toHaveBeenCalledWith('gone'))
  })

  it('offers no Don\'t count on an upsale, and none while the month is in payroll', () => {
    const data = fixture()
    data.input.orders = [...data.input.orders, ...upsalesToOrders([{ id: 'up', staff_id: 'agent', amount: 300, sold_on: '2026-08-20', original_ref: 'HC5315' }], '2026-08-01')]
    renderBoard(data)
    choose('Anthony')
    expect(within(salesRow(personalTable(), 'UPSALE HC5315')).queryByRole('button', { name: 'Don’t count' })).toBeNull()
    expect(salesRow(personalTable(), 'UPSALE HC5315')).toHaveTextContent('Not a bill')
    cleanup()
    visit('')
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus="applied" savedTotals={[]} monthStats={monthStats}
      lockedPeriods={['2026-08-01']} />)
    choose('Anthony')
    expect(within(salesRow(personalTable(), 'SO-one')).getByRole('button', { name: 'Don’t count' })).toBeDisabled()
  })

  it('toggles optional columns without losing required order or total columns or changing the money', () => {
    renderBoard()
    choose('Anthony')
    fireEvent.click(screen.getByText('Columns', { exact: true }))
    fireEvent.click(screen.getByLabelText('Organizer', { exact: true }))
    expect(within(personalTable()).queryByRole('columnheader', { name: 'Organizer' })).toBeNull()
    fireEvent.click(screen.getByLabelText('Sales location', { exact: true }))
    expect(within(personalTable()).getByRole('columnheader', { name: 'Sales location' })).toBeVisible()
    expect(within(salesRow(personalTable(), 'SO-one')).getByText('KL')).toBeVisible()
    expect(within(personalTable()).getByRole('columnheader', { name: 'Sales order' })).toBeVisible()
    expect(within(personalTable()).getByRole('columnheader', { name: 'Total commission' })).toBeVisible()
    expect(screen.getAllByText('RM 1,223.00').length).toBeGreaterThan(0)
  })

  it('shows cross-agent KPI expense and lets a KPI name return to their commission table', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('tab', { name: /^KPI Items/ }))
    const table = screen.getByRole('table', { name: 'KPI expense by salesperson' })
    expect(salesRow(table, 'Anthony')).toHaveTextContent('RM 40.00+ RM 8.0020%RM 48.00')
    expect(screen.getByText('Total KPI expense', { selector: 'span' }).parentElement).toHaveTextContent('RM 48.00')
    fireEvent.click(within(table).getByRole('button', { name: 'Anthony ↗' }))
    expect(personalTable()).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Anthony' })).toBeVisible()
  })

  it('reallocates an Open Bill draft across orders, enforces unique day ranks, and saves the changed picks', async () => {
    renderBoard()
    openTab()
    let table = screen.getByRole('table', { name: 'Open Bill orders' })
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 25.00')
    expect(within(table).queryByText('SO-two')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all orders to add picks' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' }), { target: { value: '2' } })
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 20.00')
    fireEvent.click(screen.getByRole('checkbox', { name: /^Open Bill SO-two$/ }))
    expect(screen.getByRole('checkbox', { name: /^Open Bill SO-two$/ })).toBeChecked()
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 50.00')
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-two' }), { target: { value: '2' } })
    expect(screen.getByRole('checkbox', { name: /^Open Bill SO-one$/ })).not.toBeChecked()
    table = screen.getByRole('table', { name: 'Open Bill orders' })
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 40.00')
    expect(saveOpenPicks).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Open Bill picks' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(saveOpenPicks.mock.calls).toEqual([[[{ orderId: 'one', before: 1, after: null }, { orderId: 'two', before: null, after: 2 }]]])
    expect(screen.getByRole('status')).toHaveTextContent('Open Bill picks saved')
  })

  it('disables Open Bill edits on an applied run', () => {
    renderBoard(fixture(), 'applied')
    openTab()
    expect(screen.getByRole('checkbox', { name: /^Open Bill SO-one$/ })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' })).toBeDisabled()
    expect(screen.getByText(/This month is in payroll\. Take it back/)).toBeVisible()
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  it('keeps a failed Open Bill save visible with its draft and does not claim success', async () => {
    saveOpenPicks.mockRejectedValueOnce(new Error('Run was locked'))
    renderBoard()
    openTab()
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Open Bill picks' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Run was locked')
    expect(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' })).toHaveValue('2')
    expect(await screen.findByRole('button', { name: 'Save Open Bill picks' })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('sorts the full personal ledger by commission without changing the total', () => {
    renderBoard()
    choose('Anthony')
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort sales orders' }), { target: { value: 'commission_desc' } })
    const rows = within(personalTable()).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('SO-two')
    expect(personalTable()).toHaveTextContent('RM 1,223.00')
  })

  it('ignores an exclusion drafted on this screen before bills were taken out for real', () => {
    sessionStorage.setItem('commission-draft:fair:2026-08-01', JSON.stringify({ excluded: ['one'] }))
    renderBoard()
    choose('Anthony')
    expect(personalTable()).toHaveTextContent('SO-one')
    expect(personalTable()).toHaveTextContent('RM 1,223.00')
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  it('requires an explicit current-team preview when the historical month has no effective ranks', () => {
    const data = fixture()
    data.input = { ...data.input, hierarchy: [] }
    const original = JSON.stringify(data)
    renderBoard(data)
    fireEvent.click(screen.getByText('Review settings', { exact: true }))
    expect(screen.getByText(/No team ranks are effective in 2026-08/)).toBeVisible()
    const summary = screen.getByRole('table', { name: 'Salesperson commission summary' })
    // Without a rank the configured flat KPI / margin incentives still apply.
    expect(within(summary).getByRole('row', { name: /All salespeople · total commission/ })).toHaveTextContent('RM 1,048.00')
    expect(salesRow(summary, 'Anthony')).toHaveTextContent('0%')

    fireEvent.click(screen.getByText(/^Calculation setup/))
    const preview = screen.getByRole('checkbox', { name: 'Use current team & dated rules for preview' })
    expect(preview).not.toBeChecked()
    fireEvent.click(preview)
    expect(screen.getByRole('status')).toHaveTextContent('Current team preview')
    expect(screen.getByRole('status')).toHaveTextContent('Payroll is unchanged')
    expect(within(summary).getByRole('row', { name: /All salespeople · total commission/ })).toHaveTextContent('RM 1,313.00')
    expect(JSON.stringify(data)).toBe(original)
    expect(saveOpenPicks).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(preview).not.toBeChecked()
    expect(within(summary).getByRole('row', { name: /All salespeople · total commission/ })).toHaveTextContent('RM 1,048.00')
  })

  it('labels incentive switches as a draft, recalculates each feature, and restores source settings on reset', () => {
    const data = fixture()
    const original = JSON.stringify(data.input.scheme)
    renderBoard(data)
    fireEvent.click(screen.getByText(/^Calculation setup/))
    const summary = screen.getByRole('table', { name: 'Salesperson commission summary' })
    const total = () => within(summary).getByRole('row', { name: /All salespeople · total commission/ })

    fireEvent.click(screen.getByRole('checkbox', { name: 'KPI incentive' }))
    expect(total()).toHaveTextContent('RM 1,265.00')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open Bill incentive' }))
    expect(total()).toHaveTextContent('RM 1,240.00')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Margin incentive & penalty' }))
    expect(total()).toHaveTextContent('RM 240.00')
    expect(screen.getByRole('status')).toHaveTextContent('Draft incentive settings')
    expect(screen.getByRole('status')).toHaveTextContent('Payroll is unchanged')
    expect(JSON.stringify(data.input.scheme)).toBe(original)
    expect(saveOpenPicks).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(total()).toHaveTextContent('RM 1,313.00')
    expect(screen.getByRole('checkbox', { name: 'KPI incentive' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Open Bill incentive' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Margin incentive & penalty' })).toBeChecked()
  })

  it('shows the current salary calculation before a saved run', () => {
    renderBoard(salaryFixture())
    choose('Anthony')
    expect(screen.queryByRole('link', { name: /salary breakdown/i })).toBeNull()
    fireEvent.click(screen.getByText('Salary calculation · current preview'))
    const salary = screen.getByRole('table', { name: 'Current salary calculation' })
    expect(salesRow(salary, '^Current commission')).toHaveTextContent('RM 1,223.00')
    expect(salesRow(salary, '^Other programmes')).toHaveTextContent('RM 100.00')
    expect(salesRow(salary, '^Payroll adjustment')).toHaveTextContent('RM 20.00')
    expect(salesRow(salary, '^Employer contributions')).toHaveTextContent('72.00')
    expect(salesRow(salary, '^Statutory allowance')).toHaveTextContent('RM 100.00')
    expect(salesRow(salary, '^Other allowances')).toHaveTextContent('RM 30.00')
    expect(salesRow(salary, '^Overtime')).toHaveTextContent('RM 40.00')
    expect(salesRow(salary, '^Payroll deductions')).toHaveTextContent('11.00')
    expect(salesRow(salary, '^Gross pay')).toHaveTextContent('RM 1,430.00')
    expect(salesRow(salary, '^Employee contributions')).toHaveTextContent('56.00')
    expect(salesRow(salary, '^PCB tax')).toHaveTextContent('15.00')
    expect(salesRow(salary, '^SKBBK')).toHaveTextContent('4.00')
    expect(salesRow(salary, '^Estimated take-home pay')).toHaveTextContent('RM 1,355.00')

    expect(screen.getByText('Estimated take-home pay', { selector: 'span' }).parentElement).toHaveTextContent('RM 1,355.00')
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  // A run that was computed and never sent holds nothing in payroll — which is
  // how September looked like paid money when it was not (2026-09-27).
  it('says what payroll holds for a person only once the month is in it', () => {
    renderBoard(salaryFixture(), 'computed', [{ staffId: 'agent', total: 1223 }])
    choose('Anthony')
    expect(screen.getByText('Not in payroll yet')).toBeVisible()
    expect(screen.queryByRole('link', { name: /breakdown/i })).toBeNull()
    cleanup()
    visit('')

    renderBoard(salaryFixture(), 'applied', [{ staffId: 'agent', total: 1200 }])
    choose('Anthony')
    expect(screen.getByText('In payroll: RM 1,200.00 · Difference RM 23.00')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Payroll breakdown ↗' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/pay/agent')
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    choose('Alex')
    expect(screen.getByText('In payroll: RM 0.00 · Difference RM 90.00')).toBeVisible()
    expect(screen.queryByRole('link', { name: /breakdown/i })).toBeNull()
  })

  it('explains missing salary inputs without rendering a salary amount table', () => {
    renderBoard()
    choose('Anthony')
    fireEvent.click(screen.getByText('Salary calculation · current preview'))
    expect(screen.queryByRole('table', { name: 'Current salary calculation' })).toBeNull()
    expect(screen.getByText('Salary preview is unavailable for this session. Commission can still be reviewed above.')).toBeVisible()
  })

  it('allows Open Bill calculation preview while source rules are off but never saves those picks', () => {
    const data = fixture()
    data.input.scheme.enableOpenBill = false
    renderBoard(data)
    fireEvent.click(screen.getByText(/^Calculation setup/))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open Bill incentive' }))
    openTab()
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' }), { target: { value: '2' } })
    const save = screen.getByRole('button', { name: 'Save Open Bill picks' })
    expect(save).toBeDisabled()
    expect(screen.getByText('Open Bill is preview-only while switched off for this month. Switch it on under This month pays, in the payroll bar, before saving picks.')).toBeVisible()
    expect(salesRow(screen.getByRole('table', { name: 'Open Bill orders' }), 'SO-one')).toHaveTextContent('RM 20.00')
    fireEvent.click(save)
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  it('discards persisted Open Bill edits whose source changed, while preserving other draft settings', () => {
    sessionStorage.setItem('commission-draft:fair:2026-08-01', JSON.stringify({
      picks: [{ orderId: 'two', rank: 2 }], picksSource: JSON.stringify(['one:3']), excluded: ['two'], currentTeam: true,
    }))
    renderBoard()
    expect(screen.getByText(/Its Open Bill edits were discarded/)).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Monthly commission summary' })).getByRole('group', { name: 'Total commission' })).toHaveTextContent('Current team preview')
    expect(screen.queryByRole('button', { name: 'Save Open Bill picks' })).toBeNull()
    choose('Anthony')
    expect(within(personalTable()).getByRole('link', { name: 'SO-two' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' })).toHaveValue('1')
  })

  describe('the payroll bar (2026-09-27)', () => {
    const board = (data = fixture(), runStatus: string | null = null, savedTotals: { staffId: string; total: number }[] = [], payroll = PAYROLL) =>
      render(<CommissionWorkbench data={data} sub="fair" period="2026-08-01" runStatus={runStatus} savedTotals={savedTotals}
        monthStats={monthStats} payroll={{ ...payroll, switches: <div>This month pays switches</div> }} />)
    const bar = () => screen.getByRole('region', { name: 'Payroll · August 2026' })

    beforeEach(() => {
      sendToPayroll.mockResolvedValue({ runId: 'run-1', periodMonth: '2026-08-01', staffCount: 2, totalCommission: 1313, deferredCount: 0, releasedCount: 2 })
      takeBackFromPayroll.mockResolvedValue(undefined)
    })

    it('says the live figure is not in payroll until it is sent, and sends it', async () => {
      board()
      expect(bar()).toHaveTextContent('Not in payroll yet')
      expect(bar()).toHaveTextContent('worked out live from the ERP bills every time this page opens')
      expect(within(bar()).getByText('This month pays switches')).toBeVisible()
      fireEvent.click(within(bar()).getByRole('button', { name: 'Send RM 1,313.00 to payroll' }))
      await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
      expect(sendToPayroll).toHaveBeenCalledWith('2026-08-01', 'sub-fair')
      expect(within(bar()).getByRole('status')).toHaveTextContent('RM 1,313.00 is in the August 2026 payroll · 2 people.')
    })

    it('names what stops a send, by name, and will not send until it is settled', () => {
      const data = fixture()
      const newbie = '6c1f5d0e-3b1a-4c2d-9e8f-1a2b3c4d5e6f'
      data.input.orders = [...data.input.orders, sale('three', 500, { staffId: newbie })]
      data.people = [...data.people, { staffId: newbie, name: 'NEWBIE', employeeCode: 'HV050' }]
      data.unmatchedOrderNos = ['HC-SO-2608-001']
      board(data)
      const list = within(bar()).getByRole('list', { name: 'To settle before payroll' })
      expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual([
        '1 order(s) carry an agent who is not a salesperson in the portal and were excluded. Match them in the import wizard.',
        'Staff NEWBIE has sales this period but no rank / hierarchy row — commission computed at 0%.',
      ])
      expect(bar()).toHaveTextContent('2 things have to be settled first')
      expect(within(bar()).getByRole('button', { name: 'Send to payroll' })).toBeDisabled()
    })

    // KRIS and PETER in September: their own bills, no rank by rule — not a gap.
    it('lists a department head at no commission and does not hold the send for them', () => {
      const data = fixture()
      data.input.orders = [...data.input.orders, sale('kris-1', 2_980, { staffId: 'kris' })]
      data.input.departmentHeadIds = ['kris']
      data.people = [...data.people, { staffId: 'kris', name: 'KRIS', employeeCode: 'HV006' }]
      board(data)
      const row = within(screen.getByRole('table', { name: 'Salesperson commission summary' })).getByRole('row', { name: /KRIS/ })
      expect(row).toHaveTextContent('Department headOwn bills earn no commission')
      expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('RM 0.00')
      expect(within(bar()).queryByRole('list', { name: 'To settle before payroll' })).toBeNull()
      expect(within(bar()).getByRole('button', { name: 'Send RM 1,313.00 to payroll' })).toBeEnabled()
    })

    it('sends the month as saved, never what is only drafted on this screen', () => {
      board()
      fireEvent.click(screen.getByText(/^Calculation setup/))
      fireEvent.click(screen.getByRole('checkbox', { name: 'KPI incentive' }))
      expect(within(screen.getByRole('region', { name: 'Monthly commission summary' })).getByRole('group', { name: 'Total commission' }))
        .toHaveTextContent('RM 1,265.00')
      expect(within(bar()).getByRole('button', { name: 'Send RM 1,313.00 to payroll' })).toBeEnabled()
      expect(bar()).toHaveTextContent('This screen holds a draft')
    })

    it('says a month in payroll has moved since, and updates it in one click', async () => {
      board(fixture(), 'applied', [{ staffId: 'agent', total: 1_223 }, { staffId: 'leader', total: 80 }], { ...PAYROLL, runId: 'run-1', sentAt: '2026-09-15T02:30:00Z' })
      expect(bar()).toHaveTextContent('In payroll · RM 1,303.00')
      // Malaysia time, whatever the machine's zone.
      expect(bar()).toHaveTextContent(/Sent 15 Sept? 2026, 10:30/)
      expect(bar()).toHaveTextContent('RM 1,313.00, RM 10.00 more · 1 person changed')
      fireEvent.click(within(bar()).getByRole('button', { name: 'Update payroll to RM 1,313.00' }))
      await waitFor(() => expect(sendToPayroll).toHaveBeenCalledWith('2026-08-01', 'sub-fair'))
    })

    it('takes a month back out of payroll only after asking', async () => {
      board(fixture(), 'applied', [{ staffId: 'agent', total: 1_223 }, { staffId: 'leader', total: 90 }], { ...PAYROLL, runId: 'run-1', sentAt: null })
      expect(bar()).toHaveTextContent('The commission above matches it')
      expect(within(bar()).queryByRole('button', { name: /Update payroll/ })).toBeNull()
      fireEvent.click(within(bar()).getByRole('button', { name: 'Take back' }))
      expect(takeBackFromPayroll).not.toHaveBeenCalled()
      expect(bar()).toHaveTextContent('Take this page\'s commission back out of the August 2026 payroll?')
      fireEvent.click(within(bar()).getAllByRole('button', { name: 'Take back' })[0])
      await waitFor(() => expect(takeBackFromPayroll).toHaveBeenCalledWith('run-1'))
    })
  })

  it('blocks an open draft if refreshed source picks changed until the draft is reset', () => {
    const data = fixture()
    const { rerender } = renderBoard(data)
    openTab()
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' }), { target: { value: '2' } })
    const fresh = { ...data, input: { ...data.input, openBillTags: [{ orderId: 'two', rank: 3 as const }] } }
    rerender(<CommissionWorkbench data={fresh} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Saved Open Bill picks changed while this draft was open')
    expect(screen.getByRole('button', { name: 'Save Open Bill picks' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(screen.queryByRole('button', { name: 'Save Open Bill picks' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Open Bill rank SO-two' })).toHaveValue('3')
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })
})

describe('CommissionWorkbench — where it stands is the URL (user 2026-09-27)', () => {
  // "I clicked into Anthony, then his order, pressed Back and it went straight
  // to the home page." Opening a bill unmounts the month; Back mounts it again
  // on the URL it left — so that URL has to say whose ledger it was.
  it('comes back from a bill to the ledger and the table it was opened from', () => {
    const { unmount } = renderBoard()
    choose('Alex')
    fireEvent.click(screen.getByRole('tab', { name: /^Overriding/ }))
    expect(window.location.search).toBe('?person=leader&orders=overriding')
    const table = screen.getByRole('table', { name: 'Overriding commission by downline order' })
    expect(within(table).getByRole('link', { name: 'SO-one' })).toHaveAttribute('href',
      `/revenue/fair/2026-08-01/orders/one?from=${encodeURIComponent('/revenue/fair/2026-08-01?person=leader&orders=overriding')}`)

    unmount() // the bill's page
    renderBoard() // Back
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeVisible()
    expect(screen.getByRole('tab', { name: /^Overriding/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('table', { name: 'Overriding commission by downline order' })).toBeVisible()
    expect(screen.queryByRole('table', { name: 'Salesperson commission summary' })).toBeNull()
  })

  it('makes every table a step of its own, so Back walks out the way it came in', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('tab', { name: /^KPI Items/ }))
    fireEvent.click(within(screen.getByRole('table', { name: 'KPI expense by salesperson' })).getByRole('button', { name: 'Anthony ↗' }))
    fireEvent.click(screen.getByRole('tab', { name: /^Below deposit/ }))
    expect(vi.mocked(window.history.pushState).mock.calls.map(call => call[2]))
      .toEqual(['?view=kpi', '?person=agent', '?person=agent&orders=deposit'])

    visit('?person=agent')
    expect(screen.getByRole('tab', { name: /^Personal/ })).toHaveAttribute('aria-selected', 'true')
    visit('?view=kpi')
    expect(screen.getByRole('table', { name: 'KPI expense by salesperson' })).toBeVisible()
    visit('')
    expect(screen.getByRole('table', { name: 'Salesperson commission summary' })).toBeVisible()
  })

  it('keeps the search, brand and order in the entry they were set on, without adding entries', () => {
    const { unmount } = renderBoard()
    choose('Anthony')
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort sales orders' }), { target: { value: 'commission_desc' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Search sales orders' }), { target: { value: 'SO-t' } })
    expect(window.location.search).toBe('?person=agent&q=SO-t&sort=commission_desc')
    expect(window.history.pushState).toHaveBeenCalledTimes(1) // Anthony, and only Anthony

    unmount()
    renderBoard()
    expect(screen.getByRole('combobox', { name: 'Sort sales orders' })).toHaveValue('commission_desc')
    expect(screen.getByRole('textbox', { name: 'Search sales orders' })).toHaveValue('SO-t')
    expect(within(personalTable()).queryByRole('link', { name: 'SO-one' })).toBeNull()
    expect(within(personalTable()).getByRole('link', { name: 'SO-two' })).toBeVisible()
  })

  it('starts a salesperson opened from the list on a clean search, and the list keeps its own', () => {
    renderBoard()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search salesperson' }), { target: { value: 'Anth' } })
    choose('Anthony')
    expect(window.location.search).toBe('?person=agent')
    expect(screen.getByRole('textbox', { name: 'Search sales orders' })).toHaveValue('')
    visit('?q=Anth') // Back to the list
    expect(screen.getByRole('textbox', { name: 'Search salesperson' })).toHaveValue('Anth')
    expect(screen.queryByRole('button', { name: /^Alex$/ })).toBeNull()
  })

  it('leaves the keys it does not own alone', () => {
    visit('?tab=upsales')
    renderBoard()
    choose('Anthony')
    expect(window.location.search).toBe('?tab=upsales&person=agent')
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    expect(window.location.search).toBe('?tab=upsales')
  })

  it('opens the list for a salesperson the month does not have', () => {
    visit('?person=nobody')
    renderBoard()
    expect(screen.getByRole('table', { name: 'Salesperson commission summary' })).toBeVisible()
  })

  it('keeps the columns chosen for the month when the ledger is opened again', () => {
    const { unmount } = renderBoard()
    choose('Anthony')
    fireEvent.click(screen.getByText('Columns', { exact: true }))
    fireEvent.click(screen.getByLabelText('Organizer', { exact: true }))
    expect(within(personalTable()).queryByRole('columnheader', { name: 'Organizer' })).toBeNull()
    unmount()
    renderBoard()
    expect(within(personalTable()).queryByRole('columnheader', { name: 'Organizer' })).toBeNull()
    expect(within(personalTable()).getByRole('columnheader', { name: 'Venue' })).toBeVisible()
  })
})

describe("CommissionWorkbench — a ledger's bill menu (user 2026-09-27)", () => {
  // "I want the right-click, the same as on All bills: right-click the order,
  // choose that it does not count, and it is out of the commission."
  it("right-clicks a salesperson's bill for All bills' menu and takes it out of the month", async () => {
    renderBoard(fixture(), 'computed')
    choose('Anthony')
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-one')).getByText('Arena'), { clientX: 400, clientY: 260 })
    const menu = screen.getByRole('menu', { name: 'Actions for SO-one' })
    expect(menu).toHaveTextContent('SO-one · Anthony')
    expect(within(menu).getByRole('menuitem', { name: 'Open bill' })).toBeVisible()

    fireEvent.click(within(menu).getByRole('menuitem', { name: /Don't count this bill/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Don't count this bill" }))
    await waitFor(() => expect(excludeOrder).toHaveBeenCalledWith('one', ''))
    expect(refresh).toHaveBeenCalled()
    const notice = await screen.findByText(/SO-one no longer counts in August 2026 and gave up its 1st Open Bill\./)
    expect(notice).toHaveTextContent('Payroll follows when the month is sent.')
    expect(screen.queryByRole('menu')).toBeNull()
    // Nothing is drafted on the screen: the bill is out for real, and only there.
    expect(sessionStorage.getItem('commission-draft:fair:2026-08-01')).not.toContain('excluded')

    fireEvent.click(within(notice).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(includeOrder).toHaveBeenCalledWith('one'))
    expect(await screen.findByText(/SO-one counts again, back as the 1st Open Bill\./)).toBeInTheDocument()
  })

  it('opens the same menu from the ⋯ beside the order number, and from a downline bill', () => {
    renderBoard()
    choose('Alex')
    fireEvent.click(screen.getByRole('tab', { name: /^Overriding/ }))
    const table = screen.getByRole('table', { name: 'Overriding commission by downline order' })
    const more = within(salesRow(table, 'SO-two')).getByRole('button', { name: 'Actions for SO-two' })
    fireEvent.click(more)
    // Whose bill it is: the downline who wrote it, not the upline reading it.
    expect(screen.getByRole('menu', { name: 'Actions for SO-two' })).toHaveTextContent('SO-two · Anthony')
    expect(more).toHaveAttribute('aria-expanded', 'true')
  })

  it("will not take a bill out of a month whose run has paid, and says whose run", () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus="applied" savedTotals={[]}
      monthStats={monthStats} lockedPeriods={['2026-08-01']} />)
    choose('Anthony')
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-one')).getByText('Arena'), { clientX: 400, clientY: 260 })
    const item = within(screen.getByRole('menu', { name: 'Actions for SO-one' })).getByRole('menuitem', { name: /Don't count this bill/ })
    expect(item).toBeDisabled()
    expect(item).toHaveTextContent('The run for August 2026 has paid')
  })

  it('offers no menu on an upsale or a drop — they are not bills', () => {
    const data = fixture()
    data.input.orders = [...data.input.orders, ...upsalesToOrders([
      { id: 'up', staff_id: 'agent', amount: 300, sold_on: '2026-08-20', original_ref: 'HC5315' },
    ], '2026-08-01')]
    renderBoard(data)
    choose('Anthony')
    const upsale = salesRow(personalTable(), 'UPSALE HC5315')
    expect(within(upsale).queryByRole('button', { name: /^Actions for/ })).toBeNull()
    expect(fireEvent.contextMenu(within(upsale).getByText('UPSALE HC5315'), { clientX: 10, clientY: 10 })).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('puts the menu on the month’s Below deposit list too', () => {
    const data = fixture()
    data.input.orders = [sale('one'), sale('two', 2_000, { paidAmount: 100 })]
    renderBoard(data)
    fireEvent.click(screen.getByRole('tab', { name: /^Below deposit/ }))
    const row = salesRow(screen.getByRole('table', { name: 'Orders below deposit' }), 'SO-two')
    fireEvent.contextMenu(within(row).getAllByRole('cell')[4], { clientX: 300, clientY: 300 })
    expect(screen.getByRole('menu', { name: 'Actions for SO-two' })).toHaveTextContent('SO-two · Anthony')
  })
})
