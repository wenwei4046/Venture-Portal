import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { EngineInput, Rank, SalesOrder } from '@/lib/commission/types'
import { parseCloseSummary, type SalespersonClose } from '@/lib/commission/closes'
import { resetSelections } from '@/lib/selection-store'
import type { CommissionWorkbenchData } from '../../../_lib/commission-workbench'
import CommissionWorkbench, { type CloseFacts } from './CommissionWorkbench'

const { closeSalespeople, reopenSalespeople, refresh, url } = vi.hoisted(() => {
  // The workbench stands on the URL (`useSearchParams`); the stand-in follows
  // the browser's pushState / replaceState through this subscription.
  const listeners = new Set<() => void>()
  return {
    closeSalespeople: vi.fn(), reopenSalespeople: vi.fn(), refresh: vi.fn(),
    url: {
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
      changed() { for (const listener of listeners) listener() },
    },
  }
})
vi.mock('../../../close-actions', () => ({ closeSalespeople, reopenSalespeople }))
vi.mock('../../../run-actions', () => ({ saveOpenBillPicks: vi.fn(), excludeOrder: vi.fn(), includeOrder: vi.fn() }))
vi.mock('next/navigation', async () => {
  const { useMemo, useSyncExternalStore } = await import('react')
  return {
    useRouter: () => ({ refresh, push: vi.fn() }),
    useSearchParams: () => {
      const search = useSyncExternalStore(url.subscribe, () => window.location.search, () => '')
      return useMemo(() => new URLSearchParams(search), [search])
    },
  }
})
const originalPush = window.history.pushState.bind(window.history)
const originalReplace = window.history.replaceState.bind(window.history)
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))

const rank = (rankKey: string, productRate: number, sortOrder: number, titleLabel: string): Rank => ({
  rankKey, productRate, sortOrder, titleId: rankKey, titleLabel, label: `${productRate * 100}%`,
  canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null,
})

function sale(id: string, amount: number, staffId: string): SalesOrder {
  return {
    id, orderNo: `SO-${id}`, staffId, periodMonth: '2026-09-01',
    orderDate: '2026-09-12', eventDate: '2026-09-12', orderTotal: amount, paidAmount: amount,
    lines: [{ id: `${id}-goods`, itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: amount, costAmount: amount * 0.6 }],
  }
}

// ANTHONY 5% sells 1,000 + 2,000 (150); CHEA HUAN 6% sells 4,000 (240) and
// overrides nobody; ALEX 8% leads Anthony (3% of 3,000 = 90).
function fixture(orders = [sale('one', 1_000, 'agent'), sale('two', 2_000, 'agent'), sale('three', 4_000, 'ch')]): CommissionWorkbenchData {
  const input: EngineInput = {
    periodMonth: '2026-09-01',
    scheme: {
      openBillBasis: 'uplift_on_commission', overrideIncludesKpi: false,
      enableProductRevenue: true, enableKpi: false, enableOpenBill: true, enableOverride: true,
      enableMarginPenalty: false, enableMarginIncentive: false,
      itemGroups: [{ group: 'SOFA', commissionable: true }],
      depositThresholdPct: 0.3, defaultRateMode: 'fixed',
    },
    ranks: [rank('agent', 0.05, 1, 'Revenue Specialist'), rank('ch', 0.06, 2, 'Senior Revenue Specialist'), rank('leader', 0.08, 3, 'Team Leader')],
    hierarchy: [
      { staffId: 'agent', uplineStaffId: 'leader', baseRankKey: 'agent', titleId: 'agent', rateMode: 'fixed' },
      { staffId: 'ch', uplineStaffId: null, baseRankKey: 'ch', titleId: 'ch', rateMode: 'fixed' },
      { staffId: 'leader', uplineStaffId: null, baseRankKey: 'leader', titleId: 'leader', rateMode: 'fixed' },
    ],
    orders,
    kpiItems: [], kpiThresholds: [],
    openBillRules: [{ rank: 1, pct: 0.5 }, { rank: 2, pct: 0.4 }, { rank: 3, pct: 0.3 }],
    openBillTags: [], marginBands: [], priorMonths: [],
  }
  return {
    input, currentHierarchy: input.hierarchy,
    currentRules: { hierarchy: input.hierarchy, kpiItems: input.kpiItems, kpiThresholds: input.kpiThresholds, openBillRules: input.openBillRules },
    unmatchedOrderNos: [], payRows: [], payUnavailable: true,
    people: [
      { staffId: 'agent', name: 'ANTHONY', employeeCode: 'HV010' },
      { staffId: 'ch', name: 'CHEA HUAN', employeeCode: 'HV011' },
      { staffId: 'leader', name: 'ALEX', employeeCode: 'HV002' },
    ],
    orders: orders.map(o => ({ orderId: o.id, venue: 'MID VALLEY', eventName: '11–13 Sep', organizer: 'REX', location: 'KL', fair: null, booth: null, refNo: null, paperNo: null })),
  }
}

const monthStats = { salesValue: 7_000, commissionableValue: 7_000, totalOrders: 3, unmatchedAgents: 0, linesWithoutCost: 0 }
const SUB = '71709f7e-9f7c-4e28-80cf-ce21be336995'

function closed(staffId: string, name: string, total: number, bills: Array<[string, string, number]> = []): SalespersonClose {
  return {
    staffId, closedAt: '2026-09-15T08:30:00Z', closedByName: 'HR Manager', total,
    summary: parseCloseSummary({
      name, titleLabel: 'Revenue Specialist', rankLabel: '5%', productRate: 0.05, orders: bills.length,
      salesValue: 3_000, commissionable: 3_000, groupRevenue: 3_000, upsell: 0, dropped: 0,
      marginPct: null, marginRevenue: null, marginCost: null,
      personal: total, overriding: 0, groupIncentive: 0, total,
      bills: bills.map(([id, no, amount]) => ({ id, no, status: 'eligible', total: amount })), overrides: [],
    }, name),
  }
}

function renderBoard({ data = fixture(), closes = [] as SalespersonClose[], unavailable = null as string | null } = {}) {
  const facts: CloseFacts = { subDepartmentId: SUB, closes, unavailable }
  return render(<CommissionWorkbench data={data} sub="fair" period="2026-09-01" runStatus={null} savedTotals={[]}
    monthStats={monthStats} closes={facts} />)
}

const table = () => screen.getByRole('table', { name: 'Salesperson commission summary' })
const row = (name: string) => within(table()).getByRole('row', { name: new RegExp(name) })
const bar = () => screen.getByRole('region', { name: 'Close September 2026' })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  // Ticks live in the module-scope selection store: one test's must not
  // greet the next.
  resetSelections()
  originalReplace(null, '', '/revenue/fair/2026-09-01')
  vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, next) => { originalPush(data, unused, next); url.changed() })
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, next) => { originalReplace(data, unused, next); url.changed() })
  closeSalespeople.mockImplementation(async ({ people }: { people: Array<{ staffId: string }> }) => ({ closed: people.length, names: people.map(p => p.staffId) }))
  reopenSalespeople.mockImplementation(async ({ staffIds }: { staffIds: string[] }) => ({ reopened: staffIds.length }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('closing salespeople from the list', () => {
  it('ticks a few and closes them at the figures on screen, after naming them', async () => {
    renderBoard()
    expect(bar()).toHaveTextContent('0 of 3 closed')
    fireEvent.click(within(row('ANTHONY')).getByRole('checkbox', { name: 'Tick ANTHONY' }))
    fireEvent.click(within(row('CHEA HUAN')).getByRole('checkbox', { name: 'Tick CHEA HUAN' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close 2 ticked' }))

    const ask = within(bar()).getByRole('group', { name: 'Confirm close' })
    expect(ask).toHaveTextContent('Close 2 salespeople — ANTHONY, CHEA HUAN — and lock RM 390.00 for September 2026?')
    expect(closeSalespeople).not.toHaveBeenCalled()
    fireEvent.click(within(ask).getByRole('button', { name: 'Close 2' }))

    await waitFor(() => expect(closeSalespeople).toHaveBeenCalledWith({
      subDepartmentId: SUB, period: '2026-09-01',
      people: [{ staffId: 'agent', expectedTotal: 150 }, { staffId: 'ch', expectedTotal: 240 }],
    }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(within(bar()).getByRole('status')).toHaveTextContent('2 salespeople closed — RM 390.00 locked.')
  })

  it('closes everybody still open in one go, and cancelling asks nothing', async () => {
    renderBoard({ closes: [closed('agent', 'ANTHONY', 150, [['one', 'SO-one', 50], ['two', 'SO-two', 100]])] })
    expect(bar()).toHaveTextContent('1 of 3 closed')
    expect(bar()).toHaveTextContent('RM 150.00 locked')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close the 2 still open' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Cancel' }))
    expect(closeSalespeople).not.toHaveBeenCalled()

    fireEvent.click(within(bar()).getByRole('button', { name: 'Close the 2 still open' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close 2' }))
    await waitFor(() => expect(closeSalespeople).toHaveBeenCalledWith(expect.objectContaining({
      people: [{ staffId: 'leader', expectedTotal: 90 }, { staffId: 'ch', expectedTotal: 240 }],
    })))
  })

  it('shows a closed row as it was locked, tagged, and says when the live month has moved', () => {
    // Closed at 150; a third bill has arrived for ANTHONY since.
    const data = fixture([sale('one', 1_000, 'agent'), sale('two', 2_000, 'agent'), sale('late', 1_000, 'agent'), sale('three', 4_000, 'ch')])
    renderBoard({ data, closes: [closed('agent', 'ANTHONY', 150, [['one', 'SO-one', 50], ['two', 'SO-two', 100]])] })
    const anthony = row('ANTHONY')
    expect(within(anthony).getByText('Closed · moved since')).toBeVisible()
    expect(anthony).toHaveTextContent('RM 150.00')
    expect(anthony).toHaveTextContent('Live now RM 200.00')
    expect(bar()).toHaveTextContent('ANTHONY has moved since they were closed')
    // The footer adds what the rows show: ANTHONY's close (150, not the live
    // 200), CHEA HUAN 240 — and ALEX, still open, whose override already
    // counts the late bill (3% of 4,000 = 120).
    expect(within(table()).getByRole('row', { name: /All salespeople/ })).toHaveTextContent('RM 510.00')
  })

  it('keeps the ticks through a trip to a bill and back', () => {
    const first = renderBoard()
    fireEvent.click(within(row('ANTHONY')).getByRole('checkbox', { name: 'Tick ANTHONY' }))
    first.unmount()
    renderBoard()
    expect(within(row('ANTHONY')).getByRole('checkbox', { name: 'Tick ANTHONY' })).toBeChecked()
    expect(within(bar()).getByRole('button', { name: 'Close 1 ticked' })).toBeVisible()
  })

  it('reopens a ticked closed person', async () => {
    renderBoard({ closes: [closed('agent', 'ANTHONY', 150, [['one', 'SO-one', 50], ['two', 'SO-two', 100]])] })
    fireEvent.click(within(row('ANTHONY')).getByRole('checkbox', { name: 'Tick ANTHONY' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Reopen 1' }))
    fireEvent.click(within(bar()).getByRole('group', { name: 'Confirm reopen' }).querySelector('button')!)
    await waitFor(() => expect(reopenSalespeople).toHaveBeenCalledWith({ subDepartmentId: SUB, period: '2026-09-01', staffIds: ['agent'] }))
  })

  it('ticks every row shown from the header, and says when the month is fully closed', () => {
    renderBoard({ closes: [closed('agent', 'ANTHONY', 150), closed('ch', 'CHEA HUAN', 240), closed('leader', 'ALEX', 90)] })
    expect(bar()).toHaveTextContent('September 2026 is closed — all 3 salespeople')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick every salesperson shown' }))
    expect(within(bar()).getByRole('button', { name: 'Reopen 3' })).toBeEnabled()
    expect(within(bar()).queryByRole('button', { name: /^Close/ })).toBeNull()
  })

  it('will not close while a draft is on screen, or in a month settled by hand', () => {
    renderBoard({ unavailable: 'August 2026 was settled by hand, so there is nothing to close.' })
    expect(within(bar()).getByRole('button', { name: 'Close all 3' })).toBeDisabled()
    expect(bar()).toHaveTextContent('settled by hand')
  })

  // The screenshot of 2026-09-28: Close all 30 disabled by a draft of the old
  // KPI / Open Bill / Margin preview checkboxes still in the tab's session —
  // set to the month's own values, so nothing on screen looked different.
  it('is not held shut by the incentive preview an older draft kept', () => {
    sessionStorage.setItem('commission-draft:fair:2026-09-01', JSON.stringify({
      picks: null, picksSource: null, currentTeam: false, previewFeatures: { kpi: false, openBill: false, margin: false },
    }))
    renderBoard()
    expect(within(bar()).getByRole('button', { name: 'Close all 3' })).toBeEnabled()
    expect(bar()).not.toHaveTextContent('A close locks the month as saved')
  })

  it('surfaces the refusal the server gives, in words', async () => {
    closeSalespeople.mockRejectedValueOnce(new Error('Nobody was closed — ANTHONY is RM 200.00 now, not the RM 150.00 on your screen. Refresh the page and check again.'))
    renderBoard()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close all 3' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close 3' }))
    expect(await within(bar()).findByRole('alert')).toHaveTextContent('ANTHONY is RM 200.00 now')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('bills paid on but priced RM 0 in the ERP', () => {
  // HC-SO-2609-114's shape: goods keyed at RM 0, a payment recorded.
  const unpricedSale = (): SalesOrder => ({ ...sale('rm0', 0, 'agent'), orderNo: 'HC-SO-2609-114', paidAmount: 2_839 })
  const month = () => fixture([sale('one', 1_000, 'agent'), sale('two', 2_000, 'agent'), sale('three', 4_000, 'ch'), unpricedSale()])

  it('names them above the list, folded to one line, and tags the salesperson’s row', () => {
    renderBoard({ data: month() })
    const notice = screen.getByRole('region', { name: 'Bills priced RM 0 in the ERP' })
    expect(notice).toHaveTextContent('1 bill is paid but priced RM 0 in the ERP')
    // One line until asked (user 2026-09-28: 太显眼了); the bills open on a click.
    const bill = within(notice).getByRole('link', { name: 'HC-SO-2609-114' })
    expect(bill).not.toBeVisible()
    fireEvent.click(notice.querySelector('summary')!)
    expect(bill).toBeVisible()
    expect(notice).toHaveTextContent('paid RM 2,839.00')
    expect(within(row('ANTHONY')).getByText('1 bill RM 0')).toBeVisible()
    expect(within(row('CHEA HUAN')).queryByText(/RM 0$/)).toBeNull()
  })

  it('says so in the confirm before several are closed', () => {
    renderBoard({ data: month() })
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close all 3' }))
    const ask = within(bar()).getByRole('group', { name: 'Confirm close' })
    expect(ask).toHaveTextContent('ANTHONY (1 bill) — paid but priced RM 0 in the ERP. Closed now, those bills stay at RM 0.')
  })

  it('asks before closing that salesperson from their ledger, and closes on the second click', async () => {
    renderBoard({ data: month() })
    fireEvent.click(within(row('ANTHONY')).getByRole('button', { name: /^ANTHONY$/ }))
    expect(screen.getByRole('region', { name: 'Bills priced RM 0 in the ERP' })).toBeVisible()
    expect(screen.getByText('Priced RM 0 in the ERP')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Close ANTHONY/ }))
    expect(closeSalespeople).not.toHaveBeenCalled()
    const ask = screen.getByRole('group', { name: 'Confirm closing ANTHONY' })
    expect(ask).toHaveTextContent('HC-SO-2609-114 is paid but priced RM 0 in the ERP. Closed now, it stays at RM 0')
    fireEvent.click(within(ask).getByRole('button', { name: /Close anyway/ }))
    await waitFor(() => expect(closeSalespeople).toHaveBeenCalledWith(expect.objectContaining({ people: [{ staffId: 'agent', expectedTotal: 150 }] })))
  })

  it('lets Cancel back out without closing', () => {
    renderBoard({ data: month() })
    fireEvent.click(within(row('ANTHONY')).getByRole('button', { name: /^ANTHONY$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Close ANTHONY/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirm closing ANTHONY' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: /Close ANTHONY/ })).toBeVisible()
    expect(closeSalespeople).not.toHaveBeenCalled()
  })
})

describe('closing one salesperson from their ledger', () => {
  function openLedger(name: string) {
    fireEvent.click(within(row(name)).getByRole('button', { name: new RegExp(`^${name}$`) }))
  }

  it('closes from the header without asking, and Close & next opens the next one still open', async () => {
    renderBoard({ closes: [closed('ch', 'CHEA HUAN', 240)] })
    openLedger('ALEX')
    expect(screen.getByText('Locks RM 90.00 for September 2026')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Close & next/ }))
    await waitFor(() => expect(closeSalespeople).toHaveBeenCalledWith(expect.objectContaining({ people: [{ staffId: 'leader', expectedTotal: 90 }] })))
    // CHEA HUAN is closed already, so the next one open after ALEX is ANTHONY.
    expect(await screen.findByRole('heading', { name: 'ANTHONY' })).toBeVisible()
  })

  it('shows who closed it and when, the locked total, and what moved since', () => {
    const data = fixture([sale('one', 1_000, 'agent'), sale('two', 3_000, 'agent'), sale('three', 4_000, 'ch')])
    renderBoard({ data, closes: [closed('agent', 'ANTHONY', 150, [['one', 'SO-one', 50], ['two', 'SO-two', 100]])] })
    openLedger('ANTHONY')
    expect(screen.getByText('Total commission · locked')).toBeVisible()
    expect(screen.getByText('Closed', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText(/15 Sept? 2026.*HR Manager/)).toBeVisible()
    expect(screen.getByText('Live now RM 200.00 (+RM 50.00)')).toBeVisible()
    const moved = screen.getByRole('note')
    expect(moved).toHaveTextContent('Moved since ANTHONY was closed: +RM 50.00')
    expect(moved).toHaveTextContent('SO-two: RM 100.00 → RM 150.00')
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Close ANTHONY/ })).toBeNull()
  })

  it('locks the Open Bill picks of a closed person', () => {
    renderBoard({ closes: [closed('agent', 'ANTHONY', 150, [['one', 'SO-one', 50], ['two', 'SO-two', 100]])] })
    fireEvent.click(screen.getByRole('tab', { name: /^Open Bill/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all orders to add picks' }))
    expect(screen.getByRole('checkbox', { name: 'Open Bill SO-one' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Open Bill SO-three' })).toBeEnabled()
  })

  it('says on a closed person’s bill menu that their bills stay as closed', () => {
    renderBoard({ closes: [closed('agent', 'ANTHONY', 150, [['one', 'SO-one', 50], ['two', 'SO-two', 100]])] })
    openLedger('ANTHONY')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for SO-one' }))
    const item = screen.getByRole('menuitem', { name: /Don't count this bill/ })
    expect(item).toBeDisabled()
    // One line a row since 2026-10-12: why it is shut is the row's tooltip.
    expect(item).toHaveAttribute('title', 'ANTHONY’s September 2026 is closed — reopen it before changing which bills count')
  })

  it('turns Close off while the page holds a draft', () => {
    renderBoard()
    openLedger('ANTHONY')
    // An Open Bill pick not yet saved is a draft: the close would lock a figure payroll never sees.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open Bill SO-one' }))
    expect(screen.getByRole('button', { name: /Close ANTHONY/ })).toBeDisabled()
    expect(screen.getByText(/A close locks the month as saved/)).toBeVisible()
  })
})
