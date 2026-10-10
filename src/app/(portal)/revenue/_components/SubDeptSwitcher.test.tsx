import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// The sub-department switcher (2026-10-10, the HR revamp): Fair | IR left the
// sidebar for it. Picking one opens the SAME page for it and remembers it;
// "+ New sub-department" answers with where the new one lives — or why not.

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const act = vi.hoisted(() => ({ newSubDepartment: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn() }) }))
vi.mock('../config-actions', () => ({ newSubDepartment: act.newSubDepartment }))

import SubDeptSwitcher from './SubDeptSwitcher'
import type { SwitcherData } from '../_lib/switcher'

const data = (canCreate = true): SwitcherData => ({
  current: { slug: 'fair', name: 'Fair', schemeId: 's-fair', departmentId: 'd-rev' },
  subs: [
    { slug: 'fair', name: 'Fair' },
    { slug: 'ir', name: 'IR' },
  ],
  canCreate,
  departments: [{ id: 'd-rev', name: 'Revenue' }],
})

beforeEach(() => {
  vi.clearAllMocks()
  document.cookie = 'vp-rev-sub=; Max-Age=0; Path=/'
})

describe('SubDeptSwitcher', () => {
  it('names the open one and remembers it for the sidebar', () => {
    render(<SubDeptSwitcher data={data()} view="cc" />)
    expect(screen.getByRole('button', { name: /Sub-department\s*Fair/ })).toBeInTheDocument()
    expect(document.cookie).toContain('vp-rev-sub=fair')
  })

  it('lists each one with ✓ on the open one, and opens the same page for another', () => {
    render(<SubDeptSwitcher data={data()} view="rules" />)
    fireEvent.click(screen.getByRole('button', { name: /Sub-department/ }))
    expect(screen.getByRole('menuitemradio', { name: /Fair/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /IR/ }))
    expect(nav.push).toHaveBeenCalledWith('/revenue/ir/rules')
    expect(document.cookie).toContain('vp-rev-sub=ir')
  })

  it('offers + New sub-department only to whoever may create one', () => {
    const { unmount } = render(<SubDeptSwitcher data={data(false)} view="cc" />)
    fireEvent.click(screen.getByRole('button', { name: /Sub-department/ }))
    expect(screen.queryByText('+ New sub-department')).toBeNull()
    unmount()
    render(<SubDeptSwitcher data={data(true)} view="sg" />)
    fireEvent.click(screen.getByRole('button', { name: /Sub-department/ }))
    expect(screen.getByText(/Copy Fair's rules, or start blank/)).toBeInTheDocument()
  })

  it('creates one as a copy of the open one’s rules and opens it', async () => {
    act.newSubDepartment.mockResolvedValue({ ok: true, slug: 'showroom' })
    render(<SubDeptSwitcher data={data()} view="sg" />)
    fireEvent.click(screen.getByRole('button', { name: /Sub-department/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New sub-department/ }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Showroom'), { target: { value: 'Showroom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/revenue/showroom/hierarchy'))
    const fd = act.newSubDepartment.mock.calls[0][0] as FormData
    expect(fd.get('clone_from_scheme_id')).toBe('s-fair')
    expect(fd.get('department_id')).toBe('d-rev')
  })

  it('says why not, as the action answers', async () => {
    act.newSubDepartment.mockResolvedValue({ ok: false, reason: '"Fair" and "Fair" would share the address /revenue/fair' })
    render(<SubDeptSwitcher data={data()} view="cc" />)
    fireEvent.click(screen.getByRole('button', { name: /Sub-department/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New sub-department/ }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Showroom'), { target: { value: 'Fair' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start blank' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText(/would share the address/)).toBeInTheDocument()
    expect((act.newSubDepartment.mock.calls[0][0] as FormData).get('clone_from_scheme_id')).toBeNull()
    expect(nav.push).not.toHaveBeenCalled()
  })
})
