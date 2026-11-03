import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'
import type { BillMoveAction } from '@/lib/commission/bill-move'

const mocks = vi.hoisted(() => ({
  excludeOrder: vi.fn(),
  includeOrder: vi.fn(),
  shareOrder: vi.fn(),
  unshareOrder: vi.fn(),
  moveOrder: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('../../../../run-actions', () => ({
  excludeOrder: mocks.excludeOrder, includeOrder: mocks.includeOrder,
  shareOrder: mocks.shareOrder, unshareOrder: mocks.unshareOrder, moveOrder: mocks.moveOrder,
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
  mocks.excludeOrder.mockResolvedValue({ orderNo: 'HC-SO-013493', changed: true })
  mocks.includeOrder.mockResolvedValue({ orderNo: 'HC-SO-013493', changed: true, counts: true, stillOut: null })
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
    expect(row).toHaveAttribute('title', expect.stringContaining('Taken out by Principal on 27 Sep 2026 — duplicate'))
    fireEvent.click(row)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mocks.includeOrder).toHaveBeenCalledWith('order-1')
    expect(onDone.mock.calls[0][0]).toMatchObject({ excluded: false })
  })

  it('warns when counting again cannot bring the bill in', () => {
    const { root } = menu({ kind: 'include', stillOut: 'cancelled in the ERP' })
    expect(within(root).getByRole('menuitem', { name: /Count this bill again/ }))
      .toHaveAttribute('title', expect.stringContaining('It still will not count: cancelled in the ERP'))
  })

  it('offers nothing for a bill the ERP or the not-ours list keeps out', () => {
    const { root } = menu({ kind: 'unavailable', reason: 'Not our salesperson' })
    const row = within(root).getByRole('menuitem', { name: /Don't count this bill/ })
    expect(row).toBeDisabled()
    expect(row).toHaveAttribute('title', expect.stringContaining('Already not counted — Not our salesperson'))
  })

  it('offers nothing once the month has paid, and says why', () => {
    const { root } = menu({ kind: 'locked', excludedByHand: true, reason: 'The run for September 2026 has paid — reopen it before changing which bills count' })
    const row = within(root).getByRole('menuitem', { name: /Count this bill again/ })
    expect(row).toBeDisabled()
    expect(row).toHaveAttribute('title', expect.stringMatching(/has paid/))
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
    const { root } = menu({ kind: 'exclude' }, { link: { href: '/revenue/fair/2026-09-01/orders?staff=s-1', label: 'ANTHONY' } })
    fireEvent.click(within(root).getByRole('menuitem', { name: /Open link in new tab/ }))
    expect(open).toHaveBeenCalledWith('/revenue/fair/2026-09-01/orders?staff=s-1', '_blank', 'noopener')
    // One line a row (2026-10-12): the link it landed on is the row's tooltip.
    expect(within(root).getByRole('menuitem', { name: 'Open link in new tab' })).toHaveAttribute('title', 'ANTHONY')
    open.mockRestore()
  })

  it('keeps its rows while the confirmation is open, so the panel does not jump under the pointer', () => {
    const { root } = menu({ kind: 'exclude' })
    const rowsBefore = root.children.length
    fireEvent.click(within(root).getByRole('menuitem', { name: /Don't count this bill/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(root.children.length).toBe(rowsBefore)
    // No hint under the rows any more: the panel is its rows (2026-10-12).
    expect(within(root).queryByText(/Shift \+ right-click/)).toBeNull()
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
    // One line, no description under it (2026-10-12: "make it clean and nice").
    expect(row.textContent).toBe('Share this bill…')
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

  // Part 1 (2026-10-11): Share with is the soft dropdown, its menu on <body> —
  // outside the bill menu, which closes on a press or a scroll outside itself.
  it('picks from the soft menu without the bill menu closing under it', () => {
    const { root, onClose } = shareMenu()
    fireEvent.click(within(root).getByRole('menuitem', { name: /Share this bill/ }))
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    const who = within(panel).getByLabelText(/Share with/)
    fireEvent.mouseDown(who, { button: 0 })
    const list = screen.getByRole('listbox')
    const anthony = within(list).getByRole('option', { name: /ANTHONY/ })
    fireEvent.pointerDown(anthony)
    fireEvent.scroll(list)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(anthony)
    expect(who).toHaveValue('anthony')
    expect(panel).toHaveTextContent('ADRIAN 50% · ANTHONY 50%')
    // A press anywhere else still closes it.
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalled()
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
    expect(row).toHaveAttribute('title', expect.stringContaining('ADRIAN 50% · ANTHONY 50%'))
    fireEvent.click(row)
    const panel = screen.getByRole('dialog', { name: 'Share HC-SO-013493' })
    expect(within(within(panel).getByLabelText(/Share with/)).getByRole('option', { name: 'ANTHONY — holds 50%' })).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText(/Share with/), { target: { value: 'anthony' } })
    expect(within(panel).getByLabelText(/Their part/)).toHaveValue(50)

    fireEvent.click(within(panel).getByRole('button', { name: /Cancel share with ANTHONY/ }))
    await waitFor(() => expect(onShareDone).toHaveBeenCalled())
    expect(mocks.unshareOrder).toHaveBeenCalledWith('order-1', 'anthony')
  })

  // 2026-10-12 — the user: "for those shared bill, can pick cancel share as
  // well — at ADRIAN's side press cancel share to ANTHONY, then ANTHONY's side
  // will not have the share".
  it('cancels a share in one click from the menu itself, one line per holder', async () => {
    mocks.unshareOrder.mockResolvedValue({ ok: true, result: { ...result, before: 0.5, after: null, parts: alone } })
    const { root, onShareDone } = shareMenu(halves)
    const rows = within(root).getAllByRole('menuitem').map(r => r.textContent)
    expect(rows.slice(rows.indexOf('Share this bill…'), rows.indexOf('Share this bill…') + 2))
      .toEqual(['Share this bill…', 'Cancel share with ANTHONY'])
    const cancel = within(root).getByRole('menuitem', { name: 'Cancel share with ANTHONY' })
    expect(cancel).toHaveAttribute('title', 'ADRIAN takes the 50% back')
    fireEvent.click(cancel)
    // Nothing to confirm: it writes, and the notice offers Undo.
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(onShareDone).toHaveBeenCalled())
    expect(mocks.unshareOrder).toHaveBeenCalledWith('order-1', 'anthony')
    expect(onShareDone.mock.calls[0][0]).toMatchObject({ orderId: 'order-1', result: { after: null } })
  })

  it('has a cancel line for every holder', () => {
    const { root } = shareMenu([{ staffId: 'adrian', name: 'ADRIAN', pct: 0.5 },
      { staffId: 'anthony', name: 'ANTHONY', pct: 0.3 }, { staffId: 'lucas', name: 'LUCAS', pct: 0.2 }])
    expect(within(root).getAllByRole('menuitem', { name: /^Cancel share with/ }).map(r => r.textContent))
      .toEqual(['Cancel share with ANTHONY', 'Cancel share with LUCAS'])
  })

  it('has no cancel line on a bill nobody shares', () => {
    const { root } = shareMenu(alone)
    expect(within(root).queryByRole('menuitem', { name: /Cancel share/ })).toBeNull()
  })

  it('shuts the cancel line, with why, once the month has paid', () => {
    const { root } = shareMenu(halves, 'locked')
    const cancel = within(root).getByRole('menuitem', { name: 'Cancel share with ANTHONY' })
    expect(cancel).toBeDisabled()
    expect(cancel).toHaveAttribute('title', expect.stringContaining('The run for September 2026 has paid'))
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
    expect(row).toHaveAttribute('title', expect.stringContaining('ADRIAN 50% · ANTHONY 50%'))
    expect(row).toHaveAttribute('title', expect.stringContaining('The run for September 2026 has paid'))
  })

  it('has no share row where none is offered', () => {
    const { root } = menu({ kind: 'exclude' })
    expect(within(root).queryByRole('menuitem', { name: /Share this bill/ })).toBeNull()
  })
})


// 2026-10-12 — the user: "together with rightclick … can select move this
// order to other sales person".
describe('BillContextMenu — Move to another salesperson…', () => {
  const TEAM = [
    { staffId: 'adrian', name: 'ADRIAN' },
    { staffId: 'anthony', name: 'ANTHONY' },
    { staffId: 'lucas', name: 'LUCAS', closed: 'closed for September 2026' },
  ]
  const OWNER = { staffId: 'adrian', name: 'ADRIAN' }
  const moved = (over = {}) => ({
    orderId: 'order-1', orderNo: 'HC-SO-013493', changed: true,
    to: { staffId: 'anthony', name: 'ANTHONY' }, from: OWNER, movedBack: false,
    shareTaken: null, shareBack: null, shareNotBack: null, ...over,
  })
  function moveMenu(action: BillMoveAction = { kind: 'move', owner: OWNER, named: null },
    parts: { staffId: string; name: string; pct: number }[] | null = null) {
    const onMoveDone = vi.fn()
    const share = parts ? { action: { kind: 'share' as const, ownerStaffId: 'adrian', ownerName: 'ADRIAN', parts }, candidates: TEAM } : null
    const rendered = menu({ kind: 'exclude' }, { move: { action, candidates: TEAM }, share, onMoveDone })
    return { ...rendered, onMoveDone }
  }

  it('marks a holder in the list — moved to them, all of it is theirs', () => {
    const { root } = moveMenu(undefined, [{ staffId: 'adrian', name: 'ADRIAN', pct: 0.5 }, { staffId: 'anthony', name: 'ANTHONY', pct: 0.5 }])
    fireEvent.click(within(root).getByRole('menuitem', { name: /Move to another salesperson/ }))
    const panel = screen.getByRole('dialog', { name: 'Move HC-SO-013493' })
    expect(panel).toHaveTextContent("ADRIAN's bill, shared ADRIAN 50% · ANTHONY 50%.")
    expect(within(within(panel).getByLabelText(/Move to/)).getByRole('option', { name: 'ANTHONY — holds 50%' })).toBeInTheDocument()
  })

  it('is one line, and asks whom and why before it moves anything', async () => {
    mocks.moveOrder.mockResolvedValue({ ok: true, result: moved() })
    const { root, onMoveDone } = moveMenu()
    const row = within(root).getByRole('menuitem', { name: /Move to another salesperson/ })
    expect(row.textContent).toBe('Move to another salesperson…')
    fireEvent.click(row)
    expect(mocks.moveOrder).not.toHaveBeenCalled()

    const panel = screen.getByRole('dialog', { name: 'Move HC-SO-013493' })
    const who = within(panel).getByLabelText(/Move to/)
    // Whoever has it is never offered; somebody closed this month is, greyed with why.
    expect(within(who).queryByRole('option', { name: 'ADRIAN' })).toBeNull()
    expect(within(who).getByRole('option', { name: 'LUCAS — closed for September 2026' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'Move' })).toBeDisabled()

    fireEvent.change(who, { target: { value: 'anthony' } })
    fireEvent.change(within(panel).getByLabelText(/Why/), { target: { value: 'keyed under the wrong name' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Move to ANTHONY' }))
    await waitFor(() => expect(onMoveDone).toHaveBeenCalled())
    expect(mocks.moveOrder).toHaveBeenCalledWith('order-1', 'anthony', 'keyed under the wrong name')
    expect(mocks.refresh).toHaveBeenCalled()
    expect(onMoveDone.mock.calls[0][0]).toMatchObject({ result: { to: { name: 'ANTHONY' } } })
  })

  it('keeps a refusal in the panel', async () => {
    mocks.moveOrder.mockResolvedValue({ ok: false, reason: 'ANTHONY’s September 2026 is closed — reopen it before moving this bill' })
    const { root, onMoveDone } = moveMenu()
    fireEvent.click(within(root).getByRole('menuitem', { name: /Move to another salesperson/ }))
    const panel = screen.getByRole('dialog', { name: 'Move HC-SO-013493' })
    fireEvent.change(within(panel).getByLabelText(/Move to/), { target: { value: 'anthony' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Move to ANTHONY' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/is closed/)
    expect(onMoveDone).not.toHaveBeenCalled()
  })

  it('gives a moved bill back to the salesperson the ERP names', async () => {
    mocks.moveOrder.mockResolvedValue({ ok: true, result: moved({ to: OWNER, from: { staffId: 'anthony', name: 'ANTHONY' }, movedBack: true }) })
    const { root, onMoveDone } = moveMenu({ kind: 'move', owner: { staffId: 'anthony', name: 'ANTHONY' }, named: OWNER })
    const row = within(root).getByRole('menuitem', { name: /Move to another salesperson/ })
    expect(row).toHaveAttribute('title', 'Moved here from ADRIAN')
    fireEvent.click(row)
    const panel = screen.getByRole('dialog', { name: 'Move HC-SO-013493' })
    expect(panel).toHaveTextContent('the ERP names ADRIAN')
    fireEvent.click(within(panel).getByRole('button', { name: 'Give it back to ADRIAN' }))
    await waitFor(() => expect(onMoveDone).toHaveBeenCalled())
    expect(mocks.moveOrder).toHaveBeenCalledWith('order-1', 'adrian', '')
  })

  it('is shut, with why, where the bill cannot move', () => {
    const { root } = moveMenu({ kind: 'locked', owner: OWNER, named: null, reason: 'The run for September 2026 has paid — reopen it before moving its bills' })
    const row = within(root).getByRole('menuitem', { name: /Move to another salesperson/ })
    expect(row).toBeDisabled()
    expect(row).toHaveAttribute('title', 'The run for September 2026 has paid — reopen it before moving its bills')
  })
})
