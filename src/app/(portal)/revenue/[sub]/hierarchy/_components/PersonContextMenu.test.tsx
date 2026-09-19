import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import PersonContextMenu from './PersonContextMenu'

const actions = vi.hoisted(() => ({ addMemberWithCurrentTitle: vi.fn() }))
vi.mock('../../../hierarchy-actions', () => actions)

const person = { staffId: 'mei', name: 'Mei Ting', titleId: 'specialist' as string | null, titleName: 'Revenue Specialist' }

function destination(extra: Partial<MembershipDestination> = {}): MembershipDestination {
  return {
    subDepartmentId: 'ir', name: 'IR', slug: 'ir', departmentId: 'revenue',
    departmentName: 'Revenue', schemeId: 'ir-scheme', isHome: false,
    titles: [{ id: 'specialist', name: 'Revenue Specialist' }, { id: 'leader', name: 'Team Leader' }],
    memberStaffIds: [], eligibleStaffIds: ['mei'], unavailableReason: null,
    ...extra,
  }
}

function destinations(): MembershipDestination[] {
  return [
    destination({
      subDepartmentId: 'fair', name: 'Fair', slug: 'fair', schemeId: 'fair-scheme',
      isHome: true, memberStaffIds: ['mei'], titles: [{ id: 'specialist', name: 'Revenue Specialist' }],
    }),
    destination(),
    destination({ subDepartmentId: 'events', name: 'Events', slug: 'events', schemeId: 'events-scheme', memberStaffIds: ['mei'] }),
  ]
}

function setup(options: MembershipDestination[] = destinations(), startAtDepartments = false,
  anchor = { left: 200, top: 150, bottom: 150 }, selectedPerson = person) {
  const onClose = vi.fn(), onAdded = vi.fn(), onUpline = vi.fn()
  render(<PersonContextMenu person={selectedPerson} sourceSchemeId="fair-scheme" destinations={options} anchor={anchor}
    startAtDepartments={startAtDepartments} onClose={onClose} onAdded={onAdded} onUpline={onUpline} />)
  return { onClose, onAdded, onUpline }
}

function openDestinations() {
  fireEvent.click(within(screen.getByRole('menu', { name: 'Actions for Mei Ting' }))
    .getByRole('menuitem', { name: /Add to department/ }))
  return screen.getByRole('menu', { name: 'Add Mei Ting to department' })
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.addMemberWithCurrentTitle.mockResolvedValue({ ok: true, note: null })
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
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it('replaces the parent when neither side fits, and Back restores its visible focused row', () => {
    menuGeometry(360)
    setup(destinations(), false, { left: 60, top: 150, bottom: 150 })
    const root = screen.getByRole('menu', { name: 'Actions for Mei Ting' })
    const add = within(root).getByRole('menuitem', { name: /Add to department/ })
    const choices = openDestinations()

    expect(root).not.toBeVisible()
    expect(choices).toHaveStyle({ left: '60px', top: '150px' })
    fireEvent.click(within(choices).getByRole('menuitem', { name: /Back/ }))
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to department' })).not.toBeInTheDocument()
    expect(root).toBeVisible()
    expect(add).toHaveFocus()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it('keeps a scrolled submenu open but dismisses on a scroll outside the cascade', () => {
    const { onClose } = setup()
    const departments = openDestinations()
    fireEvent.scroll(departments)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(screen.getByRole('menu', { name: 'Actions for Mei Ting' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it('adds to the clicked destination using the source membership without offering a title change', async () => {
    const options = destinations()
    const original = structuredClone(options)
    const { onAdded } = setup(options)
    const departments = openDestinations()
    expect(within(departments).getByRole('menuitem', { name: 'Fair' })).toBeDisabled()
    expect(within(departments).getByRole('menuitem', { name: 'Events' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Team Leader' })).not.toBeInTheDocument()
    const ir = within(departments).getByRole('menuitem', { name: 'IR' })
    expect(ir).toHaveTextContent('Revenue Specialist')
    expect(ir).not.toHaveAttribute('aria-haspopup')
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
    fireEvent.click(ir)

    await waitFor(() => expect(actions.addMemberWithCurrentTitle).toHaveBeenCalledOnce())
    const payload = actions.addMemberWithCurrentTitle.mock.calls[0][0] as FormData
    expect(Object.fromEntries(payload.entries())).toEqual({
      staff_id: 'mei', source_scheme_id: 'fair-scheme', scheme_id: 'ir-scheme',
    })
    await waitFor(() => expect(onAdded).toHaveBeenCalledExactlyOnceWith(
      'Mei Ting added to Revenue / IR. Existing memberships are kept.'))
    expect(options).toEqual(original)
  })

  it('opens destinations on hover without creating a membership or a title submenu', () => {
    setup()
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Add to department/ }))
    const departments = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    fireEvent.mouseEnter(within(departments).getByRole('menuitem', { name: 'IR' }))
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to IR as' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Team Leader' })).not.toBeInTheDocument()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps a refused submission open and lets the user retry the same destination', async () => {
    actions.addMemberWithCurrentTitle.mockResolvedValueOnce({ ok: false, note: 'You no longer have access to this department.' })
    const { onClose, onAdded } = setup()
    const departments = openDestinations()
    fireEvent.click(within(departments).getByRole('menuitem', { name: 'IR' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You no longer have access to this department.')
    expect(departments).toBeInTheDocument()
    const retry = within(departments).getByRole('menuitem', { name: 'IR' })
    await waitFor(() => expect(retry).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
    fireEvent.click(retry)
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce())
    expect(actions.addMemberWithCurrentTitle).toHaveBeenCalledTimes(2)
  })

  it('blocks repeated destination submissions while the first request is pending', async () => {
    let finish!: (result: { ok: true; note: null }) => void
    actions.addMemberWithCurrentTitle.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const { onAdded } = setup([destination(), destination({ name: 'Events', schemeId: 'events-scheme' })])
    const departments = openDestinations()
    const selected = within(departments).getByRole('menuitem', { name: 'IR' })
    fireEvent.click(selected)
    expect(selected).toBeDisabled()
    fireEvent.click(selected)
    const other = within(departments).getByRole('menuitem', { name: 'Events' })
    expect(other).toBeDisabled()
    fireEvent.click(other)
    expect(actions.addMemberWithCurrentTitle).toHaveBeenCalledOnce()
    expect(onAdded).not.toHaveBeenCalled()

    await act(async () => { finish({ ok: true, note: null }) })
    expect(onAdded).toHaveBeenCalledOnce()
  })

  it('dismisses the entire cascade on an outside pointer press without writing', () => {
    const { onClose, onAdded } = setup()
    openDestinations()
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()
    expect(onAdded).not.toHaveBeenCalled()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it.each(['Escape', 'ArrowLeft'])('backs out one level with %s and returns focus to its parent item', key => {
    const { onClose } = setup()
    const add = screen.getByRole('menuitem', { name: /Add to department/ })
    fireEvent.keyDown(add, { key: 'ArrowRight' })
    const ir = within(screen.getByRole('menu', { name: 'Add Mei Ting to department' }))
      .getByRole('menuitem', { name: 'IR' })
    expect(ir).toHaveFocus()
    fireEvent.keyDown(ir, { key })
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to department' })).not.toBeInTheDocument()
    expect(add).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(add, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it('starts at the department choices for a direct add action and Escape closes it', () => {
    const { onClose } = setup(destinations(), true)
    const departments = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    expect(screen.queryByRole('menu', { name: 'Actions for Mei Ting' })).not.toBeInTheDocument()
    expect(within(departments).getByRole('menuitem', { name: 'IR' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it.each([
    { reason: 'outside the allowed department', extra: { eligibleStaffIds: [] } },
    { reason: 'no titles configured', extra: { titles: [] } },
    { reason: 'the current title is not in the destination ladder', extra: { titles: [{ id: 'leader', name: 'Team Leader' }] } },
    { reason: 'a title has the same name but a different identity', extra: { titles: [{ id: 'other-specialist', name: 'Revenue Specialist' }] } },
    { reason: 'unavailable destination', extra: { unavailableReason: 'Membership management unavailable' } },
  ])('cannot add a membership when $reason', ({ extra }) => {
    setup([destination(extra)])
    const unavailable = within(openDestinations()).getByRole('menuitem', { name: 'IR' })
    expect(unavailable).toBeDisabled()
    fireEvent.click(unavailable)
    fireEvent.mouseEnter(unavailable)
    expect(screen.queryByRole('menu', { name: 'Add Mei Ting to IR as' })).not.toBeInTheDocument()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it('disables destinations if the source membership has no title', () => {
    setup([destination()], false, undefined, { ...person, titleId: null })
    const unavailable = within(openDestinations()).getByRole('menuitem', { name: 'IR' })
    expect(unavailable).toBeDisabled()
    fireEvent.click(unavailable)
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })

  it('keeps Escape available when every destination is already joined', () => {
    const { onClose } = setup([destination({ memberStaffIds: ['mei'] })], true)
    const menu = screen.getByRole('menu', { name: 'Add Mei Ting to department' })
    expect(menu).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.addMemberWithCurrentTitle).not.toHaveBeenCalled()
  })
})
