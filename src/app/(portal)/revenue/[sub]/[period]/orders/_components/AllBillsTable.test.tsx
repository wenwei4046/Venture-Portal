import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  excludeOrder: vi.fn(),
  includeOrder: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('../../../../run-actions', () => ({
  excludeOrder: mocks.excludeOrder,
  includeOrder: mocks.includeOrder,
  shareOrder: vi.fn(),
  unshareOrder: vi.fn(),
  setOpenBillRank: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))

import AllBillsTable, { type BillRow } from './AllBillsTable'

function bill(extra: Partial<BillRow> = {}): BillRow {
  return {
    orderId: 'order-1', orderNo: 'HC-SO-013493', href: '/revenue/fair/2026-09-01/orders/order-1',
    orderDate: '2026-09-07', eventDate: '2026-09-07', sequenceInDay: 1, customerName: 'Sarida',
    venue: 'SETIA SPICE CONVENTION CENTRE', venueHref: '/revenue/fair/2026-09-01/orders?venue=setia', venuePlace: null,
    eventName: null, organizer: null, location: null, brands: ['AKEMI'], categories: [],
    orderTotal: 4500, commissionable: 4500, paidAmount: 4500, depositShort: null,
    marginPct: 0.4, marginValue: 1800, marginKeyed: false, status: 'Included', cancelled: false,
    exclusionDetail: null, countAction: { kind: 'exclude' },
    staff: { id: 's-1', name: 'ANTHONY', code: 'HV008', href: '/revenue/fair/2026-09-01/orders?staff=s-1' },
    agent: null, shares: [], shareDisabled: false, shareDisabledReason: '',
    title: 'Revenue Specialist', rank: 'B', rate: 0.05,
    openBill: { rank: null, suggested: false, disabled: true, disabledReason: '' },
    commission: { product: 225, kpi: 0, marginIncentive: 0, openBill: 0, total: 225 },
    ...extra,
  }
}

function table(rows: BillRow[] = [bill()], hasRun = true) {
  return render(
    <AllBillsTable rows={rows} team={[]} openBillPaid={false} commissionNote={null}
      initialShowExcluded={false} monthLabel="September 2026" hasRun={hasRun} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.excludeOrder.mockResolvedValue({ orderNo: 'HC-SO-013493', changed: true, openBillRank: null })
  mocks.includeOrder.mockResolvedValue({ orderNo: 'HC-SO-013493', changed: true, counts: true, stillOut: null, openBillRank: null })
})

describe('AllBillsTable — the bill menu', () => {
  it('opens on a right-click anywhere on the bill', () => {
    table()
    fireEvent.contextMenu(screen.getByText('Sarida'), { clientX: 400, clientY: 260 })
    const root = screen.getByRole('menu', { name: 'Actions for HC-SO-013493' })
    expect(within(root).getByRole('menuitem', { name: /Don't count this bill/ })).toBeInTheDocument()
  })

  it('leaves the browser its own menu on Shift + right-click', () => {
    table()
    const event = fireEvent.contextMenu(screen.getByText('Sarida'), { clientX: 400, clientY: 260, shiftKey: true })
    expect(event).toBe(true) // not prevented
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it("lets Share… keep its own right-click", () => {
    table()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Share…' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Share with' })).toBeInTheDocument()
  })

  it('offers the link a right-click landed on', () => {
    table()
    fireEvent.contextMenu(screen.getByRole('link', { name: 'ANTHONY' }), { clientX: 400, clientY: 260 })
    const root = screen.getByRole('menu', { name: 'Actions for HC-SO-013493' })
    expect(within(root).getByRole('menuitem', { name: /Open link in new tab/ })).toHaveTextContent('ANTHONY')
  })

  it('opens and closes from the ⋯ beside the order number, for whoever cannot right-click', () => {
    table()
    const more = screen.getByRole('button', { name: 'Actions for HC-SO-013493' })
    fireEvent.click(more)
    expect(screen.getByRole('menu', { name: 'Actions for HC-SO-013493' })).toBeInTheDocument()
    expect(more).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(more)
    fireEvent.click(more)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('says what taking a bill out did, and undoes it in one click', async () => {
    table()
    fireEvent.contextMenu(screen.getByText('Sarida'), { clientX: 400, clientY: 260 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Don't count this bill/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Don't count this bill" }))

    const notice = await screen.findByText(/HC-SO-013493 no longer counts in September 2026\./)
    expect(notice).toHaveTextContent('Payroll follows when the salesperson is sent.')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(within(notice).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(mocks.includeOrder).toHaveBeenCalledWith('order-1'))
    expect(await screen.findByText(/HC-SO-013493 counts again\./)).toBeInTheDocument()
  })

  it('names a bill taken out by hand and who did it, behind Show excluded', () => {
    table([
      bill(),
      bill({
        orderId: 'order-2', orderNo: 'HC-SO-013494', cancelled: true, status: 'Not counted',
        exclusionDetail: 'Taken out by Principal on 27 Sep 2026 — duplicate',
        countAction: { kind: 'include', stillOut: null }, customerName: 'Vincent', commission: null,
      }),
    ])
    expect(screen.queryByText('HC-SO-013494')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /Show excluded \(1\)/ }))
    const status = screen.getByText('Not counted')
    expect(status).toHaveAttribute('title', 'Taken out by Principal on 27 Sep 2026 — duplicate')
    fireEvent.contextMenu(status, { clientX: 300, clientY: 300 })
    expect(screen.getByRole('menuitem', { name: /Count this bill again/ })).toBeInTheDocument()
  })
})
