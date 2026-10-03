import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { EngineInput, Rank, SalesOrder } from '@/lib/commission/types'
import { buildPayRow } from '@/lib/revenue-pay'
import { upsalesToOrders } from '@/lib/commission/upsales'
import { splitOrdersByShares } from '@/lib/commission/shares'
import { parseCloseSummary } from '@/lib/commission/closes'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import CommissionWorkbench, { type PayrollBarFacts } from './CommissionWorkbench'

// The salary preview's pay-line editor saves through a server action (its own tests are SalaryCalculation.test).
vi.mock('../../../pay-line-actions', () => ({ savePayLines: vi.fn() }))

const { saveOpenPicks, refresh, push, excludeOrder, includeOrder, setOrderBrand, shareOrder, unshareOrder, url } = vi.hoisted(() => {
  // Next re-renders `useSearchParams` from the browser's own pushState and
  // replaceState; the stand-in does the same through this subscription.
  const listeners = new Set<() => void>()
  return {
    saveOpenPicks: vi.fn(), refresh: vi.fn(), push: vi.fn(), excludeOrder: vi.fn(), includeOrder: vi.fn(),
    setOrderBrand: vi.fn(), shareOrder: vi.fn(), unshareOrder: vi.fn(),
    url: {
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
      changed() { for (const listener of listeners) listener() },
    },
  }
})
vi.mock('../../../run-actions', () => ({ saveOpenBillPicks: saveOpenPicks, excludeOrder, includeOrder, setOrderBrand, shareOrder, unshareOrder }))
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

// Every bill carries a KPI pillow at RM 20 (2026-09-27): its RM 20 comes off the
// bill's sales and is paid flat as KPI, so a 1,000 bill earns its rate on 980.
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
      // The handwritten bill's number beside the ERP's (2026-10-03); 'two' was keyed with none.
      { orderId: 'one', venue: 'Arena', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL', fair: null, booth: null, refNo: 'HC13369', paperNo: 'HC13369' },
      { orderId: 'two', venue: 'Convention Centre', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL', fair: null, booth: null, refNo: null, paperNo: null },
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
  monthLabel: 'August 2026', sentAt: null, settledBefore: null, payrollClosed: null,
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
    expect(card('Total commission')).toHaveTextContent('RM 1,309.30')
    expect(within(card('Lines without a cost')).getByText('0')).toBeVisible()
    expect(within(summary()).getByText('Unmatched agents')).toHaveTextContent('Unmatched agents 0')
    expect(screen.queryByRole('heading', { name: 'Salespeople' })).toBeNull()
    expect(screen.queryByText('Personal sales and downline overriding, together in one view.')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search salesperson' }), { target: { value: 'Anthony' } })
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull()
    expect(within(card('Salespeople')).getByText('2')).toBeVisible()
    expect(card('Total commission')).toHaveTextContent('RM 1,309.30')

    // A draft — an Open Bill pick not yet saved — moves the commission and
    // nothing the ERP sent: SO-one's bonus drops from 50% to 40% of its 49.00.
    openTab()
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' }), { target: { value: '2' } })
    expect(card('Total commission')).toHaveTextContent('RM 1,304.40')
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
    expect(anthony[5]).toHaveTextContent('RM 2,960.00')
    // Alex sold nothing himself; his group is his downline's sales.
    const alex = within(within(summary).getByRole('row', { name: /Alex/ })).getAllByRole('cell')
    expect(alex[3]).toHaveTextContent('RM 0.00')
    expect(alex[5]).toHaveTextContent('RM 2,960.00')
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
    // SO-two was keyed into the ERP with no Ref No. (2026-10-03).
    expect(cells[1]).toHaveTextContent('No Ref No. in the ERP')
    expect(cells[2]).toHaveTextContent('Anthony')
    expect(cells[5]).toHaveTextContent('RM 2,000.00')
    expect(cells[7]).toHaveTextContent('RM 100.005% of the bill')
    expect(cells[8]).toHaveTextContent('RM 600.0030% of the bill')
    expect(cells[9]).toHaveTextContent('RM 500.00')
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

  // Sales by venue became Sales exhibition (user 2026-10-03): one venue,
  // organiser and days with two brands is two exhibitions, each its own row.
  it('shows Sales exhibition as a tab in the same table — one row per brand at each fair', () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      exhibitions={[
        { key: 'fair:f1|AKEMI', brand: 'AKEMI', venueKey: 'ARENA', displayName: 'Arena', fairId: 'f1', event: '12–14 Aug', organizer: 'Fair Co', orders: 2, people: 1, total: 3_000, commissionable: 2_800 },
        { key: 'fair:f1|DUNLOP', brand: 'DUNLOP', venueKey: 'ARENA', displayName: 'Arena', fairId: 'f1', event: '12–14 Aug', organizer: 'Fair Co', orders: 1, people: 1, total: 800, commissionable: 800 },
        { key: 'place:HALL|', brand: null, venueKey: 'HALL', displayName: 'Hall', fairId: null, event: null, organizer: null, orders: 1, people: 1, total: 500, commissionable: 500 },
      ]} />)
    expect(screen.queryByRole('tab', { name: /Sales by venue/ })).toBeNull()
    const tab = screen.getByRole('tab', { name: /^Sales exhibition/ })
    expect(tab).toHaveTextContent('3')
    fireEvent.click(tab)
    expect(window.location.search).toBe('?view=exhibition')
    const table = screen.getByRole('table', { name: 'Sales exhibition' })
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent))
      .toEqual(['Brand', 'Venue', 'Event', 'Organizer', 'Salespeople', 'Bills', 'Sales value'])
    const akemi = salesRow(table, 'AKEMI')
    expect(akemi).toHaveTextContent('Arena')
    expect(akemi).toHaveTextContent('12–14 Aug')
    expect(akemi).toHaveTextContent('Fair Co')
    expect(akemi).toHaveTextContent('RM 3,000.00RM 200.00 no commission')
    // The venue opens exactly that exhibition's bills: this fair, this brand.
    expect(within(akemi).getByRole('link', { name: 'Arena' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders?fair=f1&brand=AKEMI')
    expect(within(salesRow(table, 'DUNLOP')).getByRole('link', { name: 'Arena' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders?fair=f1&brand=DUNLOP')
    const hall = salesRow(table, 'Hall')
    expect(hall).toHaveTextContent('No brand')
    expect(within(hall).getAllByText('Not linked')).toHaveLength(2)
    expect(within(hall).getByRole('link', { name: 'Hall' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders?venue=HALL&fair=none&brand=none')
    // Nothing to pick here: the ERP names every bill's fair.
    expect(within(table).queryByRole('combobox')).toBeNull()
    expect(salesRow(table, 'All exhibitions')).toHaveTextContent('3 exhibitions')
    expect(salesRow(table, 'All exhibitions')).toHaveTextContent('RM 4,300.00')

    // One brand's exhibitions at a time, from the brands on the tab (no brand last).
    const brands = screen.getByRole('combobox', { name: 'Filter exhibitions by brand' })
    expect(within(brands).getAllByRole('option').map(o => o.textContent)).toEqual(['All brands', 'AKEMI', 'DUNLOP', 'No brand'])
    fireEvent.change(brands, { target: { value: 'DUNLOP' } })
    expect(window.location.search).toBe('?view=exhibition&brand=DUNLOP')
    expect(within(table).queryByText('AKEMI')).toBeNull()
    expect(salesRow(table, 'Visible exhibitions')).toHaveTextContent('RM 800.00')
    fireEvent.change(brands, { target: { value: 'none' } })
    expect(salesRow(table, 'Visible exhibitions')).toHaveTextContent('RM 500.00')
    fireEvent.change(brands, { target: { value: '' } })

    // The search reads the brand as well as the venue and organiser.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search exhibitions' }), { target: { value: 'akemi' } })
    expect(within(table).queryByText('Hall')).toBeNull()
    expect(within(table).queryByText('DUNLOP')).toBeNull()
    expect(salesRow(table, 'Visible exhibitions')).toHaveTextContent('RM 3,000.00')
  })

  it('opens Sales exhibition from a link to the old Sales by venue', () => {
    visit('?view=venue')
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats} exhibitions={[]} />)
    expect(screen.getByRole('tab', { name: /^Sales exhibition/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('No bills this month.')).toBeVisible()
  })

  // The two panels that sat above the month's cards became the rail's last
  // two tabs (user 2026-09-30: 把这两个 move 去 … 让它们形成两个 tab).
  it('carries the month’s review panels as the last two tabs, counting what waits in each', () => {
    const reviews = {
      changes: { panel: <section aria-label="Drops and upsells the ERP found">HC13254 upsell</section>, count: 2 },
      claims: { panel: <section aria-label="Possible double claims">HC11357 — already claimed</section>, count: 8 },
    }
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      monthOverview={<h1>August 2026</h1>} reviews={reviews} />)
    const tabs = within(screen.getByRole('tablist', { name: 'Commission views' })).getAllByRole('tab')
    expect(tabs.slice(-2).map(t => t.textContent)).toEqual(['Drops & upsells2', 'Double claims8'])
    // Not stacked above the cards any more: only in their tabs.
    expect(screen.queryByRole('region', { name: 'Possible double claims' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Drops and upsells the ERP found' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /^Double claims/ }))
    expect(window.location.search).toBe('?view=claims')
    expect(screen.getByRole('tab', { name: /^Double claims/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Possible double claims' })).toHaveTextContent('HC11357 — already claimed')
    expect(screen.queryByRole('table', { name: 'Salesperson commission summary' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /^Drops & upsells/ }))
    expect(window.location.search).toBe('?view=changes')
    expect(screen.getByRole('region', { name: 'Drops and upsells the ERP found' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Possible double claims' })).toBeNull()
  })

  it('opens straight on Double claims from a link, and on the first view when the page has no such panel', () => {
    visit('?view=claims')
    const { unmount } = render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      reviews={{ claims: { panel: <section aria-label="Possible double claims">nothing to check</section>, count: 0 } }} />)
    expect(screen.getByRole('tab', { name: /^Double claims/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /^Drops & upsells/ })).toBeNull()
    unmount()

    renderBoard()
    expect(screen.queryByRole('tab', { name: /^Double claims/ })).toBeNull()
    expect(screen.getByRole('tab', { name: /^Total Sales Orders/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens on salesperson selection, then shows one personal row per order with a reconcilable total', () => {
    renderBoard()
    expect(screen.getByRole('tab', { name: /^Total Sales Orders/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('table', { name: 'Salesperson commission summary' })).toBeVisible()
    expect(screen.queryByRole('table', { name: 'Personal commission by sales order' })).toBeNull()
    expect(screen.getAllByText('RM 1,309.30').length).toBeGreaterThan(0)

    choose('Anthony')
    const table = personalTable()
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(salesRow(table, 'SO-one')).getByText('RM 428.58')).toBeVisible()
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 20.00+ RM 4.00 · 20% bonus')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Arena')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Home Fair')
    expect(salesRow(table, 'SO-one')).toHaveTextContent('Fair Co')
    expect(within(table).getByRole('columnheader', { name: 'Total commission' })).toBeVisible()
    expect(within(table).getByRole('link', { name: 'SO-one' })).toHaveAttribute('href',
      `/revenue/fair/2026-08-01/orders/one?from=${encodeURIComponent('/revenue/fair/2026-08-01?person=agent')}`)
    expect(screen.getAllByText('RM 1,220.50').length).toBeGreaterThan(0)
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
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 29.403% overriding')
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 59.403% overriding')
    expect(within(table).getByText('RM 88.80')).toBeVisible()
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

  // User 2026-10-03: follow erp sales order number, but with reference
  // hc123123 (which is paper sales order number).
  it('shows each bill’s Ref No. — the handwritten bill’s number — beside the ERP’s, and finds a bill by it', () => {
    renderBoard()
    choose('Anthony')
    const table = personalTable()
    expect(within(table).getAllByRole('columnheader').slice(0, 2).map(h => h.textContent)).toEqual(['Sales order', 'Ref No.'])
    expect(within(salesRow(table, 'SO-one')).getAllByRole('cell')[1]).toHaveTextContent('HC13369')
    // Keyed with no Ref No.: the double-claim check cannot match it, and the row says so.
    expect(within(salesRow(table, 'SO-two')).getAllByRole('cell')[1]).toHaveTextContent('—No Ref No. in the ERP')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search sales orders' }), { target: { value: 'hc133' } })
    expect(within(table).getByRole('link', { name: 'SO-one' })).toBeVisible()
    expect(within(table).queryByRole('link', { name: 'SO-two' })).toBeNull()
  })

  it('names no paper for an upsale, which is no bill', () => {
    const data = fixture()
    data.input.orders = [...data.input.orders, ...upsalesToOrders([{ id: 'up', staff_id: 'agent', amount: 300, sold_on: '2026-08-20', original_ref: 'HC5315' }], '2026-08-01')]
    renderBoard(data)
    choose('Anthony')
    const cell = within(salesRow(personalTable(), 'UPSALE HC5315')).getAllByRole('cell')[1]
    expect(cell).toHaveTextContent('—')
    expect(cell).not.toHaveTextContent('No Ref No.')
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
    expect(screen.getAllByText('RM 1,220.50').length).toBeGreaterThan(0)
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
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 24.50')
    expect(within(table).queryByText('SO-two')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all orders to add picks' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' }), { target: { value: '2' } })
    expect(salesRow(table, 'SO-one')).toHaveTextContent('RM 19.60')
    fireEvent.click(screen.getByRole('checkbox', { name: /^Open Bill SO-two$/ }))
    expect(screen.getByRole('checkbox', { name: /^Open Bill SO-two$/ })).toBeChecked()
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 49.50')
    fireEvent.change(screen.getByRole('combobox', { name: 'Open Bill rank SO-two' }), { target: { value: '2' } })
    expect(screen.getByRole('checkbox', { name: /^Open Bill SO-one$/ })).not.toBeChecked()
    table = screen.getByRole('table', { name: 'Open Bill orders' })
    expect(salesRow(table, 'SO-two')).toHaveTextContent('RM 39.60')
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
    expect(screen.getByText('This month is in payroll, so its Open Bill picks cannot change.')).toBeVisible()
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
    expect(personalTable()).toHaveTextContent('RM 1,220.50')
  })

  it('ignores an exclusion drafted on this screen before bills were taken out for real', () => {
    sessionStorage.setItem('commission-draft:fair:2026-08-01', JSON.stringify({ excluded: ['one'] }))
    renderBoard()
    choose('Anthony')
    expect(personalTable()).toHaveTextContent('SO-one')
    expect(personalTable()).toHaveTextContent('RM 1,220.50')
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

    const preview = screen.getByRole('checkbox', { name: 'Use current team & dated rules for preview' })
    expect(preview).not.toBeChecked()
    fireEvent.click(preview)
    expect(screen.getByRole('status')).toHaveTextContent('Current team preview')
    expect(screen.getByRole('status')).toHaveTextContent('Payroll is unchanged')
    expect(within(summary).getByRole('row', { name: /All salespeople · total commission/ })).toHaveTextContent('RM 1,309.30')
    expect(JSON.stringify(data)).toBe(original)
    expect(saveOpenPicks).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(preview).not.toBeChecked()
    expect(within(summary).getByRole('row', { name: /All salespeople · total commission/ })).toHaveTextContent('RM 1,048.00')
  })

  // User 2026-09-28 (保留一个就好): the payroll bar's *This month pays* and
  // Review settings' *Calculation setup* were the same three switches — one
  // saved, the other a preview that saved nothing. One set is left, the real
  // one, and it lives in Review settings.
  it('holds what the month pays in Review settings — the one set of switches on the page', () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      payroll={PAYROLL} switches={<div>This month pays switches</div>} />)
    expect(within(screen.getByRole('region', { name: 'Payroll · August 2026' })).queryByText('This month pays switches')).toBeNull()
    const switches = screen.getByText('This month pays switches')
    expect(switches).not.toBeVisible()
    fireEvent.click(screen.getByText('Review settings', { exact: true }))
    expect(switches).toBeVisible()
    for (const name of ['KPI incentive', 'Open Bill incentive', 'Margin incentive & penalty']) {
      expect(screen.queryByRole('checkbox', { name })).toBeNull()
    }
    expect(screen.queryByText(/Calculation setup/)).toBeNull()
    // The current team stays a preview: nothing to save, so nothing to switch twice.
    expect(screen.getByRole('checkbox', { name: 'Use current team & dated rules for preview' })).not.toBeChecked()
  })

  // What the user met on 2026-09-28: toggling those preview checkboxes left a
  // draft in the tab's session — even one equal to the month's own switches —
  // so the month read "Draft calculation" and Close all 30 stayed disabled.
  it('ignores the incentive preview an older draft kept, so the month is live again', () => {
    sessionStorage.setItem('commission-draft:fair:2026-08-01', JSON.stringify({
      picks: null, picksSource: null, currentTeam: false, previewFeatures: { kpi: false, openBill: false, margin: false },
    }))
    renderBoard()
    const card = within(screen.getByRole('region', { name: 'Monthly commission summary' })).getByRole('group', { name: 'Total commission' })
    expect(card).toHaveTextContent('RM 1,309.30')
    expect(card).toHaveTextContent('Live calculation')
    expect(screen.queryByText('Draft', { exact: true })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset draft' })).toBeNull()
  })

  it('shows the current salary calculation before a saved run', () => {
    renderBoard(salaryFixture())
    choose('Anthony')
    expect(screen.queryByRole('link', { name: /salary breakdown/i })).toBeNull()
    fireEvent.click(screen.getByText('Salary calculation · current preview'))
    const salary = screen.getByRole('table', { name: 'Current salary calculation' })
    expect(salesRow(salary, '^Current commission')).toHaveTextContent('RM 1,220.50')
    expect(salesRow(salary, '^Other programmes')).toHaveTextContent('RM 100.00')
    expect(salesRow(salary, '^Payroll adjustment')).toHaveTextContent('RM 20.00')
    expect(salesRow(salary, '^Employer contributions')).toHaveTextContent('72.00')
    expect(salesRow(salary, '^Statutory allowance')).toHaveTextContent('RM 100.00')
    expect(salesRow(salary, '^Other allowances')).toHaveTextContent('RM 30.00')
    expect(salesRow(salary, '^Overtime')).toHaveTextContent('RM 40.00')
    expect(salesRow(salary, '^Payroll deductions')).toHaveTextContent('11.00')
    expect(salesRow(salary, '^Gross pay')).toHaveTextContent('RM 1,427.50')
    expect(salesRow(salary, '^Employee contributions')).toHaveTextContent('56.00')
    expect(salesRow(salary, '^PCB tax')).toHaveTextContent('15.00')
    expect(salesRow(salary, '^SKBBK')).toHaveTextContent('4.00')
    expect(salesRow(salary, '^Estimated take-home pay')).toHaveTextContent('RM 1,352.50')

    expect(screen.getByText('Estimated take-home pay', { selector: 'span' }).parentElement).toHaveTextContent('RM 1,352.50')
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  // The unified Payroll (2026-09-27): the month is open, but a salesperson who
  // is closed (Completed) or already with Finance cannot take new pay lines —
  // the pencil says why and where to go before anything is typed.
  it('locks one person’s pay lines once their payroll moved on from draft', () => {
    const data = salaryFixture()
    data.payRows = data.payRows.map(p => ({ ...p, payrollExists: true, payrollStatus: 'completed' }))
    renderBoard(data)
    choose('Anthony')
    const pencil = screen.getByRole('button', { name: 'Edit Anthony’s pay lines' })
    expect(pencil).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(pencil)
    expect(screen.queryByRole('group', { name: /Pay lines/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Anthony is closed for the month. Reopen their close first')
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
    expect(screen.getByText('In payroll: RM 1,200.00 · Difference RM 20.50')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Payroll breakdown ↗' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/pay/agent')
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    choose('Alex')
    expect(screen.getByText('In payroll: RM 0.00 · Difference RM 88.80')).toBeVisible()
    expect(screen.queryByRole('link', { name: /breakdown/i })).toBeNull()
  })

  it('explains missing salary inputs without rendering a salary amount table', () => {
    renderBoard()
    choose('Anthony')
    fireEvent.click(screen.getByText('Salary calculation · current preview'))
    expect(screen.queryByRole('table', { name: 'Current salary calculation' })).toBeNull()
    expect(screen.getByText('Salary preview is unavailable for this session. Commission can still be reviewed above.')).toBeVisible()
  })

  it('keeps the Open Bill picks shut while the month pays no Open Bill, and says where it is switched on', () => {
    const data = fixture()
    data.input.scheme.enableOpenBill = false
    renderBoard(data)
    openTab()
    expect(screen.getByText(/^Open Bill payout is switched off for this month/))
      .toHaveTextContent('picks open once it is switched on under Review settings › This month pays')
    expect(screen.getByRole('checkbox', { name: 'Open Bill SO-one' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' })).toBeDisabled()
    expect(salesRow(screen.getByRole('table', { name: 'Open Bill orders' }), 'SO-one')).toHaveTextContent('RM 0.00')
    expect(screen.queryByRole('button', { name: 'Save Open Bill picks' })).toBeNull()
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
        monthStats={monthStats} payroll={payroll} switches={<div>This month pays switches</div>} />)
    const bar = () => screen.getByRole('region', { name: 'Payroll · August 2026' })

    // User 2026-09-27: Send = Complete, per salesperson. The bar only says
    // what payroll holds; the whole-month button went the day it came.
    // User 2026-09-28 (太显眼了): it says so in one line until it is opened.
    it('says the live figure is not in payroll yet in one line, and has nothing to press', () => {
      board()
      expect(bar()).toHaveTextContent('Not in payroll yet')
      const why = within(bar()).getByText(/worked out live from the ERP bills every time this page opens/)
      expect(why).not.toBeVisible()
      fireEvent.click(bar().querySelector('summary')!)
      expect(why).toBeVisible()
      expect(bar()).toHaveTextContent('it goes salesperson by salesperson, as each one is sent.')
      expect(within(bar()).queryByText('This month pays switches')).toBeNull()
      expect(within(bar()).queryByRole('button')).toBeNull()
      // Unified Payroll (2026-09-27): where a sent salesperson lands.
      expect(within(bar()).getByRole('link', { name: 'HR › Payroll →' })).toHaveAttribute('href', '/hr-costing/payroll/2026-08-01')
    })

    it('names what has to be settled first, by name', () => {
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
    })

    // KRIS and PETER in September: their own bills, no rank by rule — not a gap.
    it('lists a department head at no commission and does not count them as something to settle', () => {
      const data = fixture()
      data.input.orders = [...data.input.orders, sale('kris-1', 2_980, { staffId: 'kris' })]
      data.input.departmentHeadIds = ['kris']
      data.people = [...data.people, { staffId: 'kris', name: 'KRIS', employeeCode: 'HV006' }]
      board(data)
      const row = within(screen.getByRole('table', { name: 'Salesperson commission summary' })).getByRole('row', { name: /KRIS/ })
      expect(row).toHaveTextContent('Department headOwn bills earn no commission')
      expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('RM 0.00')
      expect(within(bar()).queryByRole('list', { name: 'To settle before payroll' })).toBeNull()
    })

    // 2026-09-27: a Revenue Director with a rung — own bills at its rate and
    // nothing else, the Directors tab's amounts beside them, never an override.
    it('shows a Revenue Director at their rung, with director pay in their total', () => {
      const data = fixture()
      data.input.ranks = [...data.input.ranks, rank('rd_12', 0.12, 3, 'Revenue Director')]
      data.input.orders = [...data.input.orders, sale('kris-1', 2_980, { staffId: 'kris' })]
      data.input.departmentHeadIds = ['kris']
      data.input.directors = [{ staffId: 'kris', rankKey: 'rd_12', fixedAmount: 38_000, salesThreshold: 2_000_000, incentiveAmount: 5_000 }]
      data.input.monthCommissionableValue = 1_500_000
      data.people = [...data.people, { staffId: 'kris', name: 'KRIS', employeeCode: 'HV006' }]
      board(data)
      const row = within(screen.getByRole('table', { name: 'Salesperson commission summary' })).getByRole('row', { name: /KRIS/ })
      expect(row).toHaveTextContent('Revenue Director')
      expect(row).toHaveTextContent('own bills only · no override')
      // (2,980 − the RM 20 pillow) × 12% = 355.20, plus the fixed 38,000; the
      // month is short of the 2,000,000 threshold, so no incentive.
      expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('RM 38,355.20')
      expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('Includes RM 38,000.00 director pay')
      choose('KRIS')
      const note = screen.getByRole('note', { name: 'Director pay' })
      expect(note).toHaveTextContent('Fixed amount RM 38,000.00')
      expect(note).toHaveTextContent('not yet — RM 1,500,000.00, RM 500,000.00 to go')
    })

    it('reads the month as saved, never what is only drafted on this screen', () => {
      const data = fixture()
      // Today's team has Anthony a rank up; the month as saved does not.
      data.currentHierarchy = data.input.hierarchy.map(n => n.staffId === 'agent' ? { ...n, baseRankKey: 'leader' } : n)
      board(data, 'applied', [{ staffId: 'agent', total: 1_220.5 }, { staffId: 'leader', total: 88.8 }])
      fireEvent.click(screen.getByText('Review settings', { exact: true }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Use current team & dated rules for preview' }))
      const card = within(screen.getByRole('region', { name: 'Monthly commission summary' })).getByRole('group', { name: 'Total commission' })
      expect(card).toHaveTextContent('Current team preview')
      expect(card).not.toHaveTextContent('RM 1,309.30')
      // Review settings says a draft is open, where its Reset is.
      expect(screen.getByText('Draft', { exact: true })).toBeVisible()
      // Payroll's RM 1,309.30 still matches the month as saved.
      expect(bar()).toHaveTextContent('The commission above matches it')
      expect(bar()).toHaveTextContent('This screen holds a draft')
    })

    it('says a month in payroll has moved since, by how much and for how many', () => {
      board(fixture(), 'applied', [{ staffId: 'agent', total: 1_220.5 }, { staffId: 'leader', total: 80 }], { ...PAYROLL, sentAt: '2026-09-15T02:30:00Z' })
      expect(bar()).toHaveTextContent('In payroll · RM 1,300.50')
      // Malaysia time, whatever the machine's zone.
      expect(bar()).toHaveTextContent(/Sent 15 Sept? 2026, 10:30/)
      expect(bar()).toHaveTextContent('RM 1,309.30, RM 8.80 more · 1 person changed')
      expect(within(bar()).queryByRole('button')).toBeNull()
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
    expect(notice).toHaveTextContent('Payroll follows when the salesperson is sent.')
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

  // 2026-09-27: a bill nothing names a brand for gets *Brand for the margin*
  // on a salesperson's ledger too — the same row All bills offers.
  it('offers a brand for the margin on a brandless bill of the ledger, never on one with its own', async () => {
    setOrderBrand.mockResolvedValue({ orderNo: 'SO-two', changed: true, brandCode: 'ZANOTTI', picked: 'ZANOTTI' })
    const data = fixture()
    data.input.orders = [sale('one', 1_000, { brandCode: 'AKEMI' }), sale('two', 2_000)]
    render(<CommissionWorkbench data={data} sub="fair" period="2026-08-01" runStatus="computed" savedTotals={[]}
      monthStats={monthStats}
      brandMenu={{ options: [{ code: 'AKEMI', name: 'Akemi' }, { code: 'ZANOTTI', name: 'Zanotti' }], picked: {} }} />)
    choose('Anthony')
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-one')).getAllByRole('cell')[2], { clientX: 400, clientY: 260 })
    expect(screen.getByRole('menu', { name: 'Actions for SO-one' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Brand for the margin/ })).toBeNull()
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-two')).getAllByRole('cell')[2], { clientX: 400, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Brand for the margin/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Brand for SO-two' })).getByRole('button', { name: 'Zanotti' }))
    await waitFor(() => expect(setOrderBrand).toHaveBeenCalledWith('two', 'ZANOTTI'))
    expect(await screen.findByText('SO-two now follows Zanotti’s margin ladder.')).toBeInTheDocument()
  })

  it('locks the brand row for a closed month', () => {
    const data = fixture()
    data.input.orders = [sale('one')]
    render(<CommissionWorkbench data={data} sub="fair" period="2026-08-01" runStatus="applied" savedTotals={[]}
      monthStats={monthStats} lockedPeriods={['2026-08-01']}
      brandMenu={{ options: [{ code: 'AKEMI', name: 'Akemi' }], picked: {} }} />)
    choose('Anthony')
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-one')).getAllByRole('cell')[2], { clientX: 400, clientY: 260 })
    const row = screen.getByRole('menuitem', { name: /Brand for the margin/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('The run for August 2026 has paid')
  })
})

// User 2026-09-30: right-click a bill on a salesperson's ledger → Share, pick
// the salesperson and the percent, Save — and the bill is on BOTH ledgers:
// the other person's says whose bill it is, and both name the two holders.
describe('CommissionWorkbench — a shared bill (user 2026-09-30)', () => {
  const TEAM = [{ staffId: 'agent', name: 'Anthony' }, { staffId: 'leader', name: 'Alex' }]
  function sharedFixture() {
    const data = fixture()
    data.input.orders = [...splitOrdersByShares([sale('one')], [{ orderId: 'one', staffId: 'leader', pct: 0.5 }]), sale('two', 2_000)]
    return data
  }

  it("sits on both holders' ledgers, each saying whose bill it is and naming both", () => {
    renderBoard(sharedFixture())
    choose('Alex')
    const alexRow = salesRow(personalTable(), 'SO-one')
    expect(alexRow).toHaveTextContent('From Anthony’s bill')
    expect(within(personalTable()).getByRole('columnheader', { name: 'Sales person' })).toBeVisible()
    expect(alexRow).toHaveTextContent('Anthony 50%')
    expect(alexRow).toHaveTextContent('Alex 50%')
    // Their part of the sales, and of how much.
    expect(alexRow).toHaveTextContent('RM 500.0050% of RM 1,000.00')

    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    choose('Anthony')
    const anthonyRow = salesRow(personalTable(), 'SO-one')
    expect(anthonyRow).toHaveTextContent('Shared with Alex')
    expect(anthonyRow).toHaveTextContent('Anthony 50%')
    expect(anthonyRow).toHaveTextContent('Alex 50%')
    // A bill with one salesperson names just them.
    const single = salesRow(personalTable(), 'SO-two')
    expect(single).not.toHaveTextContent('Shared')
    expect(single).not.toHaveTextContent('50%')

    // Searching for the other holder finds the shared bill.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search sales orders' }), { target: { value: 'Alex' } })
    expect(within(personalTable()).getByRole('link', { name: 'SO-one' })).toBeVisible()
    expect(within(personalTable()).queryByRole('link', { name: 'SO-two' })).toBeNull()
  })

  it('shares a bill from its right-click, then opens the other holder where the part now is', async () => {
    shareOrder.mockResolvedValue({ ok: true, result: {
      orderId: 'one', orderNo: 'SO-one', changed: true, staffId: 'leader', name: 'Alex', before: null, after: 0.5,
      parts: [{ staffId: 'agent', name: 'Anthony', pct: 0.5 }, { staffId: 'leader', name: 'Alex', pct: 0.5 }],
    } })
    unshareOrder.mockResolvedValue({ ok: true, result: {
      orderId: 'one', orderNo: 'SO-one', changed: true, staffId: 'leader', name: 'Alex', before: 0.5, after: null,
      parts: [{ staffId: 'agent', name: 'Anthony', pct: 1 }],
    } })
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]}
      monthStats={monthStats} shareTeam={TEAM} />)
    choose('Anthony')
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-one')).getByText('Arena'), { clientX: 400, clientY: 260 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Share this bill/ }))
    const panel = screen.getByRole('dialog', { name: 'Share SO-one' })
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 'leader' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(shareOrder).toHaveBeenCalledWith('one', 'leader', 0.5))
    const notice = await screen.findByText(/SO-one is shared: Anthony 50% · Alex 50%/)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(within(notice).getByRole('button', { name: 'Open Alex' }))
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeVisible()
    expect(window.location.search).toBe('?person=leader')
    // The line stays, and there is no button to the ledger already open.
    const still = screen.getByText(/SO-one is shared: Anthony 50% · Alex 50%/)
    expect(within(still).queryByRole('button', { name: 'Open Alex' })).toBeNull()

    fireEvent.click(within(still).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(unshareOrder).toHaveBeenCalledWith('one', 'leader'))
    expect(await screen.findByText(/SO-one is no longer shared with Alex — Anthony holds all of it again\./)).toBeVisible()
  })

  it('will not share a bill whose holder is closed, and never with somebody closed', () => {
    const data = sharedFixture()
    render(<CommissionWorkbench data={data} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]}
      monthStats={monthStats} shareTeam={TEAM} closes={{
        subDepartmentId: 'sub', unavailable: null,
        closes: [{ staffId: 'leader', closedAt: '2026-09-15T00:00:00Z', closedByName: 'HR', total: 0,
          summary: parseCloseSummary({ name: 'Alex', total: 0, bills: [], overrides: [] }, 'Alex') }],
      }} />)
    choose('Anthony')
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-one')).getByText('Arena'), { clientX: 400, clientY: 260 })
    const row = screen.getByRole('menuitem', { name: /Share this bill/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('Alex’s August 2026 is closed — reopen it before changing who shares this bill')
    fireEvent.pointerDown(document.body)

    // SO-two is Anthony's alone: it can be shared — but not with Alex, who is closed.
    fireEvent.contextMenu(within(salesRow(personalTable(), 'SO-two')).getByText('Convention Centre'), { clientX: 400, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Share this bill/ }))
    const panel = screen.getByRole('dialog', { name: 'Share SO-two' })
    expect(within(within(panel).getByLabelText(/Share with/)).getByRole('option', { name: 'Alex — closed for August 2026' })).toBeDisabled()
  })
})
