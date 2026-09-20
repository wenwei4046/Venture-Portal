import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import PersonContextMenu from './PersonContextMenu'

const actions = vi.hoisted(() => ({ addMember: vi.fn(), changeMemberTitle: vi.fn() }))
vi.mock('../../../hierarchy-actions', () => actions)
vi.mock('../../../employee-actions', () => ({ moveEmployee: vi.fn(), removeEmployeeMembership: vi.fn(), terminateEmployee: vi.fn() }))

const person = { staffId: 'mei', name: 'Mei Ting', titleId: 'specialist' as string | null, titleName: 'Revenue Specialist' }

function destination(extra: Partial<MembershipDestination> = {}): MembershipDestination {
  return {
    subDepartmentId: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue',
    departmentName: 'Revenue', schemeId: 'ir-scheme', createdAt: '2026-09-10T00:00:00Z', isHome: false,
    homeStaffIds: [],
    titles: [{ id: 'specialist', name: 'Revenue Specialist' }, { id: 'leader', name: 'Team Leader' }],
    memberStaffIds: [], eligibleStaffIds: ['mei'], unavailableReason: null,
    ...extra,
  }
}

function destinations(): MembershipDestination[] {
  return [
    destination({
      subDepartmentId: 'fair', name: 'Fair', slug: 'fair', schemeId: 'fair-scheme',
      createdAt: '2026-08-31T00:00:00Z', isHome: true, homeStaffIds: ['mei'], memberStaffIds: ['mei'],
      titles: [{ id: 'specialist', name: 'Revenue Specialist' }],
    }),
    destination(),
    destination({ subDepartmentId: 'events', name: 'Events', slug: 'events', schemeId: 'events-scheme', memberStaffIds: ['mei'] }),
  ]
}

function setup(options: MembershipDestination[] = destinations(), startAtDepartments = false,
  anchor = { left: 200, top: 150, bottom: 150 }, selectedPerson = person,
  currentDepartment?: { schemeId: string; name: string; isHome: boolean }) {
  const onClose = vi.fn(), onAdded = vi.fn(), onUpline = vi.fn()
  render(<PersonContextMenu person={selectedPerson} destinations={options} anchor={anchor} currentDepartment={currentDepartment}
    startAtDepartments={startAtDepartments} onClose={onClose} onAdded={onAdded} onUpline={onUpline} />)
  return { onClose, onAdded, onUpline }
}

function openDestinations() {
  fireEvent.click(within(screen.getByRole('menu', { name: 'Actions for Mei Ting' }))
    .getByRole('menuitem', { name: /Add to department/ }))
  return screen.getByRole('menu', { name: 'Add Mei Ting to department' })
}

function openTitles() {
  fireEvent.click(within(openDestinations()).getByRole('menuitem', { name: 'IR' }))
  return screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.addMember.mockResolvedValue({ ok: true, note: null })
  actions.changeMemberTitle.mockResolvedValue({ ok: true, note: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// happy-dom does not lay out menus. Simulate fixed-size panels at their actual
// inline positions so submenu placement uses the same parent geometry as a browser.
function menuGeometry(viewportWidth: number) {
  vi.stubGlobal('innerWidth', viewportWidth)
  vi.stubGlobal('innerHeight', 700)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') === 'menu') {
      return new DOMRect(parseFloat(this.style.left), parseFloat(this.style.top), 240, 200)
    }
    const panel = this.closest<HTMLElement>('[role="menu"]')
    if (panel) {
      const rect = panel.getBoundingClientRect()
      const index = [...panel.querySelectorAll('button')].indexOf(this as HTMLButtonElement)
      return new DOMRect(rect.left + 8, rect.top + 30 + index * 34, 224, 34)
    }
    return new DOMRect()
  })
}

describe('PersonContextMenu cascading membership actions', () => {
  it('flips a submenu to the left when the right edge has no room', () => {
    menuGeometry(800)
    setup(destinations(), false, { left: 500, top: 150, bottom: 150 })
    const root = screen.getByRole('menu', { name: 'Actions for Mei Ting' })
    const add = within(root).getByRole('menuitem', { name: /Add to department/ })
    const rowTop = add.getBoundingClientRect().top
    const choices = openDestinations()

    expect(choices).toHaveStyle({ left: '261px', top: `${rowTop}px` })
    expect(choices.getBoundingClientRect().right).toBe(root.getBoundingClientRect().left + 1)
    expect(root).toBeVisible()
    expect(within(choices).queryByRole('menuitem', { name: /Back/ })).not.toBeInTheDocument()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it('replaces the parent when neither side fits, and Back restores its visible focused row', () => {
    menuGeometry(360)
    setup(destinations(), false, { left: 60, top: 150, bottom: 150 })
    const root = screen.getByRole('menu', { name: 'Actions for Mei Ting' })
    const add = within(root).getByRole('menuitem', { name: /Add to department/ })
    const choices = openDestinations()

    expect(root).not.toBeVisible()
    expect(choices).toHaveStyle({ left: '60px', top: '150px' })
    const ir = within(choices).getByRole('menuitem', { name: 'IR' })
    fireEvent.click(ir)
    const titles = screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
    expect(choices).not.toBeVisible()
    expect(titles).toHaveStyle({ left: '60px', top: '150px' })
    fireEvent.click(within(titles).getByRole('menuitem', { name: /Back/ }))
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to IR as' })).not.toBeInTheDocument()
    expect(choices).toBeVisible()
    expect(ir).toHaveFocus()
    fireEvent.click(within(choices).getByRole('menuitem', { name: /Back/ }))
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to department' })).not.toBeInTheDocument()
    expect(root).toBeVisible()
    expect(add).toHaveFocus()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it.each(['click', 'ArrowRight'])('requires explicit %s to replace a narrow menu and keeps focus visible', activation => {
    menuGeometry(360)
    setup(destinations(), false, { left: 60, top: 150, bottom: 150 })
    const root = screen.getByRole('menu', { name: 'Actions for Mei Ting' })
    const add = within(root).getByRole('menuitem', { name: /Add to department/ })
    const activate = (item: HTMLElement) => activation === 'click'
      ? fireEvent.click(item) : fireEvent.keyDown(item, { key: 'ArrowRight' })

    expect(add).toHaveFocus()
    fireEvent.mouseEnter(add)
    expect(root).toBeVisible()
    expect(add).toHaveFocus()
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to department' })).not.toBeInTheDocument()
    expect(actions.addMember).not.toHaveBeenCalled()

    activate(add)
    const departments = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    expect(root).not.toBeVisible()
    expect(document.activeElement).toBeVisible()
    const ir = within(departments).getByRole('menuitem', { name: 'IR' })
    expect(ir).toHaveFocus()
    fireEvent.mouseEnter(ir)
    expect(departments).toBeVisible()
    expect(ir).toHaveFocus()
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to IR as' })).not.toBeInTheDocument()
    expect(actions.addMember).not.toHaveBeenCalled()

    activate(ir)
    const titles = screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
    expect(departments).not.toBeVisible()
    expect(titles).toBeVisible()
    expect(document.activeElement).toBeVisible()
    const specialist = within(titles).getByRole('menuitem', { name: 'Revenue Specialist' })
    expect(specialist).toHaveFocus()
    expect(specialist).toBeVisible()
    fireEvent.mouseEnter(specialist)
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it('flips the title submenu to the left near the viewport edge', () => {
    menuGeometry(800)
    setup(destinations(), true, { left: 500, top: 150, bottom: 150 })
    const choices = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    const ir = within(choices).getByRole('menuitem', { name: 'IR' })
    const rowTop = ir.getBoundingClientRect().top
    fireEvent.click(ir)
    const titles = screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
    expect(titles).toHaveStyle({ left: '261px', top: `${rowTop}px` })
    expect(titles.getBoundingClientRect().right).toBe(choices.getBoundingClientRect().left + 1)
    expect(choices).toBeVisible()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it('keeps a scrolled submenu open but dismisses on a scroll outside the cascade', () => {
    const { onClose } = setup()
    const titles = openTitles()
    fireEvent.scroll(titles)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(screen.getByRole('menu', { name: 'Add Mei Ting to department' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(screen.getByRole('menu', { name: 'Actions for Mei Ting' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it('waits for an explicit destination title choice and preserves the existing membership', async () => {
    const options = destinations()
    const original = structuredClone(options)
    const { onAdded } = setup(options)
    const departments = openDestinations()
    expect(within(departments).getByRole('menuitem', { name: 'Fair' })).toBeDisabled()
    expect(within(departments).getByRole('menuitem', { name: 'Events' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Team Leader' })).not.toBeInTheDocument()
    const ir = within(departments).getByRole('menuitem', { name: 'IR' })
    expect(ir).toHaveAttribute('aria-haspopup', 'menu')
    expect(actions.addMember).not.toHaveBeenCalled()
    fireEvent.click(ir)
    const titles = screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
    expect(actions.addMember).not.toHaveBeenCalled()
    expect(titles).toHaveTextContent('No upline is copied. Set it in IR after adding.')
    expect(within(titles).getByRole('menuitem', { name: 'Revenue Specialist' })).toHaveTextContent('Current title')
    const leader = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    expect(leader).not.toHaveTextContent('Current title')
    fireEvent.click(leader)

    await waitFor(() => expect(actions.addMember).toHaveBeenCalledOnce())
    const payload = actions.addMember.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({
      staff_id: 'mei', scheme_id: 'ir-scheme', title_id: 'leader',
    })
    await waitFor(() => expect(onAdded).toHaveBeenCalledExactlyOnceWith(
      'Mei Ting added to Revenue / IR as Team Leader. Set their upline in IR.'))
    expect(options).toEqual(original)
  })

  it('opens adjacent destination and title choices on hover without creating a membership', () => {
    setup()
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Add to department/ }))
    const departments = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    fireEvent.mouseEnter(within(departments).getByRole('menuitem', { name: 'IR' }))
    const titles = screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
    fireEvent.mouseEnter(within(titles).getByRole('menuitem', { name: 'Team Leader' }))
    expect(actions.addMember).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps a refused submission open and lets the user retry the selected title', async () => {
    actions.addMember.mockResolvedValueOnce({ ok: false, note: 'You no longer have access to this department.' })
    const { onClose, onAdded } = setup()
    const titles = openTitles()
    const leader = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    leader.focus()
    fireEvent.click(leader)

    expect(await screen.findByRole('alert')).toHaveTextContent('You no longer have access to this department.')
    expect(titles).toBeInTheDocument()
    const retry = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    await waitFor(() => expect(retry).toBeEnabled())
    expect(retry).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
    fireEvent.click(retry)
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce())
    expect(actions.addMember).toHaveBeenCalledTimes(2)
  })

  it('blocks repeated title submissions and changing destination while the first request is pending', async () => {
    let finish!: (result: { ok: true; note: null }) => void
    actions.addMember.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const { onAdded, onClose, onUpline } = setup([destination(), destination({ name: 'Events', schemeId: 'events-scheme' })])
    const titles = openTitles()
    const departments = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    const selected = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    fireEvent.click(selected)
    expect(selected).toBeDisabled()
    fireEvent.click(selected)
    const otherTitle = within(titles).getByRole('menuitem', { name: 'Revenue Specialist' })
    expect(otherTitle).toBeDisabled()
    fireEvent.click(otherTitle)
    const other = within(departments).getByRole('menuitem', { name: 'Events' })
    expect(other).toBeDisabled()
    fireEvent.click(other)
    fireEvent.mouseEnter(other)
    const upline = screen.getByRole('menuitem', { name: 'Change upline' })
    expect(upline).toBeDisabled()
    fireEvent.click(upline)
    fireEvent.keyDown(titles, { key: 'Escape' })
    fireEvent.pointerDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
    expect(onUpline).not.toHaveBeenCalled()
    expect(titles).toBeInTheDocument()
    expect(actions.addMember).toHaveBeenCalledOnce()
    expect(onAdded).not.toHaveBeenCalled()

    await act(async () => { finish({ ok: true, note: null }) })
    expect(onAdded).toHaveBeenCalledOnce()
  })

  it('dismisses the entire cascade on an outside pointer press without writing', () => {
    const { onClose, onAdded } = setup()
    openTitles()
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()
    expect(onAdded).not.toHaveBeenCalled()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it.each(['Escape', 'ArrowLeft'])('backs out one level with %s and returns focus to its parent item', key => {
    const { onClose } = setup()
    const add = screen.getByRole('menuitem', { name: /Add to department/ })
    fireEvent.keyDown(add, { key: 'ArrowRight' })
    const ir = within(screen.getByRole('menu', { name: 'Add Mei Ting to department' }))
      .getByRole('menuitem', { name: 'IR' })
    expect(ir).toHaveFocus()
    fireEvent.keyDown(ir, { key: 'ArrowRight' })
    const titles = screen.getByRole('menu', { name: 'Add Mei Ting to IR as' })
    const currentTitle = within(titles).getByRole('menuitem', { name: 'Revenue Specialist' })
    expect(currentTitle).toHaveFocus()
    fireEvent.keyDown(currentTitle, { key: 'ArrowDown' })
    expect(within(titles).getByRole('menuitem', { name: 'Team Leader' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key })
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to IR as' })).not.toBeInTheDocument()
    expect(ir).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(ir, { key })
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to department' })).not.toBeInTheDocument()
    expect(add).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(add, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it('starts at the department choices for a direct add action and Escape closes it', () => {
    const { onClose } = setup(destinations(), true)
    const departments = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    expect(screen.queryByRole('menu', { name: 'Actions for Mei Ting' })).not.toBeInTheDocument()
    expect(within(departments).getByRole('menuitem', { name: 'IR' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it.each([
    { reason: 'outside the allowed department', extra: { eligibleStaffIds: [] } },
    { reason: 'no titles configured', extra: { titles: [] } },
    { reason: 'unavailable destination', extra: { unavailableReason: 'Membership management unavailable' } },
  ])('cannot add a membership when $reason', ({ extra }) => {
    setup([destination(extra)])
    const unavailable = within(openDestinations()).getByRole('menuitem', { name: 'IR' })
    expect(unavailable).toBeDisabled()
    fireEvent.click(unavailable)
    fireEvent.mouseEnter(unavailable)
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to IR as' })).not.toBeInTheDocument()
    expect(actions.addMember).not.toHaveBeenCalled()
  })

  it.each([null, 'old-title'])('allows choosing a destination title when the current title is %s', async titleId => {
    const { onAdded } = setup([destination()], false, undefined, { ...person, titleId })
    const titles = openTitles()
    expect(within(titles).queryByText('Current title')).not.toBeInTheDocument()
    const leader = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    expect(leader).toBeEnabled()
    expect(actions.addMember).not.toHaveBeenCalled()
    fireEvent.click(leader)
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce())
    const payload = actions.addMember.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({ staff_id: 'mei', scheme_id: 'ir-scheme', title_id: 'leader' })
  })

  it('only marks matching title identity as current while allowing another title with the same name', async () => {
    const { onAdded } = setup([destination({ titles: [{ id: 'other-specialist', name: 'Revenue Specialist' }] })])
    const titles = openTitles()
    const other = within(titles).getByRole('menuitem', { name: 'Revenue Specialist' })
    expect(other).not.toHaveTextContent('Current title')
    fireEvent.click(other)
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce())
    const payload = actions.addMember.mock.calls[0][0] as FormData
    expect(payload.get('title_id')).toBe('other-specialist')
  })

  it('keeps Escape available when every destination is already joined', () => {
    const { onClose } = setup([destination({ memberStaffIds: ['mei'] })], true)
    const menu = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    expect(menu).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMember).not.toHaveBeenCalled()
  })
})

describe('PersonContextMenu current department title actions', () => {
  const currentDepartment = { schemeId: 'ir-scheme', name: 'IR', isHome: false }
  const currentDestinations = () => destinations().map(item => item.schemeId === currentDepartment.schemeId
    ? { ...item, memberStaffIds: ['mei'] } : item)

  function openCurrentTitles() {
    fireEvent.click(screen.getByRole('menuitem', { name: /Change title/ }))
    return screen.getByRole('menu', { name: 'Change Mei Ting title in IR' })
  }

  it('changes only the current membership title after an explicit title selection', async () => {
    const { onAdded, onUpline } = setup(currentDestinations(), false, undefined, person, currentDepartment)
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Change title/ }))
    const titles = screen.getByRole('menu', { name: 'Change Mei Ting title in IR' })
    const current = within(titles).getByRole('menuitem', { name: 'Revenue Specialist' })
    expect(current).toBeDisabled()
    expect(current).toHaveTextContent('Current title')
    fireEvent.click(current)
    expect(actions.changeMemberTitle).not.toHaveBeenCalled()
    const leader = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    fireEvent.mouseEnter(leader)
    expect(actions.changeMemberTitle).not.toHaveBeenCalled()
    fireEvent.click(leader)

    await waitFor(() => expect(actions.changeMemberTitle).toHaveBeenCalledOnce())
    const payload = actions.changeMemberTitle.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({ staff_id: 'mei', scheme_id: 'ir-scheme', title_id: 'leader' })
    await waitFor(() => expect(onAdded).toHaveBeenCalledExactlyOnceWith('Mei Ting is now Team Leader in IR.'))
    expect(actions.addMember).not.toHaveBeenCalled()
    expect(onUpline).not.toHaveBeenCalled()
  })

  it('backs out of title changes to the visible focused Change title row', () => {
    menuGeometry(360)
    setup(currentDestinations(), false, { left: 60, top: 150, bottom: 150 }, person, currentDepartment)
    const change = screen.getByRole('menuitem', { name: /Change title/ })
    change.focus()
    fireEvent.mouseEnter(change)
    expect(screen.queryByRole('menu', { name: 'Change Mei Ting title in IR' })).not.toBeInTheDocument()
    expect(change).toHaveFocus()
    expect(change).toBeVisible()
    fireEvent.keyDown(change, { key: 'ArrowRight' })
    const titles = screen.getByRole('menu', { name: 'Change Mei Ting title in IR' })
    expect(document.activeElement).toBeVisible()
    fireEvent.keyDown(titles, { key: 'Escape' })
    expect(change).toBeVisible()
    expect(change).toHaveFocus()
    expect(actions.changeMemberTitle).not.toHaveBeenCalled()
  })

  it('refuses to edit the home company title from the membership menu', () => {
    setup(destinations(), false, undefined, person, { schemeId: 'fair-scheme', name: 'Fair', isHome: true })
    const change = screen.getByRole('menuitem', { name: /Change title/ })
    expect(change).toBeDisabled()
    expect(change).toHaveTextContent('Company title is managed in People Management.')
    fireEvent.click(change)
    expect(screen.queryByRole('menu', { name: 'Change Mei Ting title in Fair' })).not.toBeInTheDocument()
    expect(actions.changeMemberTitle).not.toHaveBeenCalled()
  })

  it.each([
    { reason: 'no matching destination', options: [] },
    { reason: 'no configured titles', options: [destination({ titles: [] })] },
  ])('disables title changes with $reason', ({ options }) => {
    setup(options, false, undefined, person, currentDepartment)
    const change = screen.getByRole('menuitem', { name: /Change title/ })
    expect(change).toBeDisabled()
    fireEvent.click(change)
    expect(actions.changeMemberTitle).not.toHaveBeenCalled()
  })

  it('keeps a failed title change available for retry without adding another membership', async () => {
    actions.changeMemberTitle.mockResolvedValueOnce({ ok: false, note: 'This title cannot hold the existing team.' })
    const { onAdded, onClose } = setup(currentDestinations(), false, undefined, person, currentDepartment)
    const titles = openCurrentTitles()
    const leader = within(titles).getByRole('menuitem', { name: 'Team Leader' })
    leader.focus()
    fireEvent.click(leader)
    expect(await screen.findByRole('alert')).toHaveTextContent('This title cannot hold the existing team.')
    await waitFor(() => expect(leader).toBeEnabled())
    expect(leader).toHaveFocus()
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(leader)
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce())
    expect(actions.changeMemberTitle).toHaveBeenCalledTimes(2)
    expect(actions.addMember).not.toHaveBeenCalled()
  })
})
