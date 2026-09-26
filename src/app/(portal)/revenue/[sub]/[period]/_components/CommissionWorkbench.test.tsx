import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { EngineInput, Rank, SalesOrder } from '@/lib/commission/types'
import { buildPayRow } from '@/lib/revenue-pay'
import { upsalesToOrders } from '@/lib/commission/upsales'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import CommissionWorkbench from './CommissionWorkbench'

const { saveOpenPicks, refresh } = vi.hoisted(() => ({ saveOpenPicks: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../run-actions', () => ({ saveOpenBillPicks: saveOpenPicks }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))

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
      { orderId: 'one', venue: 'Arena', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL' },
      { orderId: 'two', venue: 'Convention Centre', eventName: 'Home Fair', organizer: 'Fair Co', location: 'KL' },
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
})
afterEach(cleanup)

describe('CommissionWorkbench', () => {
  it('opens an agent as a focused page and restores the month overview on return', () => {
    render(<CommissionWorkbench data={fixture()} sub="fair" period="2026-08-01" runStatus={null} savedTotals={[]} monthStats={monthStats}
      monthOverview={<><h1>August 2026 overview</h1><p>Total sales value · RM 3,000.00</p></>}
      monthTools={<div>Payroll source controls</div>} />)
    expect(screen.getByRole('heading', { name: 'August 2026 overview' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Monthly commission summary' })).toBeVisible()
    choose('Anthony')
    expect(screen.getByRole('heading', { name: 'Anthony' })).toBeVisible()
    expect(screen.queryByText('August 2026 overview')).toBeNull()
    expect(screen.queryByText('Total sales value · RM 3,000.00')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Monthly commission summary' })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Commission views' })).toBeNull()
    expect(screen.queryByText('Review settings')).toBeNull()
    expect(screen.queryByText('Payroll source controls')).toBeNull()
    expect(screen.queryByText('Targets, thresholds & margin by brand')).toBeNull()
    expect(screen.queryByText('Claims & travel')).toBeNull()
    expect(screen.getByRole('tablist', { name: 'Salesperson commission type' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    expect(screen.getByRole('heading', { name: 'August 2026 overview' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Monthly commission summary' })).toBeVisible()
    expect(screen.getByRole('tablist', { name: 'Commission views' })).toBeVisible()
    expect(screen.getByText('Payroll source controls')).toBeVisible()
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

    choose('Anthony')
    fireEvent.click(within(salesRow(personalTable(), 'SO-one')).getByRole('button', { name: 'Exclude' }))
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    expect(card('Total commission')).toHaveTextContent('RM 1,180.00')
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
    expect(cells[5]).toHaveTextContent('RM 300.00')
    expect(cells[6]).toHaveTextContent('RM (2,088.00)')
    const alex = within(within(summary).getByRole('row', { name: /Alex/ })).getAllByRole('cell')
    expect(alex[5]).toHaveTextContent('—')
    expect(alex[6]).toHaveTextContent('—')
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
    expect(within(table).getByRole('link', { name: 'SO-one' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders/one')
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

  it('excludes and restores an order while recalculating KPI threshold, open bill and monthly total', () => {
    renderBoard()
    choose('Anthony')
    fireEvent.click(within(salesRow(personalTable(), 'SO-one')).getByRole('button', { name: 'Exclude' }))
    expect(within(personalTable()).queryByRole('link', { name: 'SO-one' })).toBeNull()
    expect(salesRow(personalTable(), 'SO-two')).toHaveTextContent('+ RM 0.00 · 0% bonus')
    expect(screen.getAllByText('RM 1,120.00').length).toBeGreaterThan(0)
    expect(saveOpenPicks).not.toHaveBeenCalled()
    expect(JSON.parse(sessionStorage.getItem('commission-draft:fair:2026-08-01')!)).toMatchObject({ excluded: ['one'] })

    fireEvent.click(screen.getByRole('checkbox', { name: /Show excluded/ }))
    const excludedRow = salesRow(personalTable(), 'SO-one')
    expect(excludedRow).toHaveTextContent('Excluded from draft')
    expect(within(excludedRow).getByRole('checkbox', { name: 'Open Bill SO-one' })).toBeDisabled()
    fireEvent.click(within(excludedRow).getByRole('button', { name: 'Restore' }))
    expect(salesRow(personalTable(), 'SO-one')).toHaveTextContent('RM 432.33')
    expect(salesRow(personalTable(), 'SO-two')).toHaveTextContent('+ RM 4.00 · 20% bonus')
    expect(screen.getAllByText('RM 1,223.00').length).toBeGreaterThan(0)
  })

  it('keeps the person review usable when all their orders are excluded and can reset the draft', () => {
    renderBoard()
    choose('Anthony')
    fireEvent.click(within(salesRow(personalTable(), 'SO-one')).getByRole('button', { name: 'Exclude' }))
    fireEvent.click(within(salesRow(personalTable(), 'SO-two')).getByRole('button', { name: 'Exclude' }))
    expect(screen.getByText('No sales orders match this view.')).toBeVisible()
    fireEvent.click(screen.getByText('Review edits (2)', { exact: true }))
    expect(screen.getByRole('button', { name: 'Restore SO-one' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Restore SO-two' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(within(personalTable()).getAllByRole('link')).toHaveLength(2)
    expect(screen.getAllByText('RM 1,223.00').length).toBeGreaterThan(0)
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
    expect(screen.getByText(/This run is applied/)).toBeVisible()
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

  it('restores a draft exclusion on reopening the month without saving payroll', () => {
    sessionStorage.setItem('commission-draft:fair:2026-08-01', JSON.stringify({ excluded: ['one'] }))
    renderBoard()
    choose('Anthony')
    expect(personalTable()).not.toHaveTextContent('SO-one')
    expect(personalTable()).toHaveTextContent('RM 1,120.00')
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

  it('shows the current salary calculation before a saved run and updates net pay when an order is excluded', () => {
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

    fireEvent.click(within(salesRow(personalTable(), 'SO-one')).getByRole('button', { name: 'Exclude' }))
    expect(salesRow(salary, '^Current commission')).toHaveTextContent('RM 1,120.00')
    expect(salesRow(salary, '^Gross pay')).toHaveTextContent('RM 1,327.00')
    expect(salesRow(salary, '^Estimated take-home pay')).toHaveTextContent('RM 1,252.00')
    expect(screen.getByText('Estimated take-home pay', { selector: 'span' }).parentElement).toHaveTextContent('RM 1,252.00')
    expect(saveOpenPicks).not.toHaveBeenCalled()
  })

  it('links the saved salary breakdown only for a person with a saved statement', () => {
    renderBoard(salaryFixture(), 'computed', [{ staffId: 'agent', total: 1223 }])
    choose('Anthony')
    expect(screen.getByRole('link', { name: 'Saved salary breakdown ↗' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/pay/agent')
    fireEvent.click(screen.getByRole('button', { name: '← Sales people' }))
    choose('Alex')
    expect(screen.queryByRole('link', { name: /salary breakdown/i })).toBeNull()
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
    expect(screen.getByText('Open Bill is preview-only while switched off in Revenue Rules. Enable it in Rules before saving picks.')).toBeVisible()
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
    expect(within(personalTable()).queryByRole('link', { name: 'SO-two' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Open Bill rank SO-one' })).toHaveValue('1')
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
