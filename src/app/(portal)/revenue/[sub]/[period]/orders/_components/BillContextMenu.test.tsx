import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'

const mocks = vi.hoisted(() => ({
  excludeOrder: vi.fn(),
  includeOrder: vi.fn(),
  shareOrder: vi.fn(),
  unshareOrder: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('../../../../run-actions', () => ({
  excludeOrder: mocks.excludeOrder, includeOrder: mocks.includeOrder,
  shareOrder: mocks.shareOrder, unshareOrder: mocks.unshareOrder,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))

import BillContextMenu from './BillContextMenu'

function menu(action: BillCountAction, extra: Partial<Parameters<typeof BillContextMenu>[0]> = {}) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(
    <BillContextMenu
      bill={{
        orderId: 'order-1',
        orderNo: 'HC-SO-013493',
        href: '/revenue/fair/2026-09-01/orders/order-1',
        who: 'ANTHONY',
        action,
        exclusionDetail: action.kind === 'include' ? 'Taken out by Principal on 27 Sep 2026 — duplicate' : null,
      }}
      anchor={{ left: 200, top: 150, bottom: 150 }}
      monthLabel="September 2026"
      onClose={onClose}
      onDone={onDone}
      {...extra}
    />,
  )
  return { onClose, onDone, root: screen.getByRole('menu', { name: 'Actions for HC-SO-013493' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.excludeOrder.mockResolvedValue({ orderNo: 'HC-SO-013493', changed: true, openBillRank: null })
  mocks.includeOrder.mockResolvedValue({ orderNo: 'HC-SO-013493', changed: true, counts: true, stillOut: null, openBillRank: null })
})

describe('BillContextMenu', () => {
  it('takes a bill out only after its own confirmation, with the reason typed there', async () => {
    const { root, onDone } = menu({ kind: 'exclude' })
    // Choosing the row writes nothing — it opens the confirmation beside it.
    fireEvent.click(within(root).getByRole('menuitem', { name: /Don't count this bill/ }))
    expect(mocks.excludeOrder).not.toHaveBeenCalled()

    const confirm = screen.getByRole('dialog', { name: "Don't count HC-SO-013493" })
    expect(within(confirm).getByText(/as if the ERP had cancelled it/)).toBeInTheDocument()
    fireEvent.change(within(confirm).getByLabelText(/Why/), { target: { value: 'duplicate of HC-SO-013251' } })
    fireEvent.click(within(confirm).getByRole('button', { name: "Don't count this bill" }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mocks.excludeOrder).toHaveBeenCalledWith('order-1', 'duplicate of HC-SO-013251')
    expect(mocks.refresh).toHaveBeenCalled()
    expect(onDone.mock.calls[0][0]).toMatchObject({ orderId: 'order-1', orderNo: 'HC-SO-013493', excluded: true })
  })

  it('confirms from the keyboard with Enter in the reason', async () => {
    const { root, onDone } = menu({ kind: 'exclude' })
    fireEvent.click(within(root).getByRole('menuitem', { name: /Don't count this bill/ }))
    const confirm = screen.getByRole('dialog', { name: "Don't count HC-SO-013493" })
    fireEvent.keyDown(within(confirm).getByLabelText(/Why/), { key: 'Enter' })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mocks.excludeOrder).toHaveBeenCalledWith('order-1', '')
  })

  it('backs out of the confirmation without writing anything', () => {
    const { root, onClose } = menu({ kind: 'exclude' })
    fireEvent.click(within(root).getByRole('menuitem', { name: /Don't count this bill/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.excludeOrder).not.toHaveBeenCalled()
  })

  it('keeps a refusal in the panel, so it can be read and retried', async () => {
    mocks.excludeOrder.mockRejectedValue(new Error('The run for September 2026 has paid. Reopen it before changing which of its bills count.'))
    const { root, onDone } = menu({ kind: 'exclude' })
    fireEvent.click(within(root).getByRole('menuitem', { name: /Don't count this bill/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Don't count this bill" }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/has paid/)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('counts a bill taken out by hand again in one click, saying who took it out', async () => {
    const { root, onDone } = menu({ kind: 'include', stillOut: null })
    const row = within(root).getByRole('menuitem', { name: /Count this bill again/ })
    expect(row).toHaveTextContent('Taken out by Principal on 27 Sep 2026 — duplicate')
    fireEvent.click(row)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mocks.includeOrder).toHaveBeenCalledWith('order-1')
    expect(onDone.mock.calls[0][0]).toMatchObject({ excluded: false })
  })

  it('warns when counting again cannot bring the bill in', () => {
    const { root } = menu({ kind: 'include', stillOut: 'cancelled in the ERP' })
    expect(within(root).getByRole('menuitem', { name: /Count this bill again/ }))
      .toHaveTextContent('It still will not count: cancelled in the ERP')
  })

  it('offers nothing for a bill the ERP or the not-ours list keeps out', () => {
    const { root } = menu({ kind: 'unavailable', reason: 'Not our salesperson' })
    const row = within(root).getByRole('menuitem', { name: /Don't count this bill/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('Already not counted — Not our salesperson')
  })

  it('offers nothing once the month has paid, and says why', () => {
    const { root } = menu({ kind: 'locked', excludedByHand: true, reason: 'The run for September 2026 has paid — reopen it before changing which bills count' })
    const row = within(root).getByRole('menuitem', { name: /Count this bill again/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent(/has paid/)
  })

  it('opens the bill, here or in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { root, onClose } = menu({ kind: 'exclude' })
    fireEvent.click(within(root).getByRole('menuitem', { name: 'Open bill in new tab' }))
    expect(open).toHaveBeenCalledWith('/revenue/fair/2026-09-01/orders/order-1', '_blank', 'noopener')
    fireEvent.click(within(root).getByRole('menuitem', { name: 'Open bill' }))
    expect(mocks.push).toHaveBeenCalledWith('/revenue/fair/2026-09-01/orders/order-1')
    expect(onClose).toHaveBeenCalledTimes(2)
    open.mockRestore()
  })

  it('keeps the link the right-click landed on', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { root } = menu({ kind: 'exclude' }, { link: { href: '/revenue/fair/2026-09-01/orders?staff=s-1', label: 'ANTHONY' }, byRightClick: true })
    fireEvent.click(within(root).getByRole('menuitem', { name: /Open link in new tab/ }))
    expect(open).toHaveBeenCalledWith('/revenue/fair/2026-09-01/orders?staff=s-1', '_blank', 'noopener')
    expect(within(root).getByText(/Shift \+ right-click/)).toBeInTheDocument()
    open.mockRestore()
  })

  it('keeps its rows while the confirmation is open, so the panel does not jump under the pointer', () => {
    const { root } = menu({ kind: 'exclude' }, { byRightClick: true })
    const rowsBefore = root.children.length
    fireEvent.click(within(root).getByRole('menuitem', { name: /Don't count this bill/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(root.children.length).toBe(rowsBefore)
    expect(within(root).getByText(/Shift \+ right-click/)).toBeInTheDocument()
  })

  it('closes on a click anywhere else', () => {
    const { onClose } = menu({ kind: 'exclude' })
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })
})

// User 2026-09-30: right-click → Share, pick which salesperson and how many
// percent, Save — and the bill is on both of their ledgers.
describe('BillContextMenu — Share this bill…', () => {
  const TEAM = [
    { staffId: 'adrian', name: 'ADRIAN' },
    { staffId: 'anthony', name: 'ANTHONY' },
    { staffId: 'lucas', name: 'LUCAS', closed: 'closed for September 2026' },
  ]
  const alone = [{ staffId: 'adrian', name: 'ADRIAN', pct: 1 }]
  const halves = [{ staffId: 'adrian', name: 'ADRIAN', pct: 0.5 }, { staffId: 'anthony', name: 'ANTHONY', pct: 0.5 }]
  function shareMenu(parts = alone, kind: 'share' | 'locked' = 'share') {
    const onShareDone = vi.fn()
    const action = kind === 'share'
      ? { kind, ownerStaffId: 'adrian', ownerName: 'ADRIAN', parts }
      : { kind, ownerStaffId: 'adrian', ownerName: 'ADRIAN', parts, reason: 'The run for September 2026 has paid — reopen it before changing who shares this bill' }
    const rendered = menu({ kind: 'exclude' }, { share: { action, candidates: TEAM }, onShareDone })
    return { ...rendered, onShareDone }
  }
  const result = {
    orderId: 'order-1', orderNo: 'HC-SO-013493', changed: true, staffId: 'anthony', name: 'ANTHONY',
    before: null, after: 0.5, parts: halves,
  }

  it('asks who with and how much, starting at 50/50, and saves it', async () => {
    mocks.shareOrder.mockResolvedValue({ ok: true, result })
    const { root, onShareDone } = shareMenu()
    const row = within(root).getByRole('menuitem', { name: /Share this bill/ })
    expect(row).toHaveTextContent('With another salesperson — a part each')
    // Choosing the row writes nothing — it opens the form beside it.
    fireEvent.click(row)
    expect(mocks.shareOrder).not.toHaveBeenCalled()

    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    const who = within(panel).getByLabelText(/Share with/)
    // The owner is never offered; somebody closed this month is, greyed with why.
    expect(within(who).queryByRole('option', { name: 'ADRIAN' })).toBeNull()
    expect(within(who).getByRole('option', { name: 'LUCAS — closed for September 2026' })).toBeDisabled()
    expect(within(panel).getByLabelText(/Their part/)).toHaveValue(50)
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(who, { target: { value: 'anthony' } })
    expect(panel).toHaveTextContent('ADRIAN 50% · ANTHONY 50%')
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onShareDone).toHaveBeenCalled())
    expect(mocks.shareOrder).toHaveBeenCalledWith('order-1', 'anthony', 0.5)
    expect(mocks.refresh).toHaveBeenCalled()
    expect(onShareDone.mock.calls[0][0]).toMatchObject({ orderId: 'order-1', orderNo: 'HC-SO-013493', result })
  })

  it('takes another part, and saves from the keyboard with Enter', async () => {
    mocks.shareOrder.mockResolvedValue({ ok: true, result: { ...result, after: 0.3, parts: [{ ...halves[0], pct: 0.7 }, { ...halves[1], pct: 0.3 }] } })
    const { root, onShareDone } = shareMenu()
    fireEvent.click(within(root).getByRole('menuitem', { name: /Share this bill/ }))
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 'anthony' } })
    const part = within(panel).getByLabelText(/Their part/)
    fireEvent.change(part, { target: { value: '30' } })
    expect(panel).toHaveTextContent('ADRIAN 70% · ANTHONY 30%')
    fireEvent.keyDown(part, { key: 'Enter' })
    await waitFor(() => expect(onShareDone).toHaveBeenCalled())
    expect(mocks.shareOrder).toHaveBeenCalledWith('order-1', 'anthony', 0.3)
  })

  it('never lets the shares leave the owner nothing', () => {
    const { root } = shareMenu(halves)
    fireEvent.click(within(root).getByRole('menuitem', { name: /Share this bill/ }))
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    // Somebody new starts at half of what the owner still keeps.
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 'lucas' } })
    expect(within(panel).getByLabelText(/Their part/)).toHaveValue(25)
    fireEvent.change(within(panel).getByLabelText(/Their part/), { target: { value: '50' } })
    expect(panel).toHaveTextContent('That leaves ADRIAN nothing — the owner always keeps a part.')
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('names who holds it already, changes their part from theirs, and lets a part go', async () => {
    mocks.unshareOrder.mockResolvedValue({ ok: true, result: { ...result, before: 0.5, after: null, parts: alone } })
    const { root, onShareDone } = shareMenu(halves)
    const row = within(root).getByRole('menuitem', { name: /Share this bill/ })
    expect(row).toHaveTextContent('ADRIAN 50% · ANTHONY 50%')
    fireEvent.click(row)
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    expect(within(within(panel).getByLabelText(/Share with/)).getByRole('option', { name: 'ANTHONY — holds 50%' })).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 'anthony' } })
    expect(within(panel).getByLabelText(/Their part/)).toHaveValue(50)

    fireEvent.click(within(panel).getByRole('button', { name: /Stop sharing with ANTHONY/ }))
    await waitFor(() => expect(onShareDone).toHaveBeenCalled())
    expect(mocks.unshareOrder).toHaveBeenCalledWith('order-1', 'anthony')
  })

  it('keeps a refusal in the panel', async () => {
    mocks.shareOrder.mockResolvedValue({ ok: false, reason: 'ANTHONY’s September 2026 is closed. Reopen it on Comm Cal before giving ANTHONY a part of this bill.' })
    const { root, onShareDone } = shareMenu()
    fireEvent.click(within(root).getByRole('menuitem', { name: /Share this bill/ }))
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 'anthony' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/is closed/)
    expect(onShareDone).not.toHaveBeenCalled()
  })

  it('backs out without writing anything', () => {
    const { root, onClose } = shareMenu()
    fireEvent.click(within(root).getByRole('menuitem', { name: /Share this bill/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.shareOrder).not.toHaveBeenCalled()
  })

  it('offers nothing once the month has paid, and says why', () => {
    const { root } = shareMenu(halves, 'locked')
    const row = within(root).getByRole('menuitem', { name: /Share this bill/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('ADRIAN 50% · ANTHONY 50%')
    expect(row).toHaveTextContent('The run for September 2026 has paid')
  })

  it('has no share row where none is offered', () => {
    const { root } = menu({ kind: 'exclude' })
    expect(within(root).queryByRole('menuitem', { name: /Share this bill/ })).toBeNull()
  })
})
