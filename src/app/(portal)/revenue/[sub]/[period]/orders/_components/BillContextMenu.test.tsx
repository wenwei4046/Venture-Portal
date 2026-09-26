import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'

const mocks = vi.hoisted(() => ({
  excludeOrder: vi.fn(),
  includeOrder: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('../../../../run-actions', () => ({ excludeOrder: mocks.excludeOrder, includeOrder: mocks.includeOrder }))
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
