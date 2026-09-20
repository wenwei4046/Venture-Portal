import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import EmployeeRemovalMenu from './EmployeeRemovalMenu'

const actions = vi.hoisted(() => ({
  moveEmployee: vi.fn(), removeEmployeeMembership: vi.fn(), terminateEmployee: vi.fn(),
}))
vi.mock('../../../employee-actions', () => actions)

function destination(extra: Partial<MembershipDestination> = {}): MembershipDestination {
  return {
    subDepartmentId: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue',
    departmentName: 'Revenue', schemeId: 'ir-scheme', createdAt: '2026-09-10T00:00:00Z', isHome: false,
    titles: [{ id: 'specialist', name: 'Revenue Specialist' }, { id: 'leader', name: 'Team Leader' }],
    homeStaffIds: [], memberStaffIds: [], eligibleStaffIds: ['mei'], unavailableReason: null,
    ...extra,
  }
}

function destinations(): MembershipDestination[] {
  return [
    destination({
      subDepartmentId: 'fair', name: 'Fair', slug: 'fair', schemeId: 'fair-scheme',
      createdAt: '2026-08-31T00:00:00Z', isHome: true, homeStaffIds: ['mei'], memberStaffIds: ['mei'],
    }),
    destination({ memberStaffIds: ['mei'] }),
    destination({ subDepartmentId: 'events', name: 'Events', slug: 'events', schemeId: 'events-scheme', createdAt: '2026-09-12T00:00:00Z' }),
    destination({ subDepartmentId: 'retail', name: 'Retail', slug: 'retail', schemeId: 'retail-scheme', createdAt: '2026-09-14T00:00:00Z', memberStaffIds: ['mei'] }),
  ]
}

function setup(extra: Partial<ComponentProps<typeof EmployeeRemovalMenu>> = {}) {
  const callbacks = {
    onStackedChange: vi.fn(), onBusyChange: vi.fn(), onBack: vi.fn(), onClose: vi.fn(), onDone: vi.fn(),
  }
  const options = destinations()
  render(<EmployeeRemovalMenu person={{ staffId: 'mei', name: 'Mei Ting', titleId: 'specialist' }}
    currentDepartment={{ schemeId: 'ir-scheme', name: 'IR', isHome: false }} destinations={options}
    employeeDepartments={[
      { id: 'revenue', name: 'Revenue', titles: [{ id: 'specialist', name: 'Revenue Specialist' }] },
      { id: 'hr', name: 'HR', titles: [{ id: 'hr-executive', name: 'HR Executive' }] },
    ]}
    canManageEmployment employmentToday="2026-09-20" anchor={{ left: 200, right: 440, top: 150, bottom: 184, parentTop: 120 }} focus
    {...callbacks} {...extra} />)
  return { ...callbacks, options }
}

function rootMenu() { return screen.getByRole('menu', { name: 'Remove Mei Ting' }) }
function moveChoices() {
  fireEvent.click(within(rootMenu()).getByRole('menuitem', { name: 'Move to other department' }))
  return screen.getByRole('menu', { name: 'Move Mei Ting to department' })
}
function newestPanel() { return screen.queryByRole('dialog') ?? screen.getAllByRole('menu').at(-1)! }
function confirmAction() { return within(screen.getByRole('dialog')).getByRole('button', { name: /^Confirm/ }) }
function expectNoWrites() {
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
}
function payloadOf(action: ReturnType<typeof vi.fn>) {
  return Object.fromEntries((action.mock.calls.at(-1)![0] as FormData).entries())
}

// happy-dom has no layout; give the real cascading panels browser-like geometry.
function menuGeometry(width: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('innerHeight', 800)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (['menu', 'dialog'].includes(this.getAttribute('role') ?? '')) return new DOMRect(parseFloat(this.style.left), parseFloat(this.style.top), 240, 240)
    const panel = this.closest<HTMLElement>('[role="menu"], [role="dialog"]')
    if (!panel) return new DOMRect()
    const rect = panel.getBoundingClientRect()
    const index = [...panel.querySelectorAll('button')].indexOf(this as HTMLButtonElement)
    return new DOMRect(rect.left + 8, rect.top + 30 + index * 34, 224, 34)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true, note: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('EmployeeRemovalMenu', () => {
  it.each([
    { side: 'right', viewport: 1400, left: 200 },
    { side: 'left', viewport: 800, left: 100 },
  ])('keeps the confirmation adjacent on the $side without writing', ({ side, viewport, left }) => {
    menuGeometry(viewport)
    setup({ anchor: { left, right: left + 240, top: 150, bottom: 184, parentTop: 120 } })
    const root = rootMenu()
    const item = within(root).getByRole('menuitem', { name: 'Remove from this department' })
    fireEvent.click(item)
    const panel = newestPanel()
    expect(root).toBeVisible()
    expect(panel).not.toBe(root)
    expect(panel.getBoundingClientRect().top).toBe(item.getBoundingClientRect().top)
    if (side === 'right') expect(panel.getBoundingClientRect().left).toBe(root.getBoundingClientRect().right - 1)
    else expect(panel.getBoundingClientRect().right).toBe(root.getBoundingClientRect().left + 1)
    expectNoWrites()
  })

  it('does not write while hovering or navigating the removal choices', () => {
    setup()
    for (const item of within(rootMenu()).getAllByRole('menuitem')) fireEvent.mouseEnter(item)
    const choices = moveChoices()
    fireEvent.mouseEnter(within(choices).getByRole('menuitem', { name: 'Events' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expectNoWrites()
  })

  it('makes termination and moves to another main department unavailable without People permission', () => {
    setup({ canManageEmployment: false })
    expect(within(rootMenu()).getByRole('menuitem', { name: /^Terminate employee/ })).toBeDisabled()
    const choices = moveChoices()
    expect(within(choices).queryByRole('menuitem', { name: 'HR' })).not.toBeInTheDocument()
    expect(choices).toHaveTextContent('Moving to another main department requires People Management permission.')
    expect(within(choices).getByRole('menuitem', { name: 'Events' })).toBeEnabled()
    expectNoWrites()
  })

  /**
   * A cascade that never closes a branch leaves two open at once, and the
   * panel the pointer has walked away from is the one covering what it wants.
   * The rows this happens on are usually the greyed-out ones, which fire no
   * hover of their own — so the PANEL hears it and closes the branch.
   */
  it('closes the move list when the pointer walks onto another row, disabled ones included', () => {
    setup({ currentDepartment: { schemeId: 'fair-scheme', name: 'Fair', isHome: true },
      destinations: destinations().map(item => item.schemeId === 'fair-scheme'
        ? item : { ...item, memberStaffIds: [] }) })
    // Fair is their only department here, so the removal row below is disabled.
    fireEvent.mouseEnter(within(rootMenu()).getByRole('menuitem', { name: 'Move to other department' }))
    expect(screen.getByRole('menu', { name: 'Move Mei Ting to department' })).toBeInTheDocument()

    const removal = within(rootMenu()).getByRole('menuitem', { name: /^Remove from this department/ })
    expect(removal).toBeDisabled()
    fireEvent.mouseOver(removal)
    expect(screen.queryByRole('menu', { name: 'Move Mei Ting to department' })).not.toBeInTheDocument()
    expectNoWrites()
  })

  it('keeps a branch the pointer opened while the pointer is still inside it', () => {
    setup()
    const choices = moveChoices()
    fireEvent.mouseOver(within(choices).getByRole('menuitem', { name: 'Events' }))
    expect(screen.getByRole('menu', { name: 'Move Mei Ting to department' })).toBeInTheDocument()
    expectNoWrites()
  })

  it('leaves the department somebody is based in, naming the oldest one they keep working in as their new base', () => {
    setup({ currentDepartment: { schemeId: 'fair-scheme', name: 'Fair', isHome: true } })
    const removal = within(rootMenu()).getByRole('menuitem', { name: /^Remove from this department/ })
    expect(removal).toBeEnabled()
    // IR (2026-09-10) is older than Retail (2026-09-14), and it is the one the
    // database moves the base to, so it is the one the menu may name.
    expect(removal).toHaveTextContent('Their base moves to IR')
    const choices = moveChoices()
    expect(within(choices).getByRole('menuitem', { name: 'IR' })).toBeEnabled()
    expect(within(choices).getByRole('menuitem', { name: 'Events' })).toBeEnabled()
    expect(within(choices).getByRole('menuitem', { name: 'HR' })).toBeEnabled()
    expectNoWrites()
  })

  it('sends somebody who works nowhere else to Terminate employee instead of removing their only department', () => {
    setup({
      currentDepartment: { schemeId: 'fair-scheme', name: 'Fair', isHome: true },
      destinations: destinations().map(item => item.schemeId === 'fair-scheme'
        ? item : { ...item, memberStaffIds: [] }),
    })
    const removal = within(rootMenu()).getByRole('menuitem', { name: /^Remove from this department/ })
    expect(removal).toBeDisabled()
    expect(removal).toHaveTextContent('the only department Mei Ting works in')
    expect(removal).toHaveTextContent('Terminate employee')
    expect(within(rootMenu()).getByRole('menuitem', { name: /^Terminate employee/ })).toBeEnabled()
    expectNoWrites()
  })

  it('confirms a removal by saying where the base and the company line are going', async () => {
    const { onDone } = setup({ currentDepartment: { schemeId: 'fair-scheme', name: 'Fair', isHome: true } })
    fireEvent.click(within(rootMenu()).getByRole('menuitem', { name: /^Remove from this department/ }))
    expect(newestPanel()).toHaveTextContent('IR')
    expect(newestPanel()).toHaveTextContent(/becomes the department they are based in/)
    expect(newestPanel()).toHaveTextContent(/company reporting line follows them/)
    expectNoWrites()
    actions.removeEmployeeMembership.mockResolvedValueOnce({ ok: true, note: null })
    fireEvent.click(confirmAction())
    await waitFor(() => expect(actions.removeEmployeeMembership).toHaveBeenCalledOnce())
    expect(payloadOf(actions.removeEmployeeMembership)).toEqual({
      staff_id: 'mei', source_scheme_id: 'fair-scheme',
    })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('requires confirmation to move to a new sibling membership and sends the source, destination and selected title', async () => {
    const { onDone, options } = setup()
    const original = structuredClone(options)
    const choices = moveChoices()
    expect(within(choices).getByRole('menuitem', { name: 'IR' })).toBeDisabled()
    fireEvent.click(within(choices).getByRole('menuitem', { name: 'Events' }))
    fireEvent.click(within(newestPanel()).getByRole('menuitem', { name: 'Team Leader' }))
    expect(newestPanel()).toHaveTextContent('IR')
    expect(newestPanel()).toHaveTextContent('Events')
    expectNoWrites()
    fireEvent.click(confirmAction())
    await waitFor(() => expect(actions.moveEmployee).toHaveBeenCalledOnce())
    expect(payloadOf(actions.moveEmployee)).toEqual({
      staff_id: 'mei', source_scheme_id: 'ir-scheme', destination_kind: 'subdepartment',
      destination_id: 'events-scheme', title_id: 'leader',
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(options).toEqual(original)
    expect(actions.removeEmployeeMembership).not.toHaveBeenCalled()
    expect(actions.terminateEmployee).not.toHaveBeenCalled()
  })

  it('can move to an existing destination membership without replacing its title or upline', async () => {
    setup()
    const target = within(moveChoices()).getByRole('menuitem', { name: 'Retail' })
    expect(target).toBeEnabled()
    fireEvent.click(target)
    expect(newestPanel()).toHaveTextContent(/keep|preserv|retain/i)
    expect(within(newestPanel()).queryByRole('menuitem', { name: 'Team Leader' })).not.toBeInTheDocument()
    expectNoWrites()
    fireEvent.click(confirmAction())
    await waitFor(() => expect(actions.moveEmployee).toHaveBeenCalledOnce())
    expect(payloadOf(actions.moveEmployee)).toEqual({
      staff_id: 'mei', source_scheme_id: 'ir-scheme', destination_kind: 'subdepartment', destination_id: 'retail-scheme',
    })
  })

  it('confirms a move to another main department with its destination title', async () => {
    setup()
    fireEvent.click(within(moveChoices()).getByRole('menuitem', { name: 'HR' }))
    fireEvent.click(within(newestPanel()).getByRole('menuitem', { name: 'HR Executive' }))
    expect(newestPanel()).toHaveTextContent('HR')
    expect(newestPanel()).toHaveTextContent(/membership|roster|company/i)
    expectNoWrites()
    fireEvent.click(confirmAction())
    await waitFor(() => expect(actions.moveEmployee).toHaveBeenCalledOnce())
    expect(payloadOf(actions.moveEmployee)).toEqual({
      staff_id: 'mei', source_scheme_id: 'ir-scheme', destination_kind: 'department',
      destination_id: 'hr', title_id: 'hr-executive',
    })
  })

  it('lets removal confirmation be cancelled, then removes only the selected membership on confirmation', async () => {
    const { onDone } = setup()
    const remove = within(rootMenu()).getByRole('menuitem', { name: 'Remove from this department' })
    fireEvent.click(remove)
    expect(newestPanel()).toHaveTextContent('IR')
    expectNoWrites()
    fireEvent.click(within(newestPanel()).getByRole('button', { name: 'Cancel' }))
    expect(onDone).not.toHaveBeenCalled()
    expectNoWrites()
    fireEvent.click(remove)
    fireEvent.click(confirmAction())
    await waitFor(() => expect(actions.removeEmployeeMembership).toHaveBeenCalledOnce())
    expect(payloadOf(actions.removeEmployeeMembership)).toEqual({ staff_id: 'mei', source_scheme_id: 'ir-scheme' })
    expect(actions.moveEmployee).not.toHaveBeenCalled()
    expect(actions.terminateEmployee).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('requires explicit termination confirmation and submits the chosen last working day', async () => {
    const { onDone } = setup()
    fireEvent.click(within(rootMenu()).getByRole('menuitem', { name: /^Terminate employee/ }))
    const lastDay = screen.getByLabelText('Last working day')
    expect(lastDay).toHaveValue('2026-09-20')
    fireEvent.change(lastDay, { target: { value: '2026-09-19' } })
    expectNoWrites()
    fireEvent.click(confirmAction())
    await waitFor(() => expect(actions.terminateEmployee).toHaveBeenCalledOnce())
    expect(payloadOf(actions.terminateEmployee)).toEqual({
      staff_id: 'mei', source_scheme_id: 'ir-scheme', resignation_date: '2026-09-19',
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(actions.moveEmployee).not.toHaveBeenCalled()
    expect(actions.removeEmployeeMembership).not.toHaveBeenCalled()
  })

  it('blocks duplicate confirmation and navigation while pending, then retains a refusal for retry', async () => {
    let finish!: (result: { ok: false; note: string }) => void
    actions.removeEmployeeMembership.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const { onBusyChange, onClose, onBack, onDone } = setup()
    fireEvent.click(within(rootMenu()).getByRole('menuitem', { name: 'Remove from this department' }))
    const panel = newestPanel()
    const confirm = confirmAction()
    fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(confirm)
    fireEvent.keyDown(panel, { key: 'Escape' })
    fireEvent.keyDown(rootMenu(), { key: 'ArrowLeft' })
    fireEvent.keyDown(panel, { key: 'Tab' })
    expect(panel).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
    expect(actions.removeEmployeeMembership).toHaveBeenCalledOnce()

    await act(async () => { finish({ ok: false, note: 'Move their downlines first.' }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Move their downlines first.')
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
    expect(panel).toBeVisible()
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(actions.removeEmployeeMembership).toHaveBeenCalledTimes(2)
  })
})
