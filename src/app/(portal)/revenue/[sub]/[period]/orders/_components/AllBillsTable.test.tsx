import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  excludeOrder: vi.fn(),
  includeOrder: vi.fn(),
  setOrderBrand: vi.fn(),
  shareOrder: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('../../../../run-actions', () => ({
  excludeOrder: mocks.excludeOrder,
  includeOrder: mocks.includeOrder,
  setOrderBrand: mocks.setOrderBrand,
  shareOrder: mocks.shareOrder,
  unshareOrder: vi.fn(),
  setOpenBillRank: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))

import AllBillsTable, { type BillRow } from './AllBillsTable'

function bill(extra: Partial<BillRow> = {}): BillRow {
  return {
    orderId: 'order-1', orderNo: 'HC-SO-013493', refNo: 'HC13369', paperNo: 'HC13369', href: '/revenue/fair/2026-09-01/orders/order-1',
    orderDate: '2026-09-07', eventDate: '2026-09-07', sequenceInDay: 1, customerName: 'Sarida',
    venue: 'SETIA SPICE CONVENTION CENTRE', venueHref: '/revenue/fair/2026-09-01/orders?venue=setia', venuePlace: null,
    eventName: null, organizer: null, location: null, brands: ['AKEMI'], categories: [],
    orderTotal: 4500, commissionable: 4500, paidAmount: 4500, depositShort: null,
    marginPct: 0.4, marginValue: 1800, marginKeyed: false, status: 'Included', cancelled: false,
    exclusionDetail: null, countAction: { kind: 'exclude' }, brandAction: null,
    staff: { id: 's-1', name: 'ANTHONY', code: 'HV008', href: '/revenue/fair/2026-09-01/orders?staff=s-1' },
    agent: null, shares: [], shareDisabled: false, shareDisabledReason: '',
    title: 'Revenue Specialist', rank: 'B', rate: 0.05,
    openBill: { rank: null, suggested: false, disabled: true, disabledReason: '' },
    commission: { product: 225, kpi: 0, marginIncentive: 0, openBill: 0, total: 225 },
    ...extra,
  }
}

const BRANDS = [
  { code: 'AKEMI', name: 'Akemi' }, { code: 'DUNLOP', name: 'Dunlopillo' },
  { code: 'ERGOTEX', name: 'Ergotex' }, { code: 'ZANOTTI', name: 'Zanotti' },
]

function table(rows: BillRow[] = [bill()], hasRun = true) {
  return render(
    <AllBillsTable rows={rows} team={[]} openBillPaid={false} commissionNote={null}
      initialShowExcluded={false} monthLabel="September 2026" hasRun={hasRun} brandOptions={BRANDS} />,
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

// 2026-09-27: HC-SO-2609-127 — one bed frame, keyed the day after its AKEMI
// fair closed — reaches the portal with no brand at all. HR gives it one here.
describe('AllBillsTable — brand for the margin', () => {
  const brandless = () => bill({
    orderId: 'order-127', orderNo: 'HC-SO-2609-127', customerName: 'Chu Fook tiang', brands: [],
    brandAction: { kind: 'pick', picked: null },
  })

  it('offers a brand on a bill nothing names one for, and never on a bill with its own', () => {
    table([bill(), brandless()])
    fireEvent.contextMenu(screen.getByText('Sarida'), { clientX: 400, clientY: 260 })
    expect(screen.queryByRole('menuitem', { name: /Brand for the margin/ })).toBeNull()
    fireEvent.pointerDown(document.body)
    fireEvent.contextMenu(screen.getByText('Chu Fook tiang'), { clientX: 400, clientY: 300 })
    expect(screen.getByRole('menuitem', { name: /Brand for the margin…/ })).toHaveTextContent('Nothing on this bill names a brand')
  })

  it('gives the bill the brand picked, and says which ladder it follows now', async () => {
    mocks.setOrderBrand.mockResolvedValue({ orderNo: 'HC-SO-2609-127', changed: true, brandCode: 'AKEMI', picked: 'AKEMI' })
    table([brandless()])
    fireEvent.contextMenu(screen.getByText('Chu Fook tiang'), { clientX: 400, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Brand for the margin/ }))
    const panel = screen.getByRole('dialog', { name: 'Brand for HC-SO-2609-127' })
    expect(within(panel).getAllByRole('button').map(b => b.textContent)).toEqual(['Akemi', 'Dunlopillo', 'Ergotex', 'Zanotti', 'Cancel'])
    fireEvent.click(within(panel).getByRole('button', { name: 'Akemi' }))
    await waitFor(() => expect(mocks.setOrderBrand).toHaveBeenCalledWith('order-127', 'AKEMI'))
    expect(await screen.findByText('HC-SO-2609-127 now follows Akemi’s margin ladder.')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('changes or takes off a brand picked here', async () => {
    mocks.setOrderBrand.mockResolvedValue({ orderNo: 'HC-SO-2609-127', changed: true, brandCode: null, picked: null })
    table([bill({ ...brandless(), brands: ['ZANOTTI'], brandAction: { kind: 'pick', picked: 'ZANOTTI' } })])
    fireEvent.contextMenu(screen.getByText('Chu Fook tiang'), { clientX: 400, clientY: 300 })
    const row = screen.getByRole('menuitem', { name: /Brand for the margin/ })
    expect(row).toHaveTextContent('Picked here: Zanotti')
    fireEvent.click(row)
    const panel = screen.getByRole('dialog', { name: 'Brand for HC-SO-2609-127' })
    expect(within(panel).getByRole('button', { name: 'Zanotti (picked)' })).toBeDisabled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Take the pick off' }))
    await waitFor(() => expect(mocks.setOrderBrand).toHaveBeenCalledWith('order-127', null))
    expect(await screen.findByText('HC-SO-2609-127 has no brand again.')).toBeInTheDocument()
  })

  it('keeps the refusal in the panel', async () => {
    mocks.setOrderBrand.mockRejectedValue(new Error('The run for September 2026 has paid. Reopen it before changing a bill’s brand.'))
    table([brandless()])
    fireEvent.contextMenu(screen.getByText('Chu Fook tiang'), { clientX: 400, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: /Brand for the margin/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ergotex' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('has paid')
  })

  it('shows why the row is locked for a paid month', () => {
    table([bill({ ...brandless(), brandAction: { kind: 'locked', picked: null, reason: 'The run for September 2026 has paid — reopen it before changing a bill’s brand' } })])
    fireEvent.contextMenu(screen.getByText('Chu Fook tiang'), { clientX: 400, clientY: 300 })
    const row = screen.getByRole('menuitem', { name: /Brand for the margin/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('has paid')
  })
})

// 2026-09-30: the right-click's *Share this bill…* is on Sales orders too —
// the same write as *Share…* under the name.
describe('AllBillsTable — Share this bill…', () => {
  const TEAM = [{ staffId: 's-1', name: 'ANTHONY' }, { staffId: 's-2', name: 'ADRIAN' }]
  function shared() {
    return bill({ shares: [{ staffId: 's-2', name: 'ADRIAN', pct: 0.5 }] })
  }

  it('names every holder in the menu, and shares from it', async () => {
    mocks.shareOrder.mockResolvedValue({ ok: true, result: {
      orderId: 'order-1', orderNo: 'HC-SO-013493', changed: true, staffId: 's-2', name: 'ADRIAN', before: 0.5, after: 0.4,
      parts: [{ staffId: 's-1', name: 'ANTHONY', pct: 0.6 }, { staffId: 's-2', name: 'ADRIAN', pct: 0.4 }],
    } })
    render(
      <AllBillsTable rows={[shared()]} team={TEAM} openBillPaid={false} commissionNote={null}
        initialShowExcluded={false} monthLabel="September 2026" hasRun brandOptions={BRANDS} />,
    )
    fireEvent.contextMenu(screen.getByText('Sarida'), { clientX: 400, clientY: 260 })
    const root = screen.getByRole('menu', { name: 'Actions for HC-SO-013493' })
    expect(root).toHaveTextContent('HC-SO-013493 · ANTHONY + ADRIAN')
    const row = within(root).getByRole('menuitem', { name: /Share this bill/ })
    expect(row).toHaveTextContent('ANTHONY 50% · ADRIAN 50%')
    fireEvent.click(row)
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 's-2' } })
    fireEvent.change(within(panel).getByLabelText(/Their part/), { target: { value: '40' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.shareOrder).toHaveBeenCalledWith('order-1', 's-2', 0.4))
    expect(await screen.findByText(/HC-SO-013493 is shared: ANTHONY 60% · ADRIAN 40%/)).toBeInTheDocument()
  })

  it('locks the share in a month whose run has paid, and says why', () => {
    render(
      <AllBillsTable rows={[bill({ shareDisabled: true, shareDisabledReason: 'x' })]} team={TEAM} openBillPaid={false}
        commissionNote={null} initialShowExcluded={false} monthLabel="September 2026" hasRun brandOptions={BRANDS} />,
    )
    fireEvent.contextMenu(screen.getByText('Sarida'), { clientX: 400, clientY: 260 })
    const row = screen.getByRole('menuitem', { name: /Share this bill/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('The run for September 2026 has paid')
  })
})

// The paper beside the document (2026-10-03, user: follow erp sales order number,
// but with reference hc123123 (which is paper sales order number)).
describe('AllBillsTable — the Ref No. column', () => {
  it('shows the handwritten bill’s number beside the ERP’s', () => {
    table()
    const header = screen.getAllByRole('columnheader').map(th => th.textContent)
    expect(header.slice(0, 2)).toEqual(['Sales order', 'Ref No.'])
    const row = screen.getByRole('link', { name: 'HC-SO-013493' }).closest('tr')!
    expect(within(row).getByText('HC13369')).toBeInTheDocument()
  })

  it('finds a bill by its Ref No.', () => {
    table([bill(), bill({ orderId: 'order-2', orderNo: 'HC-SO-013494', refNo: 'ZNT6762+HC13245', paperNo: 'ZNT6762' })])
    fireEvent.change(screen.getByRole('textbox', { name: 'Search bills' }), { target: { value: 'hc13245' } })
    expect(screen.queryByRole('link', { name: 'HC-SO-013493' })).toBeNull()
    expect(screen.getByRole('link', { name: 'HC-SO-013494' })).toBeInTheDocument()
    // The cell carries two papers; the check reads the first as this bill's own.
    expect(screen.getByText('Checked as ZNT6762')).toBeInTheDocument()
  })

  it('says when the check cannot read a paper number from the bill', () => {
    table([
      bill({ refNo: null, paperNo: null }),
      bill({ orderId: 'order-2', orderNo: 'HC-SO-013509', refNo: '6760', paperNo: null }),
    ])
    expect(screen.getByText('No Ref No. in the ERP')).toBeInTheDocument()
    const odd = screen.getByRole('link', { name: 'HC-SO-013509' }).closest('tr')!
    expect(within(odd).getByText('6760')).toBeInTheDocument()
    expect(within(odd).getByText('Not a paper number')).toBeInTheDocument()
  })

  it('can be hidden from the Columns menu like any other', () => {
    table()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ref No.' }))
    expect(screen.queryByRole('columnheader', { name: 'Ref No.' })).toBeNull()
    expect(screen.queryByText('HC13369')).toBeNull()
  })
})
