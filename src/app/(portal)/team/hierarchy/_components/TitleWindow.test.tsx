import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RoleRung, RoleTitle } from '@/lib/hierarchy-roles'

// A title, made or edited from Hierarchy › People & roles (2026-10-10).

const actions = vi.hoisted(() => ({ createTitle: vi.fn(), updateTitle: vi.fn(), deleteTitle: vi.fn() }))
vi.mock('../title-actions', () => actions)
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import TitleWindow from './TitleWindow'

const rungs: RoleRung[] = [{ id: 'l7', rank: 7, name: 'Senior Manager' }, { id: 'l9', rank: 9, name: 'Management' }]
const departments = [{ id: 'rev', name: 'Revenue Department' }, { id: 'hr', name: 'HR' }]
const leader: RoleTitle = {
  id: 'tl', name: 'Team Leader', departmentId: 'rev', departmentName: 'Revenue Department', levelId: 'l7',
  isActive: true, isDepartmentHead: false, templateId: 't1', templateName: 'Revenue Team',
}
const open = (title: RoleTitle | null, people = 0, canDelete = true) => {
  const onClose = vi.fn()
  render(<TitleWindow title={title} people={people} rungs={rungs} departments={departments} canDelete={canDelete} onClose={onClose} />)
  return onClose
}

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ok: true })
  flash.mockReset()
})
afterEach(cleanup)

describe('the title window', () => {
  it('makes a new title with its department and level', async () => {
    const onClose = open(null)
    expect(screen.getByRole('heading', { name: 'New title' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Active/)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('e.g. Team Leader'), { target: { value: 'Area Manager' } })
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'rev' } })
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'l9' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })))
    expect(actions.createTitle).toHaveBeenCalledWith({ id: undefined, name: 'Area Manager', departmentId: 'rev', levelId: 'l9', isActive: true, isDepartmentHead: false })
    expect(flash).toHaveBeenCalledWith('Area Manager created')
    expect(onClose).toHaveBeenCalled()
  })

  it('edits a title, its ladder ordered top down, and shows a refusal in place', async () => {
    actions.updateTitle.mockResolvedValue({ ok: false, reason: 'That department already has a title by that name' })
    const onClose = open(leader, 5)
    expect(screen.getByText('5 people hold it. What it may do is its permission template.')).toBeInTheDocument()
    expect([...(screen.getByLabelText('Level') as HTMLSelectElement).options].map(o => o.text)).toEqual([
      'Not on the ladder', 'L9 · Management', 'L7 · Senior Manager',
    ])
    expect(screen.getByRole('link', { name: 'Revenue Team →' })).toHaveAttribute('href', '/team/people?tab=permissions&template=t1')
    fireEvent.click(screen.getByLabelText(/^Active/))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(actions.updateTitle).toHaveBeenCalledWith({ id: 'tl', name: 'Team Leader', departmentId: 'rev', levelId: 'l7', isActive: false, isDepartmentHead: false })
    expect(screen.getByRole('alert')).toHaveTextContent('That department already has a title by that name')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('deletes only a title nobody holds, and only for whoever may', async () => {
    open(leader, 5)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    cleanup()
    const onClose = open(leader, 0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })))
    expect(actions.deleteTitle).toHaveBeenCalledWith('tl')
    expect(onClose).toHaveBeenCalled()
    cleanup()
    open(leader, 0, false)
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})
